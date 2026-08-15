// POST { playerId, fromDate, toDate, workspace }
// Moves an uncompleted saved session to a new date without changing its content.

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { normExName } from '../players/progression';
import {
  exhistKey,
  exweightKey,
  feedbackKey,
  gymTonnageDatesKey,
  gymTonnageKey,
  pfx,
  scheduleKey,
  sessionKey,
  sessionsKey,
} from '../../../lib/workspacePrefix';
import { usesSeasonCalendar } from '../../../lib/workspacePolicy.mjs';
import { loadUnitsForExercise, weightKgFromExercise } from '../../../lib/tonnage';
import { resolveSeasonSession } from '../../../lib/seasonPolicy.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRecord(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return null; }
}

function hasPlayerProgress(raw) {
  const log = parseRecord(raw);
  if (!log) return false;
  return Object.values(log.done || {}).some(Boolean)
    || Object.values(log.weights || {}).some(value => String(value || '').trim() !== '');
}

function previousDate(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, fromDate, toDate, workspace = 'zarechie' } = req.body || {};
  if (!playerId || !DATE_RE.test(String(fromDate || '')) || !DATE_RE.test(String(toDate || ''))) {
    return res.status(400).json({ error: 'playerId, fromDate and toDate are required' });
  }
  if (fromDate === toDate) return res.status(400).json({ error: 'Выберите другую дату' });

  const prefix = pfx(workspace);
  const sourceKey = sessionKey(workspace, playerId, fromDate);
  const targetKey = sessionKey(workspace, playerId, toDate);
  const sourceVersionsKey = `${sourceKey}:versions`;
  const targetVersionsKey = `${targetKey}:versions`;
  const actualKey = `${prefix}:session:actual:${playerId}:${fromDate}`;
  const playerLogKey = `${prefix}:log:${playerId}:${fromDate}`;

  try {
    const [sourceRaw, targetRaw, feedbackRaw, actualRaw, playerLogRaw, sourceTonnage, versions, rawSchedule, rawPreviousMatchLoad] = await Promise.all([
      redis('get', sourceKey),
      redis('get', targetKey),
      redis('get', feedbackKey(workspace, playerId, fromDate)),
      redis('get', actualKey),
      redis('get', playerLogKey),
      redis('get', gymTonnageKey(workspace, playerId, fromDate)),
      redis('lrange', sourceVersionsKey, 0, -1),
      usesSeasonCalendar(workspace) ? redis('get', scheduleKey(workspace)).catch(() => null) : Promise.resolve(null),
      usesSeasonCalendar(workspace) ? redis('get', `${prefix}:match_load:${previousDate(toDate)}`).catch(() => null) : Promise.resolve(null),
    ]);

    const source = parseRecord(sourceRaw);
    if (!source?.session) return res.status(404).json({ error: 'Исходная тренировка не найдена' });
    if (targetRaw) return res.status(409).json({ error: 'На выбранную дату уже есть сохранённая тренировка' });
    if (feedbackRaw || actualRaw || hasPlayerProgress(playerLogRaw)) {
      return res.status(409).json({ error: 'Тренировка уже отмечена как выполненная и не может быть перенесена' });
    }
    if (usesSeasonCalendar(workspace)) {
      const events = parseRecord(rawSchedule) || [];
      const previousLoads = parseRecord(rawPreviousMatchLoad) || {};
      const targetDecision = resolveSeasonSession({
        events,
        targetDate: toDate,
        requestedFocus: source.focus || 'inseason_strength',
        requestedTrainingType: source.trainingType || 'full_body',
        previousMatchLoad: previousLoads?.[String(playerId)] || null,
      });
      if (targetDecision.overridden) {
        return res.status(409).json({
          error: `На ${toDate} нужен другой тип сессии: ${targetDecision.label}. ${targetDecision.reason} Создайте программу заново на целевую дату.`,
          seasonDecision: targetDecision,
        });
      }
    }

    const movedAt = new Date().toISOString();
    const rescheduleHistory = [
      ...(Array.isArray(source.rescheduleHistory) ? source.rescheduleHistory : []),
      { fromDate, toDate, movedAt },
    ].slice(-10);
    const movedRecord = {
      ...source,
      date: toDate,
      savedAt: movedAt,
      rescheduledFrom: fromDate,
      rescheduledAt: movedAt,
      rescheduleHistory,
    };

    const exercises = [];
    const seenExercises = new Set();
    for (const block of source.session.blocks || []) {
      for (const exercise of block.exercises || []) {
        if (!exercise?.name) continue;
        const normalized = normExName(exercise.name);
        if (!normalized || seenExercises.has(normalized)) continue;
        seenExercises.add(normalized);
        exercises.push({ exercise, normalized });
      }
    }
    const latestWeightDates = await Promise.all(
      exercises.map(({ normalized }) => redis('hget', exweightKey(workspace, playerId, normalized), 'date').catch(() => null))
    );

    const dateScore = parseInt(toDate.replace(/-/g, ''), 10);
    const cmds = [
      ['SET', targetKey, JSON.stringify(movedRecord)],
      ['ZADD', sessionsKey(workspace, playerId), dateScore, toDate],
      ['ZREM', sessionsKey(workspace, playerId), fromDate],
      ['DEL', sourceKey],
      ['DEL', playerLogKey],
    ];

    // Preserve the audit trail with the moved session rather than leaving it at the old date.
    if (Array.isArray(versions) && versions.length) {
      cmds.push(['DEL', targetVersionsKey]);
      cmds.push(['RPUSH', targetVersionsKey, ...versions]);
    }
    cmds.push(['DEL', sourceVersionsKey]);

    if (sourceTonnage != null) {
      cmds.push(['SET', gymTonnageKey(workspace, playerId, toDate), String(sourceTonnage)]);
      cmds.push(['ZADD', gymTonnageDatesKey(workspace, playerId), dateScore, toDate]);
      cmds.push(['DEL', gymTonnageKey(workspace, playerId, fromDate)]);
      cmds.push(['ZREM', gymTonnageDatesKey(workspace, playerId), fromDate]);
    }

    // The planned weights are date-indexed too; move their history fields with the session.
    for (const [{ exercise, normalized }, latestDate] of exercises.map((item, index) => [item, latestWeightDates[index]])) {
      const kg = weightKgFromExercise(exercise);
      const historyKey = exhistKey(workspace, playerId, normalized);
      const weightKey = exweightKey(workspace, playerId, normalized);
      if (kg > 0) {
        cmds.push(['HSET', historyKey, toDate, String(kg)]);
        cmds.push(['HDEL', historyKey, fromDate]);
      }
      // Do not overwrite a more recent actual performance record for this exercise.
      if (String(latestDate || '') === fromDate) {
        cmds.push(['HSET', weightKey, 'date', toDate, 'loadUnits', String(loadUnitsForExercise(exercise))]);
      }
    }

    await redisPipeline(cmds);
    return res.status(200).json({ ok: true, record: movedRecord });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Не удалось перенести тренировку' });
  }
}
