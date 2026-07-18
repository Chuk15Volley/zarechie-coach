// pages/api/exercises/manual-video.js
// GET  ?name=... → { url } or { url: null }
// POST { name, url } → save manual YouTube URL to the exercise library → { ok }
// DELETE ?name=... → remove manual URL → { ok }
//
// Backed by lib/exerciseLibrary. Manual trainer links are pinned to the exact
// derived exercise id, not fuzzy-matched, so editing one exercise cannot save
// the URL under a neighbouring exercise name.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { normalize, getCard } from '../../../lib/exerciseLibrary';

export const config = { maxDuration: 10 };

// Legacy slug — matches the old exercise:yt-manual:{slug} key format.
function legacySlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '');
}

function validYouTubeId(id) {
  return /^[\w-]{11}$/.test(String(id || ''));
}

function extractYouTubeId(url) {
  const raw = String(url || '').trim();
  if (validYouTubeId(raw)) return raw;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0] || null;
      return validYouTubeId(id) ? id : null;
    }
    if (host.endsWith('youtube.com')) {
      const watchId = parsed.searchParams.get('v');
      if (validYouTubeId(watchId)) return watchId;
      const [, , id] = parsed.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/) || [];
      if (validYouTubeId(id)) return id;
    }
  } catch (_) {}

  const m = raw.match(/(?:youtube\.com\/(?:watch\?(?:[^#\s]+&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (validYouTubeId(m?.[1])) return m[1];
  return null;
}

function normalizeYouTubeUrl(url) {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const name = (req.query.name || req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const { normName, canonicalId } = normalize(name);

  if (req.method === 'GET') {
    // Deterministic read first: the exact exercise owns its manual video.
    const card = await getCard(canonicalId);
    if (card?.video) return res.status(200).json({ url: card.video });

    const legacy = await redis('get', `exercise:yt-manual:${legacySlug(name)}`).catch(() => null);
    if (legacy) return res.status(200).json({ url: legacy });

    // Compatibility fallback for URLs saved before this fix, when POST used fuzzy resolveId().
    const aliasId = await redis('hget', 'ex:alias', normName).catch(() => null);
    if (aliasId && aliasId !== canonicalId) {
      const aliasCard = await getCard(aliasId);
      if (aliasCard?.video) return res.status(200).json({ url: aliasCard.video });
    }

    return res.status(200).json({ url: null });
  }

  if (req.method === 'DELETE') {
    await redis('hdel', `ex:lib:${canonicalId}`, 'video').catch(() => {});
    await redis('del', `exercise:yt-manual:${legacySlug(name)}`).catch(() => {});
    await redis('hset', 'ex:alias', normName, canonicalId).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST') {
    const { url } = req.body || {};
    const normalizedUrl = normalizeYouTubeUrl((url || '').trim());
    if (!normalizedUrl) return res.status(400).json({ error: 'valid YouTube url required' });
    const ts = String(Date.now());
    const existing = await getCard(canonicalId);
    const createdAt = existing?.createdAt || ts;

    await redis('hset', 'ex:alias', normName, canonicalId).catch(() => {});
    await redis('hset', `ex:lib:${canonicalId}`, 'video', normalizedUrl, 'title', name, 'createdAt', createdAt, 'updatedAt', ts);
    await redis('sadd', 'ex:index', canonicalId).catch(() => {});
    await redis('set', `exercise:yt-manual:${legacySlug(name)}`, normalizedUrl).catch(() => {});

    return res.status(200).json({ ok: true, url: normalizedUrl, canonicalId });
  }

  return res.status(405).end();
}
