// pages/api/exercises/manual-video.js
// GET  ?name=... → { url } or { url: null }
// POST { name, url } → save manual YouTube URL to the exercise library → { ok }
// DELETE ?name=... → remove manual URL → { ok }
//
// Backed by lib/exerciseLibrary (normalised + fuzzy-matched names). Legacy
// exercise:yt-manual:{slug} keys are still read as a fallback on a miss.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { normalize, resolveId, getCard, setVideo, deleteVideo } from '../../../lib/exerciseLibrary';

export const config = { maxDuration: 10 };

// Legacy slug — matches the old exercise:yt-manual:{slug} key format.
function legacySlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '');
}

function extractYouTubeId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || null;
    if (host.endsWith('youtube.com')) {
      const watchId = parsed.searchParams.get('v');
      if (watchId) return watchId;
      const [, , id] = parsed.pathname.match(/^\/(embed|shorts)\/([\w-]{11})/) || [];
      if (id) return id;
    }
  } catch (_) {}
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

  if (req.method === 'GET') {
    // Use deterministic normalize() for reads — avoids polluting ex:alias with every lookup.
    // resolveId() is reserved for writes (POST/DELETE) where we want fuzzy dedup.
    const { canonicalId } = normalize(name);
    const card = await getCard(canonicalId);
    if (card?.video) return res.status(200).json({ url: card.video });

    const legacy = await redis('get', `exercise:yt-manual:${legacySlug(name)}`).catch(() => null);
    return res.status(200).json({ url: legacy || null });
  }

  if (req.method === 'DELETE') {
    await deleteVideo(name).catch(() => {});
    await redis('del', `exercise:yt-manual:${legacySlug(name)}`).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST') {
    const { url } = req.body || {};
    const normalizedUrl = normalizeYouTubeUrl((url || '').trim());
    if (!normalizedUrl) return res.status(400).json({ error: 'valid YouTube url required' });
    await setVideo(name, normalizedUrl);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
