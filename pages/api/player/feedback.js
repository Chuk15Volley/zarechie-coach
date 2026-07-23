// pages/api/player/feedback.js
// POST { token, date, rpe, fatigue, feel, note } → saves player workout feedback to Redis.
// Auth: share token (validates player without exposing playerId).
// Also updates per-exercise weight records with RPE for auto-progression.

import { redis, redisPipeline } from '../../../lib/redis';
import { normExName } from '../players/progression';
import { updateExerciseMemory, linkPainToExercises } from '../../../lib/exerciseMemory';
import { resolveShareToken } from '../../../lib/shareToken';
import { exweightKey, feedbackKey, pfx, sessionKey } from '../../../lib/workspacePrefix';

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
  const rpeUpdateCmds = [];
  const allExercises = [];
  let log = null;
  try { log = logRaw ? (typeof logRaw === 'string' ? JSON.parse(logRaw) : logRaw) : null; } catch (_) {}
  const completedSets = submittedDone && typeof submittedDone === 'object' ? submittedDone : log?.done || {};
  const actualWeights = submittedWeights && typeof submittedWeights === 'object' ? submittedWeights : log?.weights || {};
  if (sessionRaw) {
    try {
      const rec = typeof sessionRaw === 'string' ? JSON.parse(sessionRaw) : sessionRaw;
      for (const [blockIndex, block] of (rec.session?.blocks || []).entries()) {
        for (const [exerciseIndex, ex] of (block.exercises || []).entries()) {
          if (ex.name) allExercises.push(ex);
          const loggedWeights = (ex.targetSets || [])
            .map((_, setIndex) => {
              const setKey = `${blockIndex}-${exerciseIndex}-${setIndex}`;
              return completedSets[setKey] ? parseFloat(actualWeights[setKey]) : NaN;
            })
            .filter(value => Number.isFinite(value) && value > 0);
          // The player's completed-set weight is authoritative. Planned weight
          // remains the fallback only when no actual weight was entered.
          const kg = loggedWeights.length ? Math.max(...loggedWeights) : parseFloat(ex.weightKg);
          if (!kg || kg <= 0 || !ex.name) continue;
          const exerciseKey = exweightKey(workspace, playerId, normExName(ex.name));
          rpeUpdateCmds.push(['HSET', exerciseKey, 'kg', String(kg), 'date', String(date), 'rpe', String(rpeNum), 'source', loggedWeights.length ? 'player_log' : 'planned_feedback']);
        }
      }
    } catch (_) {}
  }

  // Per-player exercise-response memory (avg RPE / feel per exercise).
  if (allExercises.length && !previousRaw) {
    await updateExerciseMemory(playerId, allExercises, rpeNum, feel, date, workspace).catch(() => {});
  }

  const cmds = [
    ['SET', key, JSON.stringify(record)],
    ...rpeUpdateCmds,
  ];
  await redisPipeline(cmds).catch(() =>
    redis('set', key, JSON.stringify(record))
  );

  // #13 — Link evening pain/DOMS back onto yesterday's exercises (fire-and-forget).
  linkPainToExercises(playerId, painAreas || [], Number(doms ?? soreness ?? 0) || 0, date, workspace).catch(() => {});

  return res.status(200).json({ ok: true, feedback: record });
}
