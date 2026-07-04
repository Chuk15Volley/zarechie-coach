// pages/api/players/list.js
// Returns every known player (WHOOP-tracked + roster-only) for the program-generator UI.

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

// Upstash REST may return already-parsed objects — parse defensively.
function parseJSON(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
  const [whoopIds, rosterIds] = await Promise.all([
    redis('smembers', 'whoop:players'),
    redis('smembers', 'roster:players'),
  ]);

  const ids = Array.from(new Set([...(whoopIds || []), ...(rosterIds || [])]));
  if (!ids.length) return res.status(200).json({ players: [] });

  // One pipelined round-trip for both keys of every id, instead of 2*N requests.
  const raws = await redisPipeline(
    ids.flatMap(id => [['get', `whoop:player:${id}`], ['get', `roster:player:${id}`]])
  );
  const players = ids
    .map((id, i) => {
      const raw = raws[i * 2] || raws[i * 2 + 1];
      if (!raw) return null;
      const p = parseJSON(raw);
      if (!p) return null;
      return {
        id,
        name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        position: p.position || '',
      };
    })
    .filter(Boolean);

  // Deduplicate: 'whoop_12345' and '12345' are the same player.
  // Canonical ID = numeric part (strip 'whoop_' prefix) — survey/history keys use it.
  // When merging, prefer roster entry's name (synced from dashboard, has latest Russian names).
  const byCanon = new Map();
  for (const p of players) {
    const canon = String(p.id).replace(/^whoop_/, '');
    const existing = byCanon.get(canon);
    if (!existing) {
      byCanon.set(canon, { ...p, id: canon });
    } else if (String(p.id).startsWith('whoop_')) {
      // roster:player (whoop_ prefix) has fresher name from dashboard — use it, keep numeric id
      byCanon.set(canon, { ...p, id: canon });
    }
  }
  // Second pass: dedupe any remaining same-name entries (manually added roster-only players)
  const byName = new Map();
  for (const p of byCanon.values()) {
    if (!byName.has(p.name)) byName.set(p.name, p);
  }

  const deduped = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const meta = await redisPipeline(
    deduped.flatMap(p => [
      ['zrange', `coach:sessions:${p.id}`, -1, -1],
      ['get', `player:photo:${p.id}`],
    ])
  ).catch(() => []);

  const playersWithMeta = deduped.map((p, i) => ({
    ...p,
    lastSessionDate: Array.isArray(meta[i * 2]) && meta[i * 2].length ? meta[i * 2][0] : null,
    photo: meta[i * 2 + 1] || null,
  }));

  // Keep coach:roster in sync (used by readiness/schedule endpoints).
  // Fire-and-forget — doesn't block the response.
  redis('set', 'coach:roster', JSON.stringify(
    deduped.map(p => ({ id: p.id, name: p.name, position: p.position }))
  )).catch(() => {});

  res.status(200).json({ players: playersWithMeta });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
