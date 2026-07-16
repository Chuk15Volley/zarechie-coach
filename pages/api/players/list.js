// pages/api/players/list.js
// Returns every known player (WHOOP-tracked + roster-only) for the program-generator UI.

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { extractPlayerPhoto, hydratePlayerPhotos } from '../../../lib/playerPhotos';

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
      const whoop = parseJSON(raws[i * 2]);
      const roster = parseJSON(raws[i * 2 + 1]);
      const p = roster || whoop;
      if (!p) return null;
      return {
        id,
        name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        position: p.position || '',
        photo: extractPlayerPhoto(roster) || extractPlayerPhoto(whoop) || null,
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
      byCanon.set(canon, { ...p, id: canon, photo: p.photo || existing.photo || null });
    } else if (!existing.photo && p.photo) {
      byCanon.set(canon, { ...existing, photo: p.photo });
    }
  }
  // Second pass: dedupe any remaining same-name entries (manually added roster-only players)
  const byName = new Map();
  for (const p of byCanon.values()) {
    const existing = byName.get(p.name);
    if (!existing) byName.set(p.name, p);
    else if (!existing.photo && p.photo) byName.set(p.name, { ...existing, photo: p.photo });
  }

  const deduped = await hydratePlayerPhotos(
    Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    'zarechie'
  );

  const meta = await redisPipeline(
    deduped.flatMap(p => [
      ['zrange', `coach:sessions:${p.id}`, -1, -1],
    ])
  ).catch(() => []);

  const playersWithMeta = deduped.map((p, i) => ({
    ...p,
    lastSessionDate: Array.isArray(meta[i]) && meta[i].length ? meta[i][0] : null,
  }));

  // Keep coach:roster in sync (used by readiness/schedule endpoints).
  // Fire-and-forget — doesn't block the response.
  redis('set', 'coach:roster', JSON.stringify(
    deduped.map(p => ({ id: p.id, name: p.name, position: p.position, photo: p.photo || null }))
  )).catch(() => {});

  res.status(200).json({ players: playersWithMeta });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
