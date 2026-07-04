// pages/api/exercises/manual-image.js
// GET    ?name=...                      → { hasImage: bool }
// POST   { name, imageData (base64) }  → stores compressed JPEG data in the exercise library → { ok }
// DELETE ?name=...                      → removes the image from the library → { ok }
// GET    ?name=...&serve=1             → streams the image directly (used as <img> src)
//
// Images are stored as base64 data URLs in Redis (no Vercel Blob). The client
// pre-compresses to ≤512×512 JPEG (typically 30-80 KB) before sending.
//
// All operations use the DERIVED canonicalId (from normalize()) — NOT fuzzy-matched.
// This prevents a new exercise from accidentally using another exercise's image slot.
// Legacy exercise:manual:{slug} keys are still read as a fallback on a miss.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { normalize, getCard, setImage } from '../../../lib/exerciseLibrary';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } }, maxDuration: 15 };

// Legacy slug — matches the old exercise:manual:{slug} key format.
function legacySlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '');
}

function streamDataUrl(res, dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return false;
  const buf = Buffer.from(m[2], 'base64');
  res.setHeader('Content-Type', m[1]);
  // no-cache so the browser always revalidates; avoids stale image after delete+re-upload
  res.setHeader('Cache-Control', 'private, no-cache');
  res.send(buf);
  return true;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const nameParam = (req.query.name || req.body?.name || '').trim();
  if (!nameParam) return res.status(400).json({ error: 'name required' });

  // Use derived canonicalId (no fuzzy match) so each exercise owns its own image slot.
  const { normName, canonicalId } = normalize(nameParam);

  // ── SERVE (img src) ──────────────────────────────────────────────────────
  if (req.method === 'GET' && req.query.serve === '1') {
    const card = await getCard(canonicalId);
    if (card?.image && streamDataUrl(res, card.image)) return;

    // Fallback: legacy exercise:manual:{slug} key
    const legacy = await redis('get', `exercise:manual:${legacySlug(nameParam)}`).catch(() => null);
    if (legacy && streamDataUrl(res, legacy)) return;

    return res.status(404).end();
  }

  // ── GET (check existence) ────────────────────────────────────────────────
  if (req.method === 'GET') {
    const card = await getCard(canonicalId);
    if (card?.image) return res.status(200).json({ hasImage: true });

    const legacy = await redis('get', `exercise:manual:${legacySlug(nameParam)}`).catch(() => null);
    return res.status(200).json({ hasImage: !!legacy });
  }

  // ── DELETE ───────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    await redis('hdel', `ex:lib:${canonicalId}`, 'image').catch(() => {});
    // Also drop any stale legacy key so it can't shadow the deletion.
    await redis('del', `exercise:manual:${legacySlug(nameParam)}`).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).end();

  const { imageData } = req.body || {};
  if (!imageData) return res.status(400).json({ error: 'imageData required' });

  try {
    // Pin alias to the derived canonicalId so that resolveId() in other code
    // (e.g. video API) also maps this exercise name to the correct card,
    // overriding any fuzzy match that may have been registered previously.
    await redis('hset', 'ex:alias', normName, canonicalId).catch(() => {});
    await setImage(nameParam, imageData);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
