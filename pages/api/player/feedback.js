// pages/api/player/feedback.js
// POST { token, date, rpe, feel, note } → saves player workout feedback to Redis.
// Auth: share token (validates player without exposing playerId).

import { redis } from '../../../lib/redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { token, date, rpe, feel, note } = req.body || {};
  if (!token || !date || !rpe) return res.status(400).json({ error: 'token, date, rpe required' });

  const playerId = await redis('get', `coach:share_token:${token}`).catch(() => null);
  if (!playerId) return res.status(401).json({ error: 'invalid token' });

  const record = {
    rpe: Number(rpe),
    feel: feel || null,
    note: (note || '').trim().slice(0, 300),
    submittedAt: new Date().toISOString(),
  };

  await redis('set', `coach:feedback:${playerId}:${date}`, JSON.stringify(record));
  return res.status(200).json({ ok: true });
}
