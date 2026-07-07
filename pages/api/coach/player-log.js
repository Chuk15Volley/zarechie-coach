// pages/api/coach/player-log.js
// GET ?playerId=xxx&date=yyy → { log: { done, weights, savedAt } | null }
// Coach-facing: auth via isAuthorized.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { pfx } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, date, workspace = 'zarechie' } = req.query;
  if (!playerId || !date) return res.status(400).json({ error: 'Missing params' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

  const raw = await redis('get', `${pfx(workspace)}:log:${playerId}:${date}`).catch(() => null);
  const log = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
  return res.status(200).json({ log });
}
