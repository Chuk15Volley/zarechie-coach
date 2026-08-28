// pages/api/exercises/serve-image.js
// GET ?name=... → fetches private Vercel Blob image and streams it to the browser.
// Auth-protected so only the trainer can access exercise images.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { validateImageBuffer } from '../../../lib/imageData';

export const config = { maxDuration: 15 };

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '');
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).end();
  if (req.method !== 'GET') return res.status(405).end();

  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).end();

  const blobUrl = await redis('get', `exercise:manual:${slugify(name)}`).catch(() => null);
  if (!blobUrl) return res.status(404).end();

  try {
    const parsed = new URL(blobUrl);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.blob.vercel-storage.com')) {
      return res.status(404).end();
    }
  } catch (_) {
    return res.status(404).end();
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    const upstream = await fetch(blobUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (!upstream.ok) return res.status(404).end();

    const contentType = upstream.headers.get('content-type') || '';
    const declaredLength = Number(upstream.headers.get('content-length') || 0);
    if (declaredLength > 3 * 1024 * 1024) return res.status(413).end();
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const validated = validateImageBuffer(buffer, contentType);
    res.setHeader('Content-Type', validated.mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(buffer);
  } catch (_) {
    return res.status(502).end();
  }
}
