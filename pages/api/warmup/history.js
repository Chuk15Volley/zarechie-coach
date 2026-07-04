// pages/api/warmup/history.js
// GET → { dates: ['2026-06-28', '2026-06-27', ...] } sorted desc newest first

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const members = await redis('smembers', 'coach:warmup:index');
    const dates = Array.isArray(members) ? [...members] : [];
    dates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // descending, newest first
    return res.status(200).json({ dates });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
