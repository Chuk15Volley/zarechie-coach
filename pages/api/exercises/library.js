// pages/api/exercises/library.js
// GET    → list of cards: [{ canonicalId, title, hasImage, video }]  (image data omitted)
// DELETE ?id=...                          → remove a card → { ok }
// POST   { action:'merge', sourceId, targetId } → fold source into target → { ok }

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { getAllCards, getCard, normalize } from '../../../lib/exerciseLibrary';
import { EXERCISE_BANK, findExerciseUrl } from '../../../lib/exerciseBank';

export const config = { maxDuration: 20 };

function legacySlug(name) {
  return (name || '').toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '');
}

// SCAN helper — follows cursor to collect all matching keys.
async function scanKeys(pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const res = await redis('scan', cursor, 'match', pattern, 'count', '200').catch(() => null);
    if (!Array.isArray(res)) break;
    cursor = String(res[0]);
    (res[1] || []).forEach(k => keys.push(k));
  } while (cursor !== '0');
  return keys;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  // ── GET: list ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const cards = await getAllCards();
    const listById = new Map();

    for (const item of EXERCISE_BANK) {
      const { canonicalId } = normalize(item.n);
      if (!canonicalId || listById.has(canonicalId)) continue;
      listById.set(canonicalId, {
        canonicalId,
        title: item.n,
        hasImage: false,
        video: item.u || null,
        autoVideo: item.u || null,
        category: '',
        createdAt: null,
        updatedAt: null,
        source: 'bank',
      });
    }

    cards.forEach(c => {
      const existing = listById.get(c.canonicalId);
      listById.set(c.canonicalId, {
        canonicalId: c.canonicalId,
        title: c.title || existing?.title || c.canonicalId,
        hasImage: !!c.image,
        video: c.video || existing?.video || null,
        autoVideo: existing?.autoVideo || null,
        category: c.category || '',
        createdAt: c.createdAt || null,
        updatedAt: c.updatedAt || null,
        source: existing?.source === 'bank' ? 'bank+custom' : 'custom',
      });
    });

    const list = Array.from(listById.values());

    // Step 1: yt-manual by legacySlug (migrated together, slugs match).
    const needAuto = list.filter(c => !c.video);
    if (needAuto.length) {
      const ytManualCmds = needAuto.map(c => ['GET', `exercise:yt-manual:${legacySlug(c.title)}`]);
      const ytManualResults = await redisPipeline(ytManualCmds).catch(() => []);
      needAuto.forEach((c, i) => { if (ytManualResults[i]) c.autoVideo = ytManualResults[i]; });
    }

    // Step 2: exercise:yt:* auto-search cache matched by canonicalId — NOT by slug.
    // Slug-based matching fails because the exercise name in the program may use different
    // word order than the name stored in ex:lib (e.g. "прыжок на ящик двусторонний"
    // vs "Двусторонний прыжок на ящик"). Normalising both to the same sorted token set
    // guarantees a match regardless of word order.
    const stillNeed = list.filter(c => !c.video && !c.autoVideo);
    if (stillNeed.length) {
      const ytKeys = await scanKeys('exercise:yt:*');
      if (ytKeys.length) {
        const ytUrls = await redisPipeline(ytKeys.map(k => ['GET', k])).catch(() => []);
        // Build { canonicalId → url } from every non-'none' auto-search cache entry.
        const ytByCanon = {};
        ytKeys.forEach((key, i) => {
          const url = ytUrls[i];
          if (!url || url === 'none') return;
          const slug = key.slice('exercise:yt:'.length);
          const { canonicalId } = normalize(slug.replace(/-/g, ' '));
          if (!ytByCanon[canonicalId]) ytByCanon[canonicalId] = url;
        });
        stillNeed.forEach(c => {
          if (ytByCanon[c.canonicalId]) c.autoVideo = ytByCanon[c.canonicalId];
        });
      }
    }

    // Step 3: static exercise bank — covers 1565 well-known exercises.
    for (const c of list) {
      if (!c.video && !c.autoVideo && c.title) {
        const bankUrl = findExerciseUrl(c.title);
        if (bankUrl) c.autoVideo = bankUrl;
      }
    }

    // Newest first when timestamps are available.
    list.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    return res.status(200).json({ cards: list, total: list.length });
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
