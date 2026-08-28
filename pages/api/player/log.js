// pages/api/player/log.js
// GET  ?token=xxx&date=yyy            → progress + workout metadata
// POST { token, date, ...progress }   → { ok: true }
// Player-facing: auth via share token → playerId + workspace.

import { redis } from '../../../lib/redis';
import { resolveShareToken } from '../../../lib/shareToken';
import { pfx } from '../../../lib/workspacePrefix';
import { mergeWorkoutProgress } from '../../../lib/workoutProgress.mjs';
import { recordPlatformEvent } from '../../../lib/platformTelemetry';
import crypto from 'crypto';

const SIXTY_DAYS = 5184000;

function parseStoredLog(raw) {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

async function acquireLock(key) {
  const token = crypto.randomBytes(16).toString('hex');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const acquired = await redis('set', key, token, 'NX', 'PX', 3000).catch(() => null);
    if (acquired === 'OK') return token;
    await new Promise(resolve => setTimeout(resolve, 20 + attempt * 15));
  }
  return null;
}

async function releaseLock(key, token) {
  if (!token) return;
  const script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  await redis('eval', script, '1', key, token).catch(() => {});
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
      setUpdatedAt: log?.setUpdatedAt || {},
      weightUpdatedAt: log?.weightUpdatedAt || {},
      revision: Number(log?.revision) || 0,
      activeBlock: Number.isInteger(log?.activeBlock) ? log.activeBlock : null,
      restUntil: log?.restUntil || null,
      lastActionAt: log?.lastActionAt || null,
    });
  }

  if (req.method === 'POST') {
    const started = Date.now();
    const { token, date } = req.body || {};
    if (!token || !date) return res.status(400).json({ error: 'Missing params' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const resolved = await resolveShareToken(token);
    if (!resolved?.playerId) return res.status(404).json({ error: 'Invalid token' });
    const { playerId, workspace } = resolved;

    const key = `${pfx(workspace)}:log:${playerId}:${date}`;
    const lockKey = `${key}:merge-lock`;
    const lockToken = await acquireLock(lockKey);
    if (!lockToken) {
      await recordPlatformEvent({ workspace, area: 'player_sync', status: 'warning', durationMs: Date.now() - started, message: 'Синхронизация занята другим устройством' }).catch(() => {});
      return res.status(409).json({ error: 'Sync busy', retryAfterMs: 1200 });
    }
    try {
      const existingRaw = await redis('get', key).catch(() => null);
      const existing = parseStoredLog(existingRaw) || {};
      const payload = mergeWorkoutProgress(existing, req.body || {});
      await redis('set', key, JSON.stringify(payload));
      await redis('expire', key, SIXTY_DAYS).catch(() => {});
      await recordPlatformEvent({ workspace, area: 'player_sync', status: 'ok', durationMs: Date.now() - started }).catch(() => {});
      return res.status(200).json({
        ok: true,
        done: payload.done,
        weights: payload.weights,
        setUpdatedAt: payload.setUpdatedAt,
        weightUpdatedAt: payload.weightUpdatedAt,
        revision: payload.revision,
        savedAt: payload.savedAt,
      });
    } catch (error) {
      await recordPlatformEvent({ workspace, area: 'player_sync', status: 'error', durationMs: Date.now() - started, message: error.message }).catch(() => {});
      return res.status(503).json({ error: 'Sync unavailable' });
    } finally {
      await releaseLock(lockKey, lockToken);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
