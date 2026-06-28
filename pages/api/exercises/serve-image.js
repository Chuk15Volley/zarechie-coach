// pages/api/exercises/serve-image.js
// GET ?name=... → fetches private Vercel Blob image and streams it to the browser.
// Auth-protected so only the trainer can access exercise images.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

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

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    const upstream = await fetch(blobUrl, { headers });
    if (!upstream.ok) return res.status(404).end();

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');

    const buf = await upstream.arrayBuffer();
    return res.send(Buffer.from(buf));
  } catch (_) {
    return res.status(502).end();
  }
}
