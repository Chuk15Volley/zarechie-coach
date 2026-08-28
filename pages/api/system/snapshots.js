import { isAuthorized } from '../../../lib/auth';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { createEncryptedBackup, listEncryptedBackups, restoreEncryptedBackup } from '../../../lib/platformBackup';
import { recordPlatformEvent } from '../../../lib/platformTelemetry';

function workspaceFrom(req) {
  const requested = req.method === 'GET' ? req.query.workspace : req.body?.workspace;
  return requested === 'nkperf' ? 'nkperf' : 'zarechie';
}

function safeError(error) {
  const message = String(error?.message || 'Backup operation failed');
  if (message.includes('not configured')) return { status: 503, message: 'Резервное копирование не настроено' };
  if (message.includes('not found')) return { status: 404, message: 'Резервная копия не найдена' };
  return { status: 500, message: 'Операция с резервной копией не выполнена' };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!['GET', 'POST', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.method !== 'GET' && !await enforceRateLimit(req, res, { scope: 'admin-snapshots', limit: 6, windowSeconds: 3600, failClosed: true })) return;
  const workspace = workspaceFrom(req);

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ snapshots: await listEncryptedBackups(workspace, 14) });
    }

    if (req.method === 'POST') {
      const snapshot = await createEncryptedBackup(workspace);
      await recordPlatformEvent({ workspace, area: 'backup', status: 'ok', message: `Зашифрованная резервная копия: ${snapshot.keyCount} ключей`, meta: { id: snapshot.id, storage: snapshot.storage } });
      return res.status(200).json({ snapshot });
    }

    const { pathname, confirmation } = req.body || {};
    const id = String(pathname || '').split('/').pop()?.replace(/\.backup$/, '') || '';
    if (!pathname || confirmation !== `RESTORE ${id}`) {
      return res.status(400).json({ error: `Для восстановления требуется confirmation: RESTORE ${id || '<id>'}` });
    }
    const restored = await restoreEncryptedBackup(workspace, pathname);
    await recordPlatformEvent({ workspace, area: 'restore', status: 'warning', message: `Восстановлена зашифрованная копия ${restored.id}`, meta: { keys: restored.keyCount, release: restored.release } });
    return res.status(200).json(restored);
  } catch (error) {
    const failure = safeError(error);
    await recordPlatformEvent({ workspace, area: req.method === 'PUT' ? 'restore' : 'backup', status: 'error', message: failure.message, meta: { reason: String(error?.message || '').slice(0, 120) } });
    return res.status(failure.status).json({ error: failure.message });
  }
}
