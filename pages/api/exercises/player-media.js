// pages/api/exercises/player-media.js
// Public-facing exercise media endpoint for player pages.
// Auth: valid player share token — not the trainer key.
//
// GET ?token=xxx&name=yyy          → { hasImage, video }
// GET ?token=xxx&name=yyy&serve=1  → stream image bytes

import { redis } from '../../../lib/redis';
import { normalize, getCard } from '../../../lib/exerciseLibrary';
import { resolveShareToken } from '../../../lib/shareToken';

export const config = { maxDuration: 15 };

function legacySlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '');
}

async function isValidToken(token) {
  if (!token) return false;
  const resolved = await resolveShareToken(token);
  return !!resolved?.playerId;
}

function streamDataUrl(res, dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return false;
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(Buffer.from(m[2], 'base64'));
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { token, name, serve } = req.query;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  if (!await isValidToken(token)) return res.status(401).json({ error: 'Invalid token' });

  const { normName, canonicalId } = normalize(name);
  const card = await getCard(canonicalId);

  // ── SERVE image ──────────────────────────────────────────────────────────
  if (serve === '1') {
    if (card?.image && streamDataUrl(res, card.image)) return;
    // fallback: legacy key
    const legacy = await redis('get', `exercise:manual:${legacySlug(name)}`).catch(() => null);
    if (legacy && streamDataUrl(res, legacy)) return;
    return res.status(404).end();
  }

  // ── META ─────────────────────────────────────────────────────────────────
  // Check for video: library card → legacy manual → bank lookup happens client-side
  let video = card?.video
    || await redis('get', `exercise:yt-manual:${legacySlug(name)}`).catch(() => null)
    || null;

  // Compatibility fallback for links saved before manual videos were pinned
  // to the exact derived exercise id.
  if (!video) {
    const aliasId = await redis('hget', 'ex:alias', normName).catch(() => null);
    if (aliasId && aliasId !== canonicalId) {
      const aliasCard = await getCard(aliasId);
      video = aliasCard?.video || null;
    }
  }

  return res.status(200).json({
    hasImage: !!(card?.image || await redis('get', `exercise:manual:${legacySlug(name)}`).catch(() => null)),
    video,
  });
}
