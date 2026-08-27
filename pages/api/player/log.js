// pages/api/player/log.js
// GET  ?token=xxx&date=yyy            → progress + workout metadata
// POST { token, date, ...progress }   → { ok: true }
// Player-facing: auth via share token → playerId + workspace.

import { redis } from '../../../lib/redis';
import { resolveShareToken } from '../../../lib/shareToken';
import { pfx } from '../../../lib/workspacePrefix';

const SIXTY_DAYS = 5184000;

function safeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseStoredLog(raw) {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { token, date } = req.query;
    if (!token || !date) return res.status(400).json({ error: 'Missing params' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const resolved = await resolveShareToken(token);
    if (!resolved?.playerId) return res.status(404).json({ error: 'Invalid token' });
    const { playerId, workspace } = resolved;

    const raw = await redis('get', `${pfx(workspace)}:log:${playerId}:${date}`).catch(() => null);
    const log = parseStoredLog(raw);
    return res.status(200).json({
      done: log?.done || {},
      weights: log?.weights || {},
      startedAt: log?.startedAt || null,
      completedAt: log?.completedAt || null,
      elapsedSeconds: Number(log?.elapsedSeconds) || 0,
      savedAt: log?.savedAt || null,
    });
  }

  if (req.method === 'POST') {
    const { token, date, done, weights, startedAt, completedAt, elapsedSeconds } = req.body || {};
    if (!token || !date) return res.status(400).json({ error: 'Missing params' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const resolved = await resolveShareToken(token);
    if (!resolved?.playerId) return res.status(404).json({ error: 'Invalid token' });
    const { playerId, workspace } = resolved;

    const key = `${pfx(workspace)}:log:${playerId}:${date}`;
    const existingRaw = await redis('get', key).catch(() => null);
    const existing = parseStoredLog(existingRaw) || {};
    const seconds = Number(elapsedSeconds);
    const payload = {
      done: done && typeof done === 'object' ? done : {},
      weights: weights && typeof weights === 'object' ? weights : {},
      startedAt: safeIso(startedAt) || existing?.startedAt || null,
      completedAt: safeIso(completedAt) || existing?.completedAt || null,
      elapsedSeconds: Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400
        ? Math.round(seconds)
        : Number(existing?.elapsedSeconds) || 0,
      savedAt: new Date().toISOString(),
    };
    await redis('set', key, JSON.stringify(payload));
    await redis('expire', key, SIXTY_DAYS).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
