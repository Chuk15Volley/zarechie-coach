// pages/api/players/1rm.js
// GET ?playerId=X → fetch stored 1RM values
// POST { playerId, values } → save 1RM values

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { oneRmKey, rmHistoryKey } from '../../../lib/workspacePrefix';

const ALLOWED_FIELDS = ['squat', 'rdl', 'deadlift', 'bench', 'ohp', 'pullup'];

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { playerId, workspace = 'zarechie' } = req.query;
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    const raw = await redis('get', oneRmKey(workspace, playerId)).catch(() => null);
    const values = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    return res.status(200).json({ values });
  }

  if (req.method === 'POST') {
    const { playerId, values, workspace = 'zarechie' } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    if (!values || typeof values !== 'object') return res.status(400).json({ error: 'values required' });
    const clean = {};
    for (const field of ALLOWED_FIELDS) {
      const v = parseFloat(values[field]);
      if (!Number.isNaN(v) && v > 0) clean[field] = v;
    }
    await redis('set', oneRmKey(workspace, playerId), JSON.stringify(clean));

    // Append to history (one entry per day, last 20 kept).
    const histRaw = await redis('get', rmHistoryKey(workspace, playerId)).catch(() => null);
    const history = histRaw ? (typeof histRaw === 'string' ? JSON.parse(histRaw) : histRaw) : [];
    const today = new Date().toISOString().slice(0, 10);
    const todayIdx = history.findIndex(h => h.date === today);
    const entry = { date: today, ...clean };
    if (todayIdx >= 0) history[todayIdx] = entry; else history.push(entry);
    const trimmed = history.slice(-20);
    await redis('set', rmHistoryKey(workspace, playerId), JSON.stringify(trimmed)).catch(() => {});

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
