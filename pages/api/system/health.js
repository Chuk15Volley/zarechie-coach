import { isAuthorized } from '../../../lib/auth';
import { redis, redisPipeline } from '../../../lib/redis';
import { parsePlatformEvents } from '../../../lib/platformTelemetry';
import { backupIsConfigured } from '../../../lib/platformBackup';
import { pfx } from '../../../lib/workspacePrefix';
import { readySixIntegrationMode } from '../../../lib/readySixClient';

function parseJson(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return null; }
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const workspace = req.query.workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  const prefix = pfx(workspace);
  const started = Date.now();
  let redisOk = false;
  let redisReadWrite = false;
  try {
    redisOk = (await redis('ping')) === 'PONG';
    const probeKey = `${prefix}:platform:health-probe`;
    await redis('set', probeKey, started, 'EX', '30');
    redisReadWrite = String(await redis('get', probeKey)) === String(started);
    await redis('del', probeKey).catch(() => {});
  } catch (_) {}
  const [rawEvents, rawCounters, rawBackup] = await redisPipeline([
    ['LRANGE', `${prefix}:platform:events`, '0', '79'],
    ['HGETALL', `${prefix}:platform:counters`],
    ['GET', `${prefix}:platform:backup:last`],
  ]).catch(() => [[], {}, null]);
  const events = parsePlatformEvents(rawEvents);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const recent = events.filter(event => new Date(event.at).getTime() >= since);
  const errors24h = recent.filter(event => event.status === 'error').length;
  const warnings24h = recent.filter(event => event.status === 'warning').length;
  const readySixMode = readySixIntegrationMode(workspace);
  const readySixKey = workspace === 'nkperf' ? process.env.READYSIX_NK_API_KEY : process.env.READYSIX_ZARECHIE_API_KEY;
  const readySixConfigured = readySixMode === 'legacy' || Boolean(process.env.READYSIX_URL && readySixKey);
  const config = {
    redis: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    readySix: readySixConfigured,
    ai: Boolean(process.env.OPENAI_API_KEY),
    trainerKey: Boolean(process.env.TRAINER_API_KEY),
    backup: backupIsConfigured(),
  };
  const latestBackup = parseJson(rawBackup);
  const backupAgeHours = latestBackup?.createdAt ? Math.max(0, (Date.now() - new Date(latestBackup.createdAt).getTime()) / 3600000) : null;
  const backupFresh = config.backup && backupAgeHours != null && backupAgeHours <= 36;
  const status = !redisOk || !redisReadWrite || !config.redis || (backupAgeHours != null && backupAgeHours > 72)
    ? 'error'
    : errors24h > 0 || !config.readySix || !config.ai || !backupFresh ? 'warning' : 'healthy';
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    status,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    services: { redis: redisOk && redisReadWrite, readySix: config.readySix, ai: config.ai, trainerAuth: config.trainerKey, backup: backupFresh },
    checks: { redisPing: redisOk, redisReadWrite, backupConfigured: config.backup, backupFresh },
    readySixMode,
    release: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    },
    latestSnapshotId: latestBackup?.id || null,
    backup: latestBackup ? { ...latestBackup, ageHours: Math.round(backupAgeHours * 10) / 10, fresh: backupFresh } : null,
    errors24h,
    warnings24h,
    counters: rawCounters || {},
    events: events.slice(0, 40),
  });
}
