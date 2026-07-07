// pages/api/player/feedback.js
// POST { token, date, rpe, feel, note } → saves player workout feedback to Redis.
// Auth: share token (validates player without exposing playerId).
// Also updates per-exercise weight records with RPE for auto-progression.

import { redis, redisPipeline } from '../../../lib/redis';
import { normExName } from '../players/progression';
import { updateExerciseMemory, linkPainToExercises } from '../../../lib/exerciseMemory';
import { resolveShareToken } from '../../../lib/shareToken';
import { exweightKey, feedbackKey, sessionKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { token, date, rpe, feel, note, doms, soreness, painAreas = [] } = req.body || {};
  if (!token || !date || !rpe) return res.status(400).json({ error: 'token, date, rpe required' });

  const resolved = await resolveShareToken(token);
  if (!resolved?.playerId) return res.status(401).json({ error: 'invalid token' });
  const { playerId, workspace } = resolved;

  const rpeNum = Number(rpe);
  const record = {
    rpe: rpeNum,
    feel: feel || null,
    note: (note || '').trim().slice(0, 300),
    submittedAt: new Date().toISOString(),
  };

  // Load the session for this date to find which exercises had weight data.
  // Add RPE to each exercise's progression record so suggestKg can use it next time.
  const sessionRaw = await redis('get', sessionKey(workspace, playerId, date)).catch(() => null);
  const rpeUpdateCmds = [];
  const allExercises = [];
  if (sessionRaw) {
    try {
      const rec = typeof sessionRaw === 'string' ? JSON.parse(sessionRaw) : sessionRaw;
      for (const block of rec.session?.blocks || []) {
        for (const ex of block.exercises || []) {
          if (ex.name) allExercises.push(ex);
          const kg = parseFloat(ex.weightKg);
          if (!kg || kg <= 0 || !ex.name) continue;
          const key = exweightKey(workspace, playerId, normExName(ex.name));
          rpeUpdateCmds.push(['HSET', key, 'rpe', String(rpeNum)]);
        }
      }
    } catch (_) {}
  }

  // Per-player exercise-response memory (avg RPE / feel per exercise).
  if (allExercises.length) {
    await updateExerciseMemory(playerId, allExercises, rpeNum, feel, date, workspace).catch(() => {});
  }

  const cmds = [
    ['SET', feedbackKey(workspace, playerId, date), JSON.stringify(record)],
    ...rpeUpdateCmds,
  ];
  await redisPipeline(cmds).catch(() =>
    redis('set', feedbackKey(workspace, playerId, date), JSON.stringify(record))
  );

  // #13 — Link evening pain/DOMS back onto yesterday's exercises (fire-and-forget).
  linkPainToExercises(playerId, painAreas || [], Number(doms ?? soreness ?? 0) || 0, date, workspace).catch(() => {});

  return res.status(200).json({ ok: true });
}
