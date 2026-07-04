// pages/api/nkperf/sync.js
// GET  → read nkperf:roster from local Redis
// POST → pull roster from NK Performance API → save to nkperf:roster

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { getNKRoster } from '../../../lib/nkperfClient';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const raw = await redis('get', 'nkperf:roster').catch(() => null);
    let players = [];
    try { players = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : []; } catch { players = []; }
    return res.status(200).json({ players });
  }

  if (req.method === 'POST') {
    const players = await getNKRoster();
    if (!players.length) {
      return res.status(502).json({ error: 'NK Performance API returned no players' });
    }
    await redis('set', 'nkperf:roster', JSON.stringify(players));
    return res.status(200).json({ synced: players.length, players });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
