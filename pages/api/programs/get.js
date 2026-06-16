// pages/api/programs/get.js
// GET ?playerId=&date= → previously saved (edited) session for that player+day, if any.
// Lets the UI offer "load the saved version" instead of always re-generating from scratch.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { playerId, date } = req.query || {};
  if (!playerId || !date) {
    return res.status(400).json({ error: 'playerId and date are required' });
  }

  try {
    const raw = await redis('get', `coach:session:${playerId}:${date}`);
    if (!raw) return res.status(200).json({ record: null });
    return res.status(200).json({ record: JSON.parse(raw) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
