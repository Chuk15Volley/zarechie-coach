import { cronAuthorizationStatus } from '../../../lib/cronAuth';
import { runRecoveryDrill } from '../../../lib/platformBackup';
import { recordPlatformEvent } from '../../../lib/platformTelemetry';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const authorization = cronAuthorizationStatus(req);
  if (!authorization.ok) return res.status(authorization.status).json({ error: authorization.error });

  const workspaces = ['zarechie', 'nkperf'];
  const results = await Promise.allSettled(workspaces.map(async workspace => {
    const drill = await runRecoveryDrill(workspace);
    await recordPlatformEvent({ workspace, area: 'recovery_drill', status: 'ok', durationMs: drill.durationMs, message: `Проверено восстановление ${drill.sampledKeyCount} ключей`, meta: { id: drill.id, backup: drill.sourceBackupId, types: drill.verifiedTypes.join(',') } });
    return drill;
  }));
  const drills = results.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : { workspace: workspaces[index], status: 'error' });
  const failures = results.map((result, index) => ({ result, workspace: workspaces[index] })).filter(item => item.result.status === 'rejected');
  if (failures.length) {
    console.error(JSON.stringify({ level: 'critical', area: 'recovery_drill_cron', failures: failures.map(({ workspace, result }) => ({ workspace, reason: String(result.reason?.message || '').slice(0, 120) })) }));
    await Promise.all(failures.map(({ result, workspace }) => recordPlatformEvent({
      workspace,
      area: 'recovery_drill',
      status: 'error',
      message: 'Контрольное восстановление не выполнено',
      meta: { reason: String(result.reason?.message || '').slice(0, 120) },
    })));
    return res.status(500).json({ ok: false, drills });
  }
  return res.status(200).json({ ok: true, drills });
}
