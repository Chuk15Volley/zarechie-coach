import { isAuthorized } from '../../../lib/auth';
import { normalizeDevelopmentPlan } from '../../../lib/developmentPlan.mjs';
import { redis } from '../../../lib/redis';
import { developmentPlanKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  const workspace = (req.method === 'GET' ? req.query.workspace : req.body?.workspace) === 'nkperf' ? 'nkperf' : 'zarechie';
  const playerId = String(req.method === 'GET' ? req.query.playerId || '' : req.body?.playerId || '');
  if (!playerId) return res.status(400).json({ error: 'playerId required' });
  const key = developmentPlanKey(workspace, playerId);

  if (req.method === 'GET') {
    const raw = await redis('get', key).catch(() => null);
    if (!raw) return res.status(200).json({ plan: null });
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return res.status(200).json({ plan: normalizeDevelopmentPlan(parsed) });
    } catch (_) {
      return res.status(200).json({ plan: null });
    }
  }

  if (req.method === 'POST') {
    const plan = normalizeDevelopmentPlan(req.body?.plan || {});
    const record = { ...plan, updatedAt: new Date().toISOString() };
    await redis('set', key, JSON.stringify(record));
    return res.status(200).json({ ok: true, plan: record });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
