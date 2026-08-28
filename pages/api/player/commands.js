import { redis } from '../../../lib/redis';
import { resolveShareToken } from '../../../lib/shareToken';
import { liveCommandsKey } from '../../../lib/workspacePrefix';

function parseHash(raw) {
  if (!raw) return [];
  const entries = Array.isArray(raw)
    ? Array.from({ length: Math.floor(raw.length / 2) }, (_, index) => [raw[index * 2], raw[index * 2 + 1]])
    : Object.entries(raw);
  return entries.map(([, value]) => {
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch (_) { return null; }
  }).filter(Boolean).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export default async function handler(req, res) {
  const token = req.method === 'GET' ? req.query.token : req.body?.token;
  const date = req.method === 'GET' ? req.query.date : req.body?.date;
  if (!token || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return res.status(400).json({ error: 'token and date required' });
  const resolved = await resolveShareToken(token);
  if (!resolved?.playerId) return res.status(401).json({ error: 'invalid token' });
  const key = liveCommandsKey(resolved.workspace, resolved.playerId, date);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  if (req.method === 'GET') {
    const raw = await redis('hgetall', key).catch(() => null);
    return res.status(200).json({ commands: parseHash(raw).filter(command => command.status === 'pending') });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const id = String(req.body?.commandId || '');
  if (!id) return res.status(400).json({ error: 'commandId required' });
  const raw = await redis('hget', key, id).catch(() => null);
  if (!raw) return res.status(404).json({ error: 'command not found' });
  let command;
  try { command = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return res.status(422).json({ error: 'invalid command' }); }
  command = { ...command, status: 'acknowledged', acknowledgedAt: new Date().toISOString() };
  await redis('hset', key, id, JSON.stringify(command));
  return res.status(200).json({ ok: true, command });
}
