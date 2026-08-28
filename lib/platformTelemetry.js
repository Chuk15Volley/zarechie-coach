import { redisPipeline } from './redis.js';
import { pfx } from './workspacePrefix.js';

function cleanMeta(meta = {}) {
  return Object.fromEntries(Object.entries(meta)
    .filter(([, value]) => value != null)
    .slice(0, 12)
    .map(([key, value]) => [String(key).slice(0, 40), String(value).slice(0, 180)]));
}

export async function recordPlatformEvent({ workspace = 'zarechie', area, status = 'ok', durationMs = null, message = '', meta = {} }) {
  const event = {
    at: new Date().toISOString(),
    area: String(area || 'unknown').slice(0, 60),
    status: ['ok', 'warning', 'error'].includes(status) ? status : 'warning',
    durationMs: Number.isFinite(Number(durationMs)) ? Math.max(0, Math.round(Number(durationMs))) : null,
    message: String(message || '').slice(0, 240),
    meta: cleanMeta(meta),
  };
  const prefix = pfx(workspace);
  await redisPipeline([
    ['LPUSH', `${prefix}:platform:events`, JSON.stringify(event)],
    ['LTRIM', `${prefix}:platform:events`, '0', '199'],
    ['HINCRBY', `${prefix}:platform:counters`, `${event.area}:${event.status}`, '1'],
  ]).catch(() => {});
  return event;
}

export function parsePlatformEvents(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    try { return typeof row === 'string' ? JSON.parse(row) : row; } catch (_) { return null; }
  }).filter(Boolean);
}
