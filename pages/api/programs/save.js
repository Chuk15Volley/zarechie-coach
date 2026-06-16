// pages/api/programs/save.js
// POST { playerId, date, session, player, dataSummary } → persists a (possibly trainer-edited)
// session so re-opening the same player+date later shows the corrected version, not a fresh
// AI draft. Also the foundation for later building real per-player working-weight history.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { playerId, date, session, player, dataSummary } = req.body || {};
  if (!playerId || !date || !session) {
    return res.status(400).json({ error: 'playerId, date and session are required' });
  }

  const record = {
    session,
    player: player || null,
    dataSummary: dataSummary || '',
    date,
    savedAt: new Date().toISOString(),
  };

  try {
    await redis('set', `coach:session:${playerId}:${date}`, JSON.stringify(record));
    return res.status(200).json({ status: 'ok' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
