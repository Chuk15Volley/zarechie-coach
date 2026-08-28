import { isAuthorized } from '../../../lib/auth';
import { runRecoveryDrill } from '../../../lib/platformBackup';
import { recordPlatformEvent } from '../../../lib/platformTelemetry';
import { enforceRateLimit } from '../../../lib/rateLimit';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await enforceRateLimit(req, res, { scope: 'admin-recovery-drill', limit: 2, windowSeconds: 3600, failClosed: true })) return;
  const workspace = req.body?.workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  try {
    const drill = await runRecoveryDrill(workspace);
    await recordPlatformEvent({ workspace, area: 'recovery_drill', status: 'ok', durationMs: drill.durationMs, message: `Проверено восстановление ${drill.sampledKeyCount} ключей`, meta: { id: drill.id, backup: drill.sourceBackupId, types: drill.verifiedTypes.join(',') } });
    return res.status(200).json({ drill });
  } catch (error) {
    console.error(JSON.stringify({ level: 'critical', area: 'recovery_drill_manual', workspace, reason: String(error?.message || '').slice(0, 120) }));
    await recordPlatformEvent({ workspace, area: 'recovery_drill', status: 'error', message: 'Контрольное восстановление не выполнено', meta: { reason: String(error?.message || '').slice(0, 120) } });
    return res.status(500).json({ error: 'Контрольное восстановление не выполнено' });
  }
}
