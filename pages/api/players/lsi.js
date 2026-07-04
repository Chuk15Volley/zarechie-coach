// pages/api/players/lsi.js
// GET ?playerId=X → { lsi, cmj_right, cmj_left, date, history }
// Reads LSI from neuro:data (written by zarechie dashboard asymmetry test).
// Falls back to coach:lsi:{playerId} for manual overrides.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

function extractLsiFromNeuroDB(neuroDB, playerId) {
  const entry = neuroDB?.[playerId];
  if (!entry?.hist?.lsi?.length) return null;
  const sorted = [...entry.hist.lsi].sort((a, b) => b.date.localeCompare(a.date));
  return sorted; // newest first
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const playerId = String(req.query.playerId || '');
    if (!playerId) return res.status(400).json({ error: 'playerId required' });

    // Primary source: neuro:data from zarechie dashboard
    const neuroRaw = await redis('get', 'neuro:data').catch(() => null);
    let lsiHistory = null;
    if (neuroRaw) {
      try {
        const neuroDB = typeof neuroRaw === 'string' ? JSON.parse(neuroRaw) : neuroRaw;
        lsiHistory = extractLsiFromNeuroDB(neuroDB, playerId);
      } catch {}
    }

    if (lsiHistory?.length) {
      const latest = lsiHistory[0];
      return res.status(200).json({
        lsi: Math.round(parseFloat(latest.lsi) * 10) / 10,
        cmj_right: latest.right ?? null,
        cmj_left: latest.left ?? null,
        date: latest.date,
        history: lsiHistory.slice(0, 10),
        source: 'zarechie',
      });
    }

    // Fallback: manual entry in coach:lsi:{playerId}
    const raw = await redis('get', `coach:lsi:${playerId}`).catch(() => null);
    const lsi = raw != null && raw !== '' ? Number(raw) : null;
    return res.status(200).json({
      lsi: Number.isFinite(lsi) ? lsi : null,
      cmj_right: null,
      cmj_left: null,
      date: null,
      history: [],
      source: 'manual',
    });
  }

  // POST: manual override (fallback when zarechie has no data)
  if (req.method === 'POST') {
    const { playerId, lsi } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    const key = `coach:lsi:${playerId}`;
    if (lsi == null || lsi === '' || Number.isNaN(Number(lsi))) {
      await redis('del', key).catch(() => {});
      return res.status(200).json({ ok: true, lsi: null });
    }
    const val = Math.round(Number(lsi) * 10) / 10;
    await redis('set', key, String(val)).catch(() => {});
    return res.status(200).json({ ok: true, lsi: val });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
