import { isAuthorized } from '../../../lib/auth';
import { evaluateDevelopmentPlan, normalizeDevelopmentPlan } from '../../../lib/developmentPlan.mjs';
import { redis, redisPipeline } from '../../../lib/redis';
import { developmentPlanKey, pfx, sessionsKey } from '../../../lib/workspacePrefix';
import { getPlayerSnapshot } from '../../../lib/playerData';
import { performanceKpis } from '../../../lib/performanceKpis.mjs';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

async function reviewPlan(plan, workspace, playerId) {
  const targetDate = today();
  const snapshot = await getPlayerSnapshot(playerId, 40, targetDate, 40, workspace).catch(() => null);
  const metrics = performanceKpis(snapshot?.neuro, targetDate);
  const startScore = parseInt(plan.cycleStart.replace(/-/g, ''), 10);
  const endDate = targetDate < plan.reviewDate ? targetDate : plan.reviewDate;
  const endScore = parseInt(endDate.replace(/-/g, ''), 10);
  const dates = await redis('zrangebyscore', sessionsKey(workspace, playerId), String(startScore), String(endScore)).catch(() => []);
  const actualRaws = dates?.length
    ? await redisPipeline(dates.map(date => ['GET', `${pfx(workspace)}:session:actual:${playerId}:${date}`])).catch(() => [])
    : [];
  const actualSessions = actualRaws.filter(Boolean).length;
  return evaluateDevelopmentPlan(plan, { metrics, plannedSessions: dates?.length || 0, actualSessions, targetDate });
}

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
      const plan = normalizeDevelopmentPlan(parsed);
      return res.status(200).json({ plan: await reviewPlan(plan, workspace, playerId) });
    } catch (_) {
      return res.status(200).json({ plan: null });
    }
  }

  if (req.method === 'POST') {
    let plan = normalizeDevelopmentPlan(req.body?.plan || {});
    const targetDate = today();
    const snapshot = await getPlayerSnapshot(playerId, 40, targetDate, 40, workspace).catch(() => null);
    const metrics = performanceKpis(snapshot?.neuro, targetDate);
    plan = {
      ...plan,
      goals: plan.goals.map(goal => {
        if (goal.metric === 'manual' || goal.baselineValue != null) return goal;
        const metric = metrics[goal.metric];
        const baselinePoint = (metric?.history || []).filter(point => point.date && point.date <= plan.cycleStart).slice(-1)[0];
        return {
          ...goal,
          baselineValue: baselinePoint?.value ?? metric?.value ?? null,
          baselineDate: baselinePoint?.date ?? metric?.date ?? null,
          unit: metric?.unit || goal.unit || '',
        };
      }),
    };
    const record = { ...plan, updatedAt: new Date().toISOString() };
    await redis('set', key, JSON.stringify(record));
    return res.status(200).json({ ok: true, plan: await reviewPlan(record, workspace, playerId) });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
