import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  dispatchOperationalAlert,
  operationalAlertConfiguration,
} from '../lib/operationalAlerts.js';
import { evaluateOperationalSlo } from '../lib/operationalSlo.js';

const secret = 'alert-signing-secret-that-is-at-least-32-bytes';
const config = { configured: true, externalConfigured: true, channel: 'signed-webhook', url: 'https://alerts.example.test/hook', secret, reason: null };
const now = Date.parse('2026-08-28T14:00:00.000Z');

function alert(overrides = {}) {
  return {
    workspace: 'zarechie',
    kind: 'readiness_p95',
    active: true,
    severity: 'warning',
    fingerprint: 'readiness_p95:4',
    title: 'Readiness SLO',
    message: 'p95 is high',
    resolvedMessage: 'p95 recovered',
    meta: { p95Ms: 1800 },
    ...overrides,
  };
}

test('built-in incident inbox is always active and signed webhook inputs are strict', () => {
  assert.equal(operationalAlertConfiguration({ ALERT_WEBHOOK_URL: 'http://example.test', ALERT_WEBHOOK_SECRET: secret }).channel, 'in-app');
  assert.equal(operationalAlertConfiguration({ ALERT_WEBHOOK_URL: 'https://user:pass@example.test', ALERT_WEBHOOK_SECRET: secret }).channel, 'in-app');
  assert.equal(operationalAlertConfiguration({ ALERT_WEBHOOK_URL: 'https://example.test/hook?token=secret', ALERT_WEBHOOK_SECRET: secret }).channel, 'in-app');
  assert.equal(operationalAlertConfiguration({ ALERT_WEBHOOK_URL: 'https://example.test', ALERT_WEBHOOK_SECRET: 'short' }).externalConfigured, false);
  assert.equal(operationalAlertConfiguration({ ALERT_WEBHOOK_URL: 'https://example.test/hook', ALERT_WEBHOOK_SECRET: secret }).channel, 'signed-webhook');
});

test('Slack and Telegram destinations are validated without exposing credentials', () => {
  const slack = operationalAlertConfiguration({ ALERT_SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T000/B000/secret' });
  assert.equal(slack.channel, 'slack');
  const telegram = operationalAlertConfiguration({ ALERT_TELEGRAM_BOT_TOKEN: '123456789:' + 'a'.repeat(35), ALERT_TELEGRAM_CHAT_ID: '-123456789' });
  assert.equal(telegram.channel, 'telegram');
  assert.equal(operationalAlertConfiguration({ ALERT_SLACK_WEBHOOK_URL: 'https://example.test/services/T/B/C' }).channel, 'in-app');
});

test('firing alert is signed, stateful and contains no signing secret', async () => {
  const states = [];
  let delivered;
  const result = await dispatchOperationalAlert(alert(), {
    environment: 'production',
    release: 'abc123',
    now,
    config,
    redisGet: async () => null,
    acquireLock: async () => 'OK',
    saveState: async (...args) => { states.push(args); return 'OK'; },
    appendNotification: async () => ['OK', 'OK'],
    releaseLock: async () => 1,
    fetchImpl: async (url, options) => { delivered = { url, options }; return new Response(null, { status: 204 }); },
  });
  assert.equal(result.status, 'firing');
  assert.equal(delivered.url, config.url);
  assert.equal(delivered.options.body.includes(secret), false);
  const expected = crypto.createHmac('sha256', secret).update(delivered.options.body).digest('hex');
  assert.equal(delivered.options.headers['X-Zarechie-Signature'], `sha256=${expected}`);
  const payload = JSON.parse(delivered.options.body);
  assert.equal(payload.schema, 'zarechie.platform-alert.v1');
  assert.equal(payload.status, 'firing');
  assert.equal(payload.workspace, 'zarechie');
  assert.equal(JSON.parse(states[0][1]).status, 'firing');
});

test('unchanged incident is deduplicated before lock and delivery', async () => {
  let fetched = 0;
  const state = JSON.stringify({ status: 'firing', fingerprint: 'readiness_p95:4', severity: 'warning', sentAt: new Date(now - 1000).toISOString() });
  const result = await dispatchOperationalAlert(alert(), {
    environment: 'production', now, config,
    redisGet: async () => state,
    acquireLock: async () => { throw new Error('lock should not be acquired'); },
    fetchImpl: async () => { fetched += 1; return new Response(null, { status: 204 }); },
  });
  assert.equal(result.status, 'deduplicated');
  assert.equal(fetched, 0);
});

test('severity escalation bypasses dedupe while a downgrade does not', async () => {
  let delivered = 0;
  let stored = JSON.stringify({ status: 'firing', fingerprint: 'readysix_errors', severity: 'error', sentAt: new Date(now - 1000).toISOString() });
  const escalated = await dispatchOperationalAlert(alert({ kind: 'readysix_errors', fingerprint: 'readysix_errors', severity: 'critical' }), {
    environment: 'production', now, config,
    redisGet: async () => stored,
    acquireLock: async () => 'OK',
    saveState: async (_, value) => { stored = value; return 'OK'; },
    appendNotification: async () => ['OK', 'OK'],
    releaseLock: async () => 1,
    fetchImpl: async () => { delivered += 1; return new Response(null, { status: 204 }); },
  });
  assert.equal(escalated.status, 'firing');
  assert.equal(JSON.parse(stored).severity, 'critical');
  const downgraded = await dispatchOperationalAlert(alert({ kind: 'readysix_errors', fingerprint: 'readysix_errors', severity: 'error' }), {
    environment: 'production', now: now + 1000, config,
    redisGet: async () => stored,
    acquireLock: async () => { throw new Error('downgrade must stay deduplicated'); },
  });
  assert.equal(downgraded.status, 'deduplicated');
  assert.equal(delivered, 1);
});

test('Redis coordination failure is surfaced for retry and monitoring', async () => {
  await assert.rejects(() => dispatchOperationalAlert(alert(), {
    environment: 'production', now, config,
    redisGet: async () => { throw new Error('redis unavailable'); },
  }), /redis unavailable/);
});

test('external delivery failure still leaves the incident in the built-in inbox for retry', async () => {
  const notifications = [];
  await assert.rejects(() => dispatchOperationalAlert(alert(), {
    environment: 'production', now, config,
    redisGet: async () => null,
    acquireLock: async () => 'OK',
    appendNotification: async value => { notifications.push(value); return ['OK', 'OK']; },
    releaseLock: async () => 1,
    fetchImpl: async () => new Response(null, { status: 503 }),
  }), /status 503/);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].status, 'firing');
});

