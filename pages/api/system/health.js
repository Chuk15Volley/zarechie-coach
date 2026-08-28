import { isAuthorized } from '../../../lib/auth';
import { redis, redisPipeline } from '../../../lib/redis';
import { parsePlatformEvents } from '../../../lib/platformTelemetry';
import { pfx } from '../../../lib/workspacePrefix';
import { readySixIntegrationMode } from '../../../lib/readySixClient';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const workspace = req.query.workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  const prefix = pfx(workspace);
  const started = Date.now();
  let redisOk = false;
  try { redisOk = (await redis('ping')) === 'PONG'; } catch (_) {}
  const [rawEvents, rawCounters] = await redisPipeline([
    ['LRANGE', `${prefix}:platform:events`, '0', '79'],
    ['HGETALL', `${prefix}:platform:counters`],
  ]).catch(() => [[], {}]);
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
  };
  const status = !redisOk || !config.redis ? 'error' : errors24h > 0 || !config.readySix || !config.ai ? 'warning' : 'healthy';
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    status,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    services: { redis: redisOk, readySix: config.readySix, ai: config.ai, trainerAuth: config.trainerKey },
    readySixMode,
    errors24h,
    warnings24h,
    counters: rawCounters || {},
    events: events.slice(0, 40),
  });
}
