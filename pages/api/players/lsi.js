// pages/api/players/lsi.js
// GET ?playerId=X&workspace=... → { lsi, cmj_right, cmj_left, date, history }
// Reads LSI from the active workspace's neuro source.
// Falls back to workspace manual overrides.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { getNKNeuroData } from '../../../lib/nkperfClient';
import { pfx, rosterKey } from '../../../lib/workspacePrefix';

function parseJSON(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function idVariants(id) {
  const s = String(id);
  const variants = [s];
  if (!s.startsWith('whoop_')) variants.push(`whoop_${s}`);
  else variants.push(s.replace(/^whoop_/, ''));
  return variants;
}

function rosterMatch(arr, id) {
  if (!Array.isArray(arr)) return null;
  const wants = new Set(idVariants(id).map(String));
  return arr.find(p => {
    if (!p) return false;
    const pid = String(p.id);
    return wants.has(pid) || wants.has(pid.replace(/^whoop_/, ''));
  }) || null;
}

async function sourceIds(playerId, workspace) {
  const ids = idVariants(playerId);
  if (workspace !== 'nkperf') return ids;
  const rosterRaw = await redis('get', rosterKey(workspace)).catch(() => null);
  const player = rosterMatch(parseJSON(rosterRaw), playerId);
  const externalId = player?.whoopUserId || player?.whoopId || player?.whoop_id || player?.whoop || player?.externalId;
  if (externalId && !ids.includes(String(externalId))) ids.push(String(externalId));
  return ids;
}

function extractLsiFromNeuroDB(neuroDB, ids) {
  let entry = null;
  for (const id of ids) {
    if (neuroDB?.[id]) {
      entry = neuroDB[id];
      break;
    }
  }
  if (!entry?.hist?.lsi?.length) return null;
  const sorted = [...entry.hist.lsi].sort((a, b) => b.date.localeCompare(a.date));
  return sorted; // newest first
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const playerId = String(req.query.playerId || '');
    const workspace = String(req.query.workspace || 'zarechie');
    if (!playerId) return res.status(400).json({ error: 'playerId required' });

    const ids = await sourceIds(playerId, workspace);
    const neuroDB = workspace === 'nkperf'
      ? await getNKNeuroData().catch(() => ({}))
      : parseJSON(await redis('get', 'neuro:data').catch(() => null));

    let lsiHistory = null;
    if (neuroDB) {
      lsiHistory = extractLsiFromNeuroDB(neuroDB, ids);
    }

    if (lsiHistory?.length) {
      const latest = lsiHistory[0];
      return res.status(200).json({
        lsi: Math.round(parseFloat(latest.lsi) * 10) / 10,
        cmj_right: latest.right ?? null,
        cmj_left: latest.left ?? null,
        date: latest.date,
        history: lsiHistory.slice(0, 10),
        source: workspace === 'nkperf' ? 'nkperf' : 'zarechie',
      });
    }

    // Fallback: manual entry in workspace lsi key.
    const raw = await redis('get', `${pfx(workspace)}:lsi:${playerId}`).catch(() => null);
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
    const { playerId, lsi, workspace = 'zarechie' } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    const key = `${pfx(workspace)}:lsi:${playerId}`;
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
