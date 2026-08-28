import crypto from 'node:crypto';
import { redis } from './redis.js';
import { pfx } from './workspacePrefix.js';

const STATE_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOCK_TTL_SECONDS = 30;
const REMINDER_MS = 6 * 60 * 60 * 1000;
const RELEASE_LOCK_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

function normalizedWorkspace(workspace) {
  return workspace === 'nkperf' ? 'nkperf' : 'zarechie';
}

function safeKind(kind) {
  return String(kind || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'unknown';
}

function parseState(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return null; }
}

function normalizedSeverity(severity) {
  return ['warning', 'error', 'critical'].includes(severity) ? severity : 'warning';
}

function severityRank(severity) {
  return { warning: 1, error: 2, critical: 3 }[severity] || 0;
}

function shouldDedupeActive(current, fingerprint, severity, now) {
  const lastSentAt = current?.sentAt ? new Date(current.sentAt).getTime() : 0;
  return current?.status === 'firing'
    && current.fingerprint === fingerprint
    && severityRank(current.severity) >= severityRank(severity)
    && now - lastSentAt < REMINDER_MS;
}

export function operationalAlertConfiguration(env = process.env) {
  const secret = String(env.ALERT_WEBHOOK_SECRET || '');
  let url = null;
  try {
    const parsed = new URL(String(env.ALERT_WEBHOOK_URL || ''));
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) url = parsed.toString();
  } catch (_) {}
  return {
    configured: Boolean(url && Buffer.byteLength(secret) >= 32),
    url,
    secret,
    reason: !url ? 'ALERT_WEBHOOK_URL must be a credential-free HTTPS URL'
      : Buffer.byteLength(secret) < 32 ? 'ALERT_WEBHOOK_SECRET must be at least 32 bytes'
      : null,
  };
}

function publicConfiguration(config) {
  return { configured: config.configured, channel: config.configured ? 'webhook' : 'vercel-logs', reason: config.reason };
}

export function operationalAlertStatus(env = process.env) {
  return publicConfiguration(operationalAlertConfiguration(env));
}

export async function dispatchOperationalAlert(alert, options = {}) {
  const workspace = normalizedWorkspace(alert.workspace);
  const kind = safeKind(alert.kind);
  const environment = String(options.environment || process.env.VERCEL_ENV || process.env.NODE_ENV || 'local');
  if (environment !== 'production' && !options.allowNonProduction) {
    return { workspace, kind, status: 'suppressed_non_production' };
  }

  const config = options.config || operationalAlertConfiguration();
  const now = Number(options.now ?? Date.now());
  const redisGet = options.redisGet || (key => redis('get', key));
  const acquireLock = options.acquireLock || ((key, token) => redis('set', key, token, 'EX', LOCK_TTL_SECONDS, 'NX'));
  const saveState = options.saveState || ((key, value) => redis('set', key, value, 'EX', STATE_TTL_SECONDS));
  const releaseLock = options.releaseLock || ((key, token) => redis('eval', RELEASE_LOCK_SCRIPT, '1', key, token));
  const fetchImpl = options.fetchImpl || fetch;
  // Log-only fallback and external delivery keep independent state. Enabling
  // a webhook later therefore sends the currently active incident instead of
  // inheriting a dedupe window created by Vercel logs.
  const channel = config.configured ? 'webhook' : 'vercel';
  const stateKey = `${pfx(workspace)}:platform:alert:${channel}:${kind}`;
  const lockKey = `${stateKey}:lock`;
  const current = parseState(await redisGet(stateKey));
  const active = Boolean(alert.active);
  const fingerprint = String(alert.fingerprint || kind).slice(0, 160);
  const severity = normalizedSeverity(alert.severity);

  if (active && shouldDedupeActive(current, fingerprint, severity, now)) {
    return { workspace, kind, status: 'deduplicated', sentAt: current.sentAt };
  }
  if (!active && current?.status !== 'firing') return { workspace, kind, status: 'healthy' };

  const lockToken = crypto.randomUUID();
  const locked = await acquireLock(lockKey, lockToken);
  if (locked !== 'OK') return { workspace, kind, status: 'locked' };

  try {
    // Re-read after acquiring the distributed lock. A prior invocation may
    // have delivered and persisted the same incident between our first read
    // and lock acquisition.
    const latest = parseState(await redisGet(stateKey));
    if (active && shouldDedupeActive(latest, fingerprint, severity, now)) {
      return { workspace, kind, status: 'deduplicated', sentAt: latest.sentAt };
    }
    if (!active && latest?.status !== 'firing') return { workspace, kind, status: 'healthy' };

    const eventStatus = active ? 'firing' : 'resolved';
    if (!config.configured) {
      const nextState = {
        status: eventStatus,
        fingerprint,
        severity: active ? severity : 'ok',
        sentAt: new Date(now).toISOString(),
        eventId: crypto.randomUUID(),
      };
      await saveState(stateKey, JSON.stringify(nextState));
      return {
        workspace,
        kind,
        status: active ? 'log_firing' : 'log_resolved',
        eventId: nextState.eventId,
        configuration: publicConfiguration(config),
      };
    }

    const payload = {
      schema: 'zarechie.platform-alert.v1',
      eventId: crypto.randomUUID(),
      occurredAt: new Date(now).toISOString(),
      source: 'zarechie-coach',
      environment,
      release: String(options.release || process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 40),
      workspace,
      kind,
      status: eventStatus,
      severity: active ? severity : 'ok',
      title: String(alert.title || kind).slice(0, 160),
      message: String(active ? alert.message : (alert.resolvedMessage || 'Показатель вернулся в норму')).slice(0, 500),
      meta: Object.fromEntries(Object.entries(alert.meta || {}).slice(0, 12).map(([key, value]) => [String(key).slice(0, 40), String(value).slice(0, 180)])),
    };
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', config.secret).update(body).digest('hex');
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'zarechie-coach-alerts/1.0',
        'X-Zarechie-Signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Alert webhook failed with status ${response.status}`);
    const nextState = {
      status: eventStatus,
      fingerprint,
      severity: active ? severity : 'ok',
      sentAt: new Date(now).toISOString(),
      eventId: payload.eventId,
    };
    await saveState(stateKey, JSON.stringify(nextState));
    return { workspace, kind, status: eventStatus, eventId: payload.eventId };
  } finally {
    await releaseLock(lockKey, lockToken).catch(() => {});
  }
}

export const OPERATIONAL_ALERT_REMINDER_MS = REMINDER_MS;