test('healthy condition sends a recovery only for an open incident', async () => {
  const state = JSON.stringify({ status: 'firing', fingerprint: 'readiness_p95:4', sentAt: new Date(now - 1000).toISOString() });
  let payload;
  const result = await dispatchOperationalAlert(alert({ active: false }), {
    environment: 'production', now, config,
    redisGet: async () => state,
    acquireLock: async () => 'OK',
    saveState: async () => 'OK',
    appendNotification: async () => ['OK', 'OK'],
    releaseLock: async () => 1,
    fetchImpl: async (_, options) => { payload = JSON.parse(options.body); return new Response(null, { status: 200 }); },
  });
  assert.equal(result.status, 'resolved');
  assert.equal(payload.status, 'resolved');
  assert.equal(payload.severity, 'ok');
});

test('non-production delivery is suppressed even when webhook secrets exist', async () => {
  const result = await dispatchOperationalAlert(alert(), { environment: 'preview', config });
  assert.equal(result.status, 'suppressed_non_production');
});

test('built-in incident inbox is stateful and independently deduplicated', async () => {
  let saved;
  const notifications = [];
  const fallback = { configured: true, externalConfigured: false, channel: 'in-app', url: null, secret: '', reason: 'built-in' };
  const first = await dispatchOperationalAlert(alert(), {
    environment: 'production', now, config: fallback,
    redisGet: async () => null,
    acquireLock: async () => 'OK',
    saveState: async (_, value) => { saved = value; return 'OK'; },
    appendNotification: async value => { notifications.push(value); return ['OK', 'OK']; },
    releaseLock: async () => 1,
  });
  assert.equal(first.status, 'in_app_firing');
  assert.equal(notifications[0].status, 'firing');
  const second = await dispatchOperationalAlert(alert(), {
    environment: 'production', now: now + 1000, config: fallback,
    redisGet: async () => saved,
    acquireLock: async () => { throw new Error('deduplicated alert must not lock'); },
  });
  assert.equal(second.status, 'deduplicated');
});

test('SLO evaluator detects degraded p95 and repeated ReadySix failures', async () => {
  const latencyRows = Array.from({ length: 20 }, (_, index) => JSON.stringify({
    at: new Date(now - index * 1000).toISOString(), durationMs: 1800, cache: 'hit',
  }));
  const eventRows = Array.from({ length: 3 }, (_, index) => JSON.stringify({
    at: new Date(now - index * 1000).toISOString(), area: 'readiness_refresh', status: 'error', message: 'upstream failed',
  }));
  const dispatched = [];
  const result = await evaluateOperationalSlo('zarechie', {
    now,
    telemetry: { environment: 'production' },
    redisPipelineImpl: async () => [latencyRows, eventRows],
    dispatchAlert: async condition => { dispatched.push(condition); return { workspace: condition.workspace, kind: condition.kind, status: 'firing' }; },
    recordEvents: false,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.activeConditions.sort(), ['readiness_warm_p95', 'readysix_errors']);
  assert.equal(result.readySixErrors10m, 3);
  assert.equal(dispatched.length, 3);
  assert.equal(dispatched.filter(condition => condition.active).length, 2);
});

test('SLO cron is authenticated, workspace-aware and runs every five minutes', () => {
  const source = readFileSync(new URL('../pages/api/cron/slo-alerts.js', import.meta.url), 'utf8');
  const health = readFileSync(new URL('../pages/api/system/health.js', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.match(source, /cronAuthorizationStatus/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /'zarechie', 'nkperf'/);
  assert.match(health, /operationalAlertStatus/);
  assert.match(health, /operationalNotificationKey/);
  assert.match(dashboard, /Канал SLO-инцидентов/);
  assert.ok(vercel.crons.some(job => job.path === '/api/cron/slo-alerts' && job.schedule === '*/5 * * * *'));
});
