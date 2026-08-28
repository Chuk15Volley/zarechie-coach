import { cronAuthorizationStatus } from '../../../lib/cronAuth';
import { prewarmTeamReadiness } from '../../../lib/readinessPrewarm.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const authorization = cronAuthorizationStatus(req);
  if (!authorization.ok) return res.status(authorization.status).json({ error: authorization.error });
  const settled = await Promise.allSettled(['zarechie', 'nkperf'].map(workspace => prewarmTeamReadiness(workspace)));
  const results = settled.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : { workspace: index === 0 ? 'zarechie' : 'nkperf', ok: false, reason: String(result.reason?.message || 'prewarm_failed').slice(0, 160) });
  const failed = results.filter(result => !result.ok);
  return res.status(failed.length ? 502 : 200).json({ ok: failed.length === 0, results });
}
