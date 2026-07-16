// pages/api/team/match-load.js
// GET  ?date=YYYY-MM-DD&workspace=zarechie -> { loads }
// POST { date, workspace, loads: { [playerId]: { status, rpe, pain, note } } }

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { pfx } from '../../../lib/workspacePrefix';

const ALLOWED_STATUS = new Set(['high', 'medium', 'low', 'none', 'inactive']);

function key(workspace, date) {
  return `${pfx(workspace)}:match_load:${date}`;
}

function cleanLoad(load) {
  if (!load || typeof load !== 'object') return null;
  const status = ALLOWED_STATUS.has(load.status) ? load.status : '';
  if (!status) return null;
  const rpeNum = Number(load.rpe);
  return {
    status,
    rpe: Number.isFinite(rpeNum) && rpeNum >= 1 && rpeNum <= 10 ? rpeNum : null,
    pain: !!load.pain,
    note: String(load.note || '').slice(0, 240),
  };
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { date, workspace = 'zarechie' } = req.query || {};
    if (!date) return res.status(400).json({ error: 'date required' });
    const raw = await redis('get', key(workspace, date)).catch(() => null);
    let loads = {};
    try { loads = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}; } catch { loads = {}; }
    return res.status(200).json({ loads });
  }

  if (req.method === 'POST') {
    const { date, workspace = 'zarechie', loads = {} } = req.body || {};
    if (!date) return res.status(400).json({ error: 'date required' });
    const cleaned = {};
    for (const [playerId, load] of Object.entries(loads || {})) {
      const clean = cleanLoad(load);
      if (clean) cleaned[String(playerId)] = clean;
    }
    await redis('set', key(workspace, date), JSON.stringify(cleaned)).catch(e => {
      throw new Error(e.message);
    });
    return res.status(200).json({ ok: true, loads: cleaned });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
