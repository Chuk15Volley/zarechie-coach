import { cronAuthorizationStatus } from '../../../lib/cronAuth';
import { evaluateOperationalSlo } from '../../../lib/operationalSlo';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const authorization = cronAuthorizationStatus(req);
  if (!authorization.ok) return res.status(authorization.status).json({ error: authorization.error });

  const results = await Promise.allSettled(['zarechie', 'nkperf'].map(workspace => evaluateOperationalSlo(workspace)));
  const checks = results.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : { workspace: index === 0 ? 'zarechie' : 'nkperf', ok: false, error: String(result.reason?.message || 'slo_check_failed').slice(0, 160) });
  const failures = checks.filter(check => !check.ok);
  const opened = checks.flatMap(check => (check.alerts || [])
    .filter(alert => ['firing', 'log_firing', 'in_app_firing'].includes(alert.status))
    .map(alert => ({ workspace: check.workspace, kind: alert.kind, eventId: alert.eventId })));
  const resolved = checks.flatMap(check => (check.alerts || [])
    .filter(alert => ['resolved', 'log_resolved', 'in_app_resolved'].includes(alert.status))
    .map(alert => ({ workspace: check.workspace, kind: alert.kind, eventId: alert.eventId })));
  if (opened.length) console.error(JSON.stringify({ level: 'error', area: 'slo_alerts', opened }));
  if (resolved.length) console.info(JSON.stringify({ level: 'info', area: 'slo_alerts', resolved }));
  if (failures.length) {
    console.error(JSON.stringify({ level: 'error', area: 'slo_alert_delivery', failures }));
    return res.status(502).json({ ok: false, checks });
  }
  return res.status(200).json({ ok: true, checks });
}
