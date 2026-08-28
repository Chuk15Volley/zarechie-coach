import crypto from 'crypto';
import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';
import { liveCommandsKey } from '../../../lib/workspacePrefix';
import { recordPlatformEvent } from '../../../lib/platformTelemetry';

const TYPES = new Set(['message', 'pause', 'rest', 'adjust_load', 'stop_exercise', 'replace_exercise']);

function parseHash(raw) {
  if (!raw) return [];
  const entries = Array.isArray(raw)
    ? Array.from({ length: Math.floor(raw.length / 2) }, (_, index) => [raw[index * 2], raw[index * 2 + 1]])
    : Object.entries(raw);
  return entries.map(([, value]) => {
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch (_) { return null; }
  }).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  const workspace = req.method === 'GET' ? req.query.workspace : req.body?.workspace;
  const playerId = req.method === 'GET' ? req.query.playerId : req.body?.playerId;
  const date = req.method === 'GET' ? req.query.date : req.body?.date;
  if (!playerId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error: 'playerId and date required' });
  const key = liveCommandsKey(workspace || 'zarechie', playerId, date);

  if (req.method === 'GET') {
    const raw = await redis('hgetall', key).catch(() => null);
    return res.status(200).json({ commands: parseHash(raw) });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { type = 'message', message = '', payload = {} } = req.body || {};
  if (!TYPES.has(type)) return res.status(400).json({ error: 'Invalid command type' });
  const cleanMessage = String(message || '').trim().slice(0, 240);
  if (!cleanMessage && type === 'message') return res.status(400).json({ error: 'message required' });
  const command = {
    id: crypto.randomBytes(10).toString('hex'),
    type,
    message: cleanMessage,
    payload: {
      percent: Number(payload.percent) || null,
      seconds: Math.max(0, Math.min(600, Number(payload.seconds) || 0)) || null,
      exercise: String(payload.exercise || '').slice(0, 120),
      replacement: String(payload.replacement || '').slice(0, 120),
    },
    status: 'pending',
    createdAt: new Date().toISOString(),
    acknowledgedAt: null,
  };
  await redis('hset', key, command.id, JSON.stringify(command));
  await redis('expire', key, 172800).catch(() => {});
  await recordPlatformEvent({ workspace: workspace || 'zarechie', area: 'live_command', status: 'ok', message: type, meta: { playerId, commandId: command.id } }).catch(() => {});
  return res.status(200).json({ command });
}
