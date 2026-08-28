import { isAuthorized } from '../../../lib/auth';
import { recordPlatformEvent } from '../../../lib/platformTelemetry';
import { resolveShareToken } from '../../../lib/shareToken';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { token, workspace: requestedWorkspace, area, status, durationMs, message, meta } = req.body || {};
  let workspace = requestedWorkspace === 'nkperf' ? 'nkperf' : 'zarechie';
  if (token) {
    const resolved = await resolveShareToken(token);
    if (!resolved) return res.status(401).json({ error: 'Invalid token' });
    workspace = resolved.workspace;
  } else if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  await recordPlatformEvent({ workspace, area, status, durationMs, message, meta });
  return res.status(202).json({ ok: true });
}
