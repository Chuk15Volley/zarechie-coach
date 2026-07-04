// pages/api/player/feedback.js
// POST { token, date, rpe, feel, note } → saves player workout feedback to Redis.
// Auth: share token (validates player without exposing playerId).
// Also updates per-exercise weight records with RPE for auto-progression.

import { redis, redisPipeline } from '../../../lib/redis';
import { normExName } from '../players/progression';
import { updateExerciseMemory, linkPainToExercises } from '../../../lib/exerciseMemory';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { token, date, rpe, feel, note, doms, soreness, painAreas = [] } = req.body || {};
  if (!token || !date || !rpe) return res.status(400).json({ error: 'token, date, rpe required' });

  // coach:share_token:{token} normally holds a bare playerId string, but tolerate a
  // JSON { playerId } object too (matches the ICS feed's resolution logic).
  const tokenRaw = await redis('get', `coach:share_token:${token}`).catch(() => null);
  if (!tokenRaw) return res.status(401).json({ error: 'invalid token' });
  let playerId = null;
  if (typeof tokenRaw === 'object' && tokenRaw.playerId != null) {
    playerId = String(tokenRaw.playerId);
  } else if (typeof tokenRaw === 'string' && tokenRaw.startsWith('{')) {
    try { const o = JSON.parse(tokenRaw); playerId = o && o.playerId != null ? String(o.playerId) : String(tokenRaw); }
    catch { playerId = String(tokenRaw); }
  } else {
    playerId = String(tokenRaw);
  }
  if (!playerId) return res.status(401).json({ error: 'invalid token' });

  const rpeNum = Number(rpe);
  const record = {
    rpe: rpeNum,
    feel: feel || null,
    note: (note || '').trim().slice(0, 300),
    submittedAt: new Date().toISOString(),
  };

  // Load the session for this date to find which exercises had weight data.
  // Add RPE to each exercise's progression record so suggestKg can use it next time.
  const sessionRaw = await redis('get', `coach:session:${playerId}:${date}`).catch(() => null);
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
          const key = `coach:exweight:${playerId}:${normExName(ex.name)}`;
          rpeUpdateCmds.push(['HSET', key, 'rpe', String(rpeNum)]);
        }
      }
    } catch (_) {}
  }

  // Per-player exercise-response memory (avg RPE / feel per exercise).
  if (allExercises.length) {
    await updateExerciseMemory(playerId, allExercises, rpeNum, feel, date, 'zarechie').catch(() => {});
  }

  const cmds = [
    ['SET', `coach:feedback:${playerId}:${date}`, JSON.stringify(record)],
    ...rpeUpdateCmds,
  ];
  await redisPipeline(cmds).catch(() =>
    redis('set', `coach:feedback:${playerId}:${date}`, JSON.stringify(record))
  );

  // #13 — Link evening pain/DOMS back onto yesterday's exercises (fire-and-forget).
  linkPainToExercises(playerId, painAreas || [], Number(doms ?? soreness ?? 0) || 0, date, 'zarechie').catch(() => {});

  return res.status(200).json({ ok: true });
}
