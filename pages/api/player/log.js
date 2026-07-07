// pages/api/player/log.js
// GET  ?token=xxx&date=yyy            → { done, weights }
// POST { token, date, done, weights } → { ok: true }
// Player-facing: auth via share token → playerId + workspace.

import { redis } from '../../../lib/redis';
import { resolveShareToken } from '../../../lib/shareToken';
import { pfx } from '../../../lib/workspacePrefix';

const SIXTY_DAYS = 5184000;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { token, date } = req.query;
    if (!token || !date) return res.status(400).json({ error: 'Missing params' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const resolved = await resolveShareToken(token);
    if (!resolved?.playerId) return res.status(404).json({ error: 'Invalid token' });
    const { playerId, workspace } = resolved;

    const raw = await redis('get', `${pfx(workspace)}:log:${playerId}:${date}`).catch(() => null);
    const log = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    return res.status(200).json({ done: log?.done || {}, weights: log?.weights || {} });
  }

  if (req.method === 'POST') {
    const { token, date, done, weights } = req.body || {};
    if (!token || !date) return res.status(400).json({ error: 'Missing params' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const resolved = await resolveShareToken(token);
    if (!resolved?.playerId) return res.status(404).json({ error: 'Invalid token' });
    const { playerId, workspace } = resolved;

    const key = `${pfx(workspace)}:log:${playerId}:${date}`;
    const payload = {
      done: done && typeof done === 'object' ? done : {},
      weights: weights && typeof weights === 'object' ? weights : {},
      savedAt: new Date().toISOString(),
    };
    await redis('set', key, JSON.stringify(payload));
    await redis('expire', key, SIXTY_DAYS).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
