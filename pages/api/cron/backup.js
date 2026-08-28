import { createEncryptedBackup } from '../../../lib/platformBackup';
import { recordPlatformEvent } from '../../../lib/platformTelemetry';
import { cronAuthorizationStatus } from '../../../lib/cronAuth';

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
    const snapshot = await createEncryptedBackup(workspace);
    await recordPlatformEvent({ workspace, area: 'backup', status: 'ok', message: `Автоматическая зашифрованная копия: ${snapshot.keyCount} ключей`, meta: { id: snapshot.id, storage: snapshot.storage } });
    return snapshot;
  }));
  const backups = results.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : { workspace: workspaces[index], error: 'backup_failed' });
  const failures = results.map((result, index) => ({ result, workspace: workspaces[index] })).filter(item => item.result.status === 'rejected');
  if (failures.length) {
    console.error(JSON.stringify({ level: 'error', area: 'backup_cron', failures: failures.map(({ workspace, result }) => ({ workspace, reason: String(result.reason?.message || '').slice(0, 120) })) }));
    await Promise.all(failures.map(({ result, workspace }) => recordPlatformEvent({
      workspace,
      area: 'backup',
      status: 'error',
      message: 'Автоматическое резервное копирование не выполнено',
      meta: { reason: String(result.reason?.message || '').slice(0, 120) },
    })));
    return res.status(500).json({ ok: false, backups });
  }
  return res.status(200).json({ ok: true, backups });
}
