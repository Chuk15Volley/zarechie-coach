import {coachLibraryCards} from '../../../lib/coachLibraryCatalogue';
// pages/api/exercises/library.js
// GET    → list of cards: [{ canonicalId, title, hasImage, video }]  (image data omitted)
// DELETE ?id=...                          → remove a card → { ok }
// POST   { action:'merge', sourceId, targetId } → fold source into target → { ok }

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { getCard } from '../../../lib/exerciseLibrary';

export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  // ── GET: list ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const list=await coachLibraryCards();
    return res.status(200).json({cards:list,total:list.length});
  }

  // ── DELETE: remove a card ────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = (req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id required' });
    await redisPipeline([
      ['DEL', `ex:lib:${id}`],
      ['SREM', 'ex:index', id],
    ]);
    // Drop any aliases pointing at the removed card.
    await removeAliasesFor(id).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  // ── POST: merge ──────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { action, sourceId, targetId } = req.body || {};
    if (action !== 'merge') return res.status(400).json({ error: 'unknown action' });
    if (!sourceId || !targetId) return res.status(400).json({ error: 'sourceId and targetId required' });
    if (sourceId === targetId) return res.status(400).json({ error: 'sourceId equals targetId' });

    const source = await getCard(sourceId);
    const target = await getCard(targetId);
    if (!source) return res.status(404).json({ error: 'source not found' });
    if (!target) return res.status(404).json({ error: 'target not found' });

    // Copy image/video into target only where target is empty.
    const fields = [];
    if (!target.image && source.image) fields.push('image', source.image);
    if (!target.video && source.video) fields.push('video', source.video);
    if (fields.length) {
      fields.push('updatedAt', String(Date.now()));
      await redisPipeline([['HSET', `ex:lib:${targetId}`, ...fields]]);
    }

    // Repoint every alias that referenced the source at the target.
    await repointAliases(sourceId, targetId).catch(() => {});

    // Remove the source card.
    await redisPipeline([
      ['DEL', `ex:lib:${sourceId}`],
      ['SREM', 'ex:index', sourceId],
    ]);

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

// Parse the flat ["field","val",...] array returned by HGETALL ex:alias.
async function aliasEntries() {
  const raw = await redis('hgetall', 'ex:alias').catch(() => null);
  if (!raw) return [];
  if (Array.isArray(raw)) {
    const out = [];
    for (let i = 0; i < raw.length - 1; i += 2) out.push([raw[i], raw[i + 1]]);
    return out;
  }
  return Object.entries(raw);
}

async function removeAliasesFor(id) {
  const stale = (await aliasEntries()).filter(([, v]) => v === id).map(([k]) => k);
  if (stale.length) await redis('hdel', 'ex:alias', ...stale);
}

async function repointAliases(sourceId, targetId) {
  const toMove = (await aliasEntries()).filter(([, v]) => v === sourceId).map(([k]) => k);
  if (!toMove.length) return;
  await redisPipeline([['HSET', 'ex:alias', ...toMove.flatMap(k => [k, targetId])]]);
}
