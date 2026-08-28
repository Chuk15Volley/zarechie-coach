import { isAuthorized } from '../../../lib/auth';
import { redis, redisPipeline } from '../../../lib/redis';
import { adaptationVersionSummary } from '../../../lib/sessionAdaptation.mjs';
import { sessionKey } from '../../../lib/workspacePrefix';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RESTORE_SCRIPT = "if redis.call('get',KEYS[1])~=ARGV[1] then return 0 end redis.call('lpush',KEYS[2],ARGV[1]) redis.call('ltrim',KEYS[2],0,9) redis.call('set',KEYS[1],ARGV[2]) return 1";

function parse(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return null; }
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const source = req.method === 'GET' ? req.query : req.body;
  const workspace = source?.workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  const playerId = String(source?.playerId || '');
  const date = String(source?.date || '');
  if (!playerId || playerId.length > 100 || !DATE_RE.test(date)) return res.status(400).json({ error: 'playerId and valid date are required' });
  const key = sessionKey(workspace, playerId, date);
  const versionsKey = `${key}:versions`;
  const versions = (await redis('lrange', versionsKey, '0', '9').catch(() => []) || []).map(parse).filter(record => record?.session);
  if (req.method === 'GET') return res.status(200).json({ versions: versions.map(adaptationVersionSummary) });

  const selected = versions.find(record => String(record.savedAt || '') === String(req.body?.savedAt || ''));
  if (!selected) return res.status(404).json({ error: 'Версия не найдена' });
  const rawCurrent = await redis('get', key).catch(() => null);
  const current = parse(rawCurrent);
  if (!current?.session) return res.status(404).json({ error: 'Текущая программа не найдена' });
  const restoredAt = new Date().toISOString();
  const restored = {
    ...selected,
    savedAt: restoredAt,
    restoredFrom: selected.savedAt || null,
    restoredAt,
  };
  const [restoreResult] = await redisPipeline([['EVAL', RESTORE_SCRIPT, '2', key, versionsKey, String(rawCurrent), JSON.stringify(restored)]]);
  const committed = Number(restoreResult);
  if (committed !== 1) return res.status(409).json({ error: 'Текущая программа изменилась. Обновите список версий' });
  return res.status(200).json({ ok: true, record: restored });
}
