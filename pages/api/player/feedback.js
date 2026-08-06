// pages/api/player/feedback.js
// POST { token, date, rpe, fatigue, feel, note } → saves player workout feedback to Redis.
// Auth: share token (validates player without exposing playerId).
// Also updates per-exercise weight records with RPE for auto-progression.

import { redis, redisPipeline } from '../../../lib/redis';
import { normExName } from '../players/progression';
import { updateExerciseMemory, linkPainToExercises } from '../../../lib/exerciseMemory';
import { resolveShareToken } from '../../../lib/shareToken';
import {
  exhistKey,
  exweightKey,
  feedbackKey,
  gymTonnageDatesKey,
  gymTonnageKey,
  pfx,
  sessionKey,
} from '../../../lib/workspacePrefix';
import { loadUnitsForExercise, weightKgFromExercise } from '../../../lib/tonnage';
import { sanitizeUnavailableEquipmentExercises } from '../../../lib/equipmentRestrictions.mjs';

function targetSetReps(value) {
  const multiple = String(value || '').match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (multiple) return parseInt(multiple[1], 10) * parseInt(multiple[2], 10);
  const simple = String(value || '').trim().match(/^(\d+)$/);
  return simple ? parseInt(simple[1], 10) : 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { token, date, rpe, fatigue, feel, note, doms, soreness, painAreas = [], done: submittedDone, weights: submittedWeights } = req.body || {};
  if (!token || !date || rpe == null || fatigue == null) {
    return res.status(400).json({ error: 'token, date, rpe, fatigue required' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: 'invalid date' });

  const resolved = await resolveShareToken(token);
  if (!resolved?.playerId) return res.status(401).json({ error: 'invalid token' });
  const { playerId, workspace } = resolved;

  const rpeNum = Number(rpe);
  const fatigueNum = Number(fatigue);
  if (!Number.isInteger(rpeNum) || rpeNum < 1 || rpeNum > 10) {
    return res.status(400).json({ error: 'rpe must be 1-10' });
  }
  if (!Number.isInteger(fatigueNum) || fatigueNum < 1 || fatigueNum > 5) {
    return res.status(400).json({ error: 'fatigue must be 1-5' });
  }

  const key = feedbackKey(workspace, playerId, date);
  const previousRaw = await redis('get', key).catch(() => null);
  const record = {
    date: String(date),
    rpe: rpeNum,
    fatigue: fatigueNum,
    feel: feel || null,
    note: (note || '').trim().slice(0, 300),
    submittedAt: new Date().toISOString(),
  };

  // Load the session for this date to find which exercises had weight data.
  // Add RPE to each exercise's progression record so suggestKg can use it next time.
  const [sessionRaw, logRaw] = await Promise.all([
    redis('get', sessionKey(workspace, playerId, date)).catch(() => null),
    redis('get', `${pfx(workspace)}:log:${playerId}:${date}`).catch(() => null),
  ]);
  const actualSessionCmds = [];
  const allExercises = [];
  const actualExercises = [];
  let actualTonnage = 0;
  let plannedLoadedExercises = 0;
  let completedLoadedExercises = 0;
  let log = null;
  try { log = logRaw ? (typeof logRaw === 'string' ? JSON.parse(logRaw) : logRaw) : null; } catch (_) {}
  const completedSets = submittedDone && typeof submittedDone === 'object' ? submittedDone : log?.done || {};
  const actualWeights = submittedWeights && typeof submittedWeights === 'object' ? submittedWeights : log?.weights || {};
  if (sessionRaw) {
    try {
      const rec = typeof sessionRaw === 'string' ? JSON.parse(sessionRaw) : sessionRaw;
      if (rec?.session) rec.session = sanitizeUnavailableEquipmentExercises(rec.session);
      for (const [blockIndex, block] of (rec.session?.blocks || []).entries()) {
        for (const [exerciseIndex, ex] of (block.exercises || []).entries()) {
          if (ex.name) allExercises.push(ex);
          const targetSets = Array.isArray(ex.targetSets) ? ex.targetSets : [];
          const setActuals = targetSets.map((target, setIndex) => {
              const setKey = `${blockIndex}-${exerciseIndex}-${setIndex}`;
              const parsedWeight = String(actualWeights[setKey] ?? '').trim().replace(',', '.');
              const kg = completedSets[setKey] ? parseFloat(parsedWeight) : 0;
              return {
                set: setIndex + 1,
                target: String(target ?? ''),
                reps: targetSetReps(target),
                completed: !!completedSets[setKey],
                kg: Number.isFinite(kg) && kg > 0 ? kg : 0,
              };
            });
          const loggedWeights = setActuals.map(set => set.kg).filter(value => value > 0);
          // Never turn a planned weight into a completed weight. Only a value
          // explicitly logged by the player may drive progression history.
          const kg = loggedWeights.length ? Math.max(...loggedWeights) : 0;
          const plannedKg = weightKgFromExercise(ex);
          const loadUnits = loadUnitsForExercise(ex);
          const completedSetCount = setActuals.filter(set => set.completed).length;
          const allSetsCompleted = targetSets.length > 0 && completedSetCount === targetSets.length;
          const averageLoggedKg = loggedWeights.length
            ? loggedWeights.reduce((sum, value) => sum + value, 0) / loggedWeights.length
            : 0;

          actualTonnage += setActuals.reduce(
            (sum, set) => sum + (set.completed ? set.kg * loadUnits * set.reps : 0),
            0
          );
          if (plannedKg > 0) {
            plannedLoadedExercises += 1;
            if (allSetsCompleted && averageLoggedKg >= plannedKg * 0.8) completedLoadedExercises += 1;
          }
          if (ex.name) {
            actualExercises.push({
              block: block.label || '',
              name: ex.name,
              plannedKg,
              actualKg: loggedWeights.length ? Math.max(...loggedWeights) : 0,
              setActuals,
              completedSets: completedSetCount,
              plannedSets: targetSets.length,
              completed: allSetsCompleted,
              loadUnits,
              sessionRpe: rpeNum,
            });
          }
          if (!kg || kg <= 0 || !ex.name) continue;
          const exerciseKey = exweightKey(workspace, playerId, normExName(ex.name));
          actualSessionCmds.push(['HSET', exerciseKey, 'kg', String(kg), 'date', String(date), 'rpe', String(rpeNum), 'loadUnits', String(loadUnits), 'source', loggedWeights.length ? 'player_log' : 'planned_feedback']);
          if (loggedWeights.length) {
            actualSessionCmds.push(['HSET', exhistKey(workspace, playerId, normExName(ex.name)), String(date), String(kg)]);
          }
        }
      }
    } catch (_) {}
  }

  actualTonnage = Math.round(actualTonnage);
  if (actualExercises.length) {
    const compliance = plannedLoadedExercises > 0
      ? Math.round((completedLoadedExercises / plannedLoadedExercises) * 100)
      : 0;
    const actualRecord = {
      exercises: actualExercises,
      blockFeedback: {},
      sessionRpe: rpeNum,
      fatigue: fatigueNum,
      feel: feel || null,
      note: record.note,
      compliance,
      actualTonnage,
      source: 'player_feedback',
      savedAt: record.submittedAt,
    };
    actualSessionCmds.push([
      'SET',
      `${pfx(workspace)}:session:actual:${playerId}:${date}`,
      JSON.stringify(actualRecord),
    ]);
    if (actualTonnage > 0) {
      actualSessionCmds.push(['SET', `${pfx(workspace)}:gym_tonnage_actual:${playerId}:${date}`, String(actualTonnage)]);
      actualSessionCmds.push(['SET', gymTonnageKey(workspace, playerId, date), String(actualTonnage)]);
      actualSessionCmds.push(['ZADD', gymTonnageDatesKey(workspace, playerId), parseInt(String(date).replace(/-/g, ''), 10), String(date)]);
    }
  }

  // Per-player exercise-response memory (avg RPE / feel per exercise).
  if (allExercises.length && !previousRaw) {
    await updateExerciseMemory(playerId, allExercises, rpeNum, feel, date, workspace).catch(() => {});
  }

  const cmds = [
    ['SET', key, JSON.stringify(record)],
    ...actualSessionCmds,
  ];
  await redisPipeline(cmds).catch(() =>
    redis('set', key, JSON.stringify(record))
  );

  // #13 — Link evening pain/DOMS back onto yesterday's exercises (fire-and-forget).
  linkPainToExercises(playerId, painAreas || [], Number(doms ?? soreness ?? 0) || 0, date, workspace).catch(() => {});

  return res.status(200).json({ ok: true, feedback: record });
}
