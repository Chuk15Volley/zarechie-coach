import { redisPipeline } from './redis.js';
import { parsePlatformEvents, recordPlatformEvent } from './platformTelemetry.js';
import { readinessLatencyKey, readinessLatencyRollupKeys, summarizeReadinessTelemetry } from './readinessTelemetry.js';
import { pfx } from './workspacePrefix.js';
import { dispatchOperationalAlert } from './operationalAlerts.js';

const READY_SIX_WINDOW_MS = 10 * 60 * 1000;
const READY_SIX_FAILURE_THRESHOLD = 3;

export async function evaluateOperationalSlo(workspace, options = {}) {
  const normalizedWorkspace = workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  const now = Number(options.now ?? Date.now());
  const pipeline = options.redisPipelineImpl || redisPipeline;
  const dispatch = options.dispatchAlert || dispatchOperationalAlert;
  const rollupKeys = readinessLatencyRollupKeys(normalizedWorkspace, { ...(options.telemetry || {}), now });
  const [latencyRows, eventRows, ...rollupRows] = await pipeline([
    ['LRANGE', readinessLatencyKey(normalizedWorkspace, options.telemetry || {}), '0', '199'],
    ['LRANGE', `${pfx(normalizedWorkspace)}:platform:events`, '0', '199'],
    ...rollupKeys.map(key => ['HGETALL', key]),
  ]);
  const readiness = summarizeReadinessTelemetry(latencyRows, rollupRows, { now });
  const recentReadySixErrors = parsePlatformEvents(eventRows).filter(event => {
    const at = new Date(event.at).getTime();
    return event.status === 'error'
      && ['readysix', 'readiness_refresh'].includes(event.area)
      && Number.isFinite(at) && at >= now - READY_SIX_WINDOW_MS && at <= now;
  });
  const warmP95Active = Boolean(readiness.warm?.enoughSamples && !readiness.warm?.healthy);
  const coldP95Active = Boolean(readiness.cold?.enoughSamples && !readiness.cold?.healthy);
  const legacyP95Active = !readiness.warm?.enoughSamples && !readiness.cold?.enoughSamples && readiness.enoughSamples && !readiness.healthy;
  const readySixActive = recentReadySixErrors.length >= READY_SIX_FAILURE_THRESHOLD;
  const conditions = [
    {
      workspace: normalizedWorkspace,
      kind: 'readiness_warm_p95',
      active: warmP95Active || legacyP95Active,
      severity: 'warning',
      fingerprint: 'readiness_warm_p95:warning',
      title: 'Readiness warm-path превышает p95',
      message: `p95 ${readiness.warm?.p95Ms ?? readiness.p95Ms} мс при цели ${readiness.warm?.targetMs ?? readiness.targetMs} мс`,
      resolvedMessage: 'Readiness warm-path снова соответствует целевому уровню',
      meta: { p50Ms: readiness.warm?.p50Ms ?? readiness.p50Ms, p95Ms: readiness.warm?.p95Ms ?? readiness.p95Ms, targetMs: readiness.warm?.targetMs ?? readiness.targetMs, samples: readiness.warm?.sampleCount ?? readiness.sampleCount, cacheHitRate: readiness.cacheHitRate },
    },
    {
      workspace: normalizedWorkspace,
      kind: 'readiness_cold_p95',
      active: coldP95Active,
      severity: 'warning',
      fingerprint: 'readiness_cold_p95:warning',
      title: 'Readiness cold-path превышает p95',
      message: `p95 ${readiness.cold?.p95Ms} мс при цели ${readiness.cold?.targetMs} мс`,
      resolvedMessage: 'Readiness cold-path снова соответствует целевому уровню',
      meta: { p50Ms: readiness.cold?.p50Ms, p95Ms: readiness.cold?.p95Ms, targetMs: readiness.cold?.targetMs, samples: readiness.cold?.sampleCount },
    },
    {
      workspace: normalizedWorkspace,
      kind: 'readysix_errors',
      active: readySixActive,
      severity: recentReadySixErrors.length >= 6 ? 'critical' : 'error',
      fingerprint: 'readysix_errors',
      title: 'Повторяющиеся ошибки ReadySix',
      message: `${recentReadySixErrors.length} ошибок за последние 10 минут`,
      resolvedMessage: 'Поток ошибок ReadySix прекратился',
      meta: { errors: recentReadySixErrors.length, windowMinutes: 10, latest: recentReadySixErrors[0]?.message || '' },
    },
  ];

  const settled = await Promise.allSettled(conditions.map(condition => dispatch(condition, options.dispatchOptions || {})));
  const alerts = settled.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : { workspace: normalizedWorkspace, kind: conditions[index].kind, status: 'failed', error: String(result.reason?.message || 'alert_failed').slice(0, 160) });
  const failures = alerts.filter(alert => alert.status === 'failed');
  const activeConditions = conditions.filter(condition => condition.active).map(condition => condition.kind);

  if (options.recordEvents !== false) {
    await Promise.all(alerts.filter(alert => ['firing', 'resolved', 'log_firing', 'log_resolved', 'in_app_firing', 'in_app_resolved'].includes(alert.status)).map(alert => recordPlatformEvent({
      workspace: normalizedWorkspace,
      area: 'slo_alert',
      status: alert.status.endsWith('firing') ? 'warning' : 'ok',
      message: alert.status.endsWith('firing') ? `Открыт инцидент ${alert.kind}` : `Закрыт инцидент ${alert.kind}`,
      meta: { kind: alert.kind, eventId: alert.eventId },
    })));
  }

  return { workspace: normalizedWorkspace, ok: failures.length === 0, readiness, readySixErrors10m: recentReadySixErrors.length, activeConditions, alerts };
}

export const READY_SIX_SLO_WINDOW_MS = READY_SIX_WINDOW_MS;
export const READY_SIX_SLO_FAILURE_THRESHOLD = READY_SIX_FAILURE_THRESHOLD;
