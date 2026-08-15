// pages/api/schedule/month.js
// GET ?month=YYYY-MM         → returns saved monthly schedule { month, days }
// POST { month, days }       → saves schedule
// PUT ?month=YYYY-MM         → runs auto focus assignment on saved schedule, saves, returns it
import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { assignFocuses } from '../../../lib/monthPlanner';
import { monthlyScheduleKey, scheduleKey } from '../../../lib/workspacePrefix';

const MONTH_RE = /^\d{4}-\d{2}$/;

async function loadDays(workspace, month) {
  const raw = await redis('get', monthlyScheduleKey(workspace, month)).catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadMasterEvents(workspace) {
  const raw = await redis('get', scheduleKey(workspace)).catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function saveDaysAndSyncCalendar(workspace, month, days) {
  const currentEvents = await loadMasterEvents(workspace);
  const outsideMonth = currentEvents.filter(event => !String(event.date || '').startsWith(month));
  const monthEvents = days
    .filter(day => ['game', 'travel'].includes(day.type))
    .map(day => ({ date: day.date, type: day.type, ...(day.note ? { note: day.note } : {}) }));
  const events = [...outsideMonth, ...monthEvents].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  await Promise.all([
    redis('set', monthlyScheduleKey(workspace, month), JSON.stringify(days)),
    redis('set', scheduleKey(workspace), JSON.stringify(events)),
  ]);
  return events;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { month, workspace = 'zarechie' } = req.query;
    if (!MONTH_RE.test(month || '')) return res.status(400).json({ error: 'month (YYYY-MM) required' });
    const days = await loadDays(workspace, month);
    return res.status(200).json({ month, days });
  }

  if (req.method === 'POST') {
    const { month, days, workspace = 'zarechie' } = req.body || {};
    if (!MONTH_RE.test(month || '')) return res.status(400).json({ error: 'month (YYYY-MM) required' });
    if (!Array.isArray(days)) return res.status(400).json({ error: 'days array required' });
    const events = await saveDaysAndSyncCalendar(workspace, month, days);
    return res.status(200).json({ month, days, events });
  }

  if (req.method === 'PUT') {
    const { month, workspace = 'zarechie' } = req.query;
    if (!MONTH_RE.test(month || '')) return res.status(400).json({ error: 'month (YYYY-MM) required' });
    const days = await loadDays(workspace, month);
    const masterEvents = await loadMasterEvents(workspace);
    const planned = assignFocuses(days, masterEvents);
    const events = await saveDaysAndSyncCalendar(workspace, month, planned);
    return res.status(200).json({ month, days: planned, events });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
