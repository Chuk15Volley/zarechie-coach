import crypto from 'crypto';
import { isAuthorized } from '../../../lib/auth';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { redis, redisPipeline } from '../../../lib/redis';
import { operationsSnapshotKey, pfx, playbookKey, rosterKey, scheduleKey } from '../../../lib/workspacePrefix';
import { recordPlatformEvent } from '../../../lib/platformTelemetry';

function parse(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return null; }
}

async function snapshotKeys(workspace) {
  const prefix = pfx(workspace);
  const sessionKeys = [];
  let cursor = '0';
  do {
    const scan = await redis('scan', cursor, 'match', `${prefix}:session:*`, 'count', '500').catch(() => ['0', []]);
    cursor = String(scan?.[0] || '0');
    const batch = Array.isArray(scan?.[1]) ? scan[1] : [];
    sessionKeys.push(...batch.filter(key => !String(key).endsWith(':versions')));
  } while (cursor !== '0' && sessionKeys.length < 2000);
  return [...new Set([rosterKey(workspace), scheduleKey(workspace), playbookKey(workspace), ...sessionKeys])];
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET' && !await enforceRateLimit(req, res, { scope: 'admin-snapshots', limit: 10, windowSeconds: 3600 })) return;
  const workspace = String((req.method === 'GET' ? req.query.workspace : req.body?.workspace) || 'zarechie') === 'nkperf' ? 'nkperf' : 'zarechie';
  const indexKey = `${pfx(workspace)}:ops_snapshots`;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const ids = await redis('zrevrange', indexKey, '0', '13').catch(() => []);
    const rows = ids.length ? await redisPipeline(ids.map(id => ['GET', operationsSnapshotKey(workspace, id)])).catch(() => []) : [];
    return res.status(200).json({ snapshots: rows.map(parse).filter(Boolean).map(item => ({ id: item.id, createdAt: item.createdAt, keyCount: item.keyCount, release: item.release })) });
  }

  if (req.method === 'POST') {
    const keys = await snapshotKeys(workspace);
    const values = keys.length ? await redisPipeline(keys.map(key => ['GET', key])).catch(() => []) : [];
    const entries = keys.map((key, index) => ({ key, value: values[index] })).filter(entry => entry.value != null);
    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const snapshot = {
      id,
      workspace,
      createdAt: new Date().toISOString(),
      release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
      keyCount: entries.length,
      entries,
    };
    await redisPipeline([
      ['SET', operationsSnapshotKey(workspace, id), JSON.stringify(snapshot), 'EX', '2592000'],
      ['ZADD', indexKey, String(Date.now()), id],
      ['ZREMRANGEBYRANK', indexKey, '0', '-15'],
    ]);
    await recordPlatformEvent({ workspace, area: 'backup', status: 'ok', message: `Создана контрольная точка: ${entries.length} ключей`, meta: { id } }).catch(() => {});
    return res.status(200).json({ snapshot: { id, createdAt: snapshot.createdAt, keyCount: entries.length, release: snapshot.release } });
  }

  if (req.method === 'PUT') {
    const { id, confirmation } = req.body || {};
    if (!id || confirmation !== 'RESTORE') return res.status(400).json({ error: 'id and RESTORE confirmation required' });
    const snapshot = parse(await redis('get', operationsSnapshotKey(workspace, id)).catch(() => null));
    if (!snapshot?.entries?.length) return res.status(404).json({ error: 'Snapshot not found' });
    const allowedPrefix = `${pfx(workspace)}:`;
    const entries = snapshot.entries.filter(entry => String(entry.key).startsWith(allowedPrefix) && entry.value != null);
    await redisPipeline(entries.map(entry => ['SET', entry.key, entry.value]));
    await recordPlatformEvent({ workspace, area: 'restore', status: 'warning', message: `Восстановлена контрольная точка ${id}`, meta: { keys: entries.length } }).catch(() => {});
    return res.status(200).json({ restored: true, keyCount: entries.length, release: snapshot.release });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
