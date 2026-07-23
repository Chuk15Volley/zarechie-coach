// pages/api/programs/save.js
// POST { playerId, date, session, player, dataSummary, dayGoal } → persists a session.
// Also maintains a sorted set coach:sessions:{playerId} (score = YYYYMMDD integer) so
// getRecentSessionSummaries() can fetch the N most recent dates in one ZRANGE call.
// Writes per-exercise weight records (coach:exweight:{playerId}:{normName}) for progression.
// Writes per-exercise weight history (coach:exhist:{playerId}:{normName}) HASH field=date value=kg.

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { normExName } from '../players/progression';
import { sessionKey, sessionsKey, exweightKey, exhistKey, gymTonnageKey, gymTonnageDatesKey } from '../../../lib/workspacePrefix';
import { loadUnitsForExercise, weightKgFromExercise } from '../../../lib/tonnage';

function formatKg(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function targetSetReps(value) {
  const multiple = String(value || '').match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (multiple) return parseInt(multiple[1], 10) * parseInt(multiple[2], 10);
  return parseInt(value, 10) || 0;
}

function normalizeSavedWeights(session) {
  if (!session?.blocks) return session;
  return {
    ...session,
    blocks: session.blocks.map(block => ({
      ...block,
      exercises: (block.exercises || []).map(ex => {
        const kg = formatKg(weightKgFromExercise(ex));
        const normalized = { ...ex, ...(kg ? { weightKg: parseFloat(kg) } : {}), loadUnits: loadUnitsForExercise(ex) };
        if (!kg || String(ex.weightNote || '').trim()) return normalized;
        return { ...normalized, weightNote: `${kg} кг` };
      }),
    })),
  };
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { playerId, date, session, player, dataSummary, dayGoal, workspace = 'zarechie' } = req.body || {};
  if (!playerId || !date || !session) {
    return res.status(400).json({ error: 'playerId, date and session are required' });
  }

  const normalizedSession = normalizeSavedWeights(session);

  const record = {
    session: normalizedSession,
    player: player || null,
    dataSummary: dataSummary || '',
    dayGoal: dayGoal || '',
    date,
    savedAt: new Date().toISOString(),
  };

  // Score is the date as a plain integer (20260618) — sorts chronologically.
  const dateScore = parseInt(date.replace(/-/g, ''), 10);

  // Collect per-exercise weight records and history entries to write in one pipeline.
  const exweightCmds = [];
  for (const block of normalizedSession.blocks || []) {
    for (const ex of block.exercises || []) {
      const kg = weightKgFromExercise(ex);
      if (!kg || kg <= 0 || !ex.name) continue;
      const norm = normExName(ex.name);
      exweightCmds.push(['HSET', exweightKey(workspace, playerId, norm), 'kg', String(kg), 'date', date, 'loadUnits', String(loadUnitsForExercise(ex))]);
      exweightCmds.push(['HSET', exhistKey(workspace, playerId, norm), date, String(kg)]);
    }
  }

  // Weight is per implement; loadUnits is one or two DB/KB.
  let totalTonnage = 0;
  for (const block of normalizedSession.blocks || []) {
    for (const ex of block.exercises || []) {
      const kg = weightKgFromExercise(ex);
      const targetSets = Array.isArray(ex.targetSets) ? ex.targetSets : [];
      const totalReps = targetSets.length
        ? targetSets.reduce((total, set) => total + targetSetReps(set), 0)
        : (parseInt(ex.sets, 10) || 3) * (parseInt(ex.reps, 10) || 8);
      if (kg > 0) totalTonnage += kg * loadUnitsForExercise(ex) * totalReps;
    }
  }
  const tonnageCmds = [];
  if (totalTonnage > 0) {
    tonnageCmds.push(['SET', gymTonnageKey(workspace, playerId, date), String(Math.round(totalTonnage))]);
    tonnageCmds.push(['ZADD', gymTonnageDatesKey(workspace, playerId), dateScore, date]);
  }

  try {
    const versionEntry = JSON.stringify({ ...record, savedAt: new Date().toISOString() });
    const versionsKey = `${sessionKey(workspace, playerId, date)}:versions`;
    const cmds = [
      ['SET', sessionKey(workspace, playerId, date), JSON.stringify(record)],
      ['ZADD', sessionsKey(workspace, playerId), dateScore, date],
      // #14: Audit trail — keep up to 10 versions per session (newest first)
      ['LPUSH', versionsKey, versionEntry],
      ['LTRIM', versionsKey, '0', '9'],
      ...exweightCmds,
      ...tonnageCmds,
    ];
    await redisPipeline(cmds);
    return res.status(200).json({ status: 'ok' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
