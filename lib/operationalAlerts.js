import crypto from 'node:crypto';
import { redis, redisPipeline } from './redis.js';
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
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash) url = parsed.toString();
  } catch (_) {}
  let slackUrl = null;
  try {
    const parsed = new URL(String(env.ALERT_SLACK_WEBHOOK_URL || ''));
    if (parsed.protocol === 'https:' && parsed.hostname === 'hooks.slack.com' && parsed.pathname.startsWith('/services/') && !parsed.search && !parsed.hash) slackUrl = parsed.toString();
  } catch (_) {}
  const telegramToken = String(env.ALERT_TELEGRAM_BOT_TOKEN || '');
  const telegramChatId = String(env.ALERT_TELEGRAM_CHAT_ID || '');
  const telegramConfigured = /^\d{6,12}:[A-Za-z0-9_-]{30,64}$/.test(telegramToken) && /^-?\d{5,20}$/.test(telegramChatId);
  const signedWebhook = Boolean(url && Buffer.byteLength(secret) >= 32);
  const channel = signedWebhook ? 'signed-webhook' : slackUrl ? 'slack' : telegramConfigured ? 'telegram' : 'in-app';
  return {
    configured: true,
    externalConfigured: channel !== 'in-app',
    channel,
    url,
    secret,
    slackUrl,
    telegramToken,
    telegramChatId,
    reason: channel === 'in-app' ? 'Built-in incident inbox is active; external delivery is optional' : null,
  };
}

function publicConfiguration(config) {
  const channel = config.channel || (config.configured ? 'signed-webhook' : 'in-app');
  return { configured: true, externalConfigured: channel !== 'in-app', channel, reason: config.reason || null };
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
  const deliveryChannel = config.channel || (config.configured ? 'signed-webhook' : 'in-app');
  const channel = deliveryChannel.replace(/[^a-zA-Z0-9_-]/g, '_');
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
    const notification = {
      schema: 'zarechie.incident-notification.v1',
      eventId: crypto.randomUUID(),
      occurredAt: new Date(now).toISOString(),
      workspace,
      kind,
      status: eventStatus,
      severity: active ? severity : 'ok',
      title: String(alert.title || kind).slice(0, 160),
      message: String(active ? alert.message : (alert.resolvedMessage || 'Показатель вернулся в норму')).slice(0, 500),
      channel: deliveryChannel,
    };
    const appendNotification = options.appendNotification || (value => redisPipeline([
      ['LPUSH', operationalNotificationKey(workspace), JSON.stringify(value)],
      ['LTRIM', operationalNotificationKey(workspace), '0', '99'],
    ]));

    if (deliveryChannel === 'in-app') {
      const nextState = {
        status: eventStatus,
        fingerprint,
        severity: active ? severity : 'ok',
        sentAt: new Date(now).toISOString(),
        eventId: notification.eventId,
      };
      await Promise.all([saveState(stateKey, JSON.stringify(nextState)), appendNotification(notification)]);
      return {
        workspace,
        kind,
        status: active ? 'in_app_firing' : 'in_app_resolved',
        eventId: nextState.eventId,
        configuration: publicConfiguration(config),
      };
    }

    const payload = {
      schema: 'zarechie.platform-alert.v1',
      eventId: notification.eventId,
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
    let destination = config.url;
    let body = JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'zarechie-coach-alerts/1.0' };
    if (deliveryChannel === 'signed-webhook') {
      headers['X-Zarechie-Signature'] = `sha256=${crypto.createHmac('sha256', config.secret).update(body).digest('hex')}`;
    } else if (deliveryChannel === 'slack') {
      destination = config.slackUrl;
      body = JSON.stringify({ text: `${active ? '🚨' : '✅'} ${payload.title}\n${payload.message}\nWorkspace: ${workspace}` });
    } else if (deliveryChannel === 'telegram') {
      destination = `https://api.telegram.org/bot${config.telegramToken}/sendMessage`;
      body = JSON.stringify({ chat_id: config.telegramChatId, text: `${active ? '🚨' : '✅'} ${payload.title}\n${payload.message}\nWorkspace: ${workspace}`, disable_web_page_preview: true });
    }
    // The built-in inbox is the durable primary record even when an optional
    // external destination is unavailable. External state is only advanced
    // after a successful response, so the cron will retry delivery.
    await appendNotification({ ...notification, channel: deliveryChannel });
    const response = await fetchImpl(destination, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) });
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

export function operationalNotificationKey(workspace) {
  return `${pfx(normalizedWorkspace(workspace))}:platform:notifications`;
}
