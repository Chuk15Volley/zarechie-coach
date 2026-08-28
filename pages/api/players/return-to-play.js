import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';
import { evaluateReturnToPlay, normalizeReturnToPlay } from '../../../lib/todayDecisionCenter.mjs';
import { returnToPlayKey } from '../../../lib/workspacePrefix';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

function parse(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  const workspace = (req.method === 'GET' ? req.query.workspace : req.body?.workspace) === 'nkperf' ? 'nkperf' : 'zarechie';
  const playerId = String(req.method === 'GET' ? req.query.playerId || '' : req.body?.playerId || '');
  if (!playerId || playerId.length > 100) return res.status(400).json({ error: 'playerId required' });
  const key = returnToPlayKey(workspace, playerId);

  if (req.method === 'GET') {
    const record = parse(await redis('get', key).catch(() => null));
    return res.status(200).json({ plan: record ? evaluateReturnToPlay(record, today()) : null });
  }

  if (req.method === 'POST') {
    const previous = parse(await redis('get', key).catch(() => null));
    const plan = normalizeReturnToPlay(req.body?.plan || {}, today());
    const changed = !previous || previous.status !== plan.status || Number(previous.currentPhase) !== plan.currentPhase;
    const history = changed ? [
      ...(Array.isArray(previous?.history) ? previous.history : []),
      {
        at: new Date().toISOString(),
        action: previous ? `${previous.status || 'inactive'} → ${plan.status}` : `Создан план: ${plan.status}`,
        phase: plan.currentPhase,
        note: plan.notes,
      },
    ].slice(-30) : plan.history;
    const record = { ...plan, history, updatedAt: new Date().toISOString() };
    await redis('set', key, JSON.stringify(record));
    return res.status(200).json({ ok: true, plan: evaluateReturnToPlay(record, today()) });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
