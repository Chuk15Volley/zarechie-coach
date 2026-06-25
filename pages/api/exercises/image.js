// pages/api/exercises/image.js
// POST { name } → gpt-image-1 exercise illustration.
// PNG stored permanently in Vercel Blob; Redis caches the public URL (no TTL).
// Falls back to base64-in-Redis if Blob is unavailable.

import { createHash } from 'crypto';
import { put } from '@vercel/blob';
import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function promptHash(imgPrompt) {
  if (!imgPrompt) return 'default';
  return createHash('sha1').update(imgPrompt).digest('hex').slice(0, 8);
}

function buildPrompt(name, imgPrompt) {
  const subject = imgPrompt
    ? imgPrompt
    : `female volleyball strength athlete performing "${name}", correct mid-movement position, proper joint angles`;
  return (
    `Technical exercise illustration for a professional S&C coaching manual. ` +
    `Show: ${subject}. ` +
    `Drawing style: precise black ink line art on pure white background, like NSCA Essentials of Strength Training textbook diagrams. ` +
    `Requirements: full body visible, side or 3/4 angle, correct biomechanical joint positions clearly shown, ` +
    `equipment (barbell/dumbbell/kettlebell/band/box) drawn accurately with realistic proportions. ` +
    `Absolutely no color, no shading, no shadows, no background, no text, no labels, no watermarks. ` +
    `The key movement characteristic of this specific exercise must be immediately recognisable.`
  );
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, force, img_prompt } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const slug = slugify(name);
  const cacheKey = `exercise:dalle3:${slug}:${promptHash(img_prompt)}`;

  if (!force) {
    try {
      const cached = await redis('get', cacheKey);
      if (cached) return res.status(200).json({ image: cached, cached: true });
    } catch (_) {}
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен в Vercel' });

  // Dedup lock: prevent parallel requests for the same exercise from generating twice
  const lockKey = `${cacheKey}:lock`;
  try {
    const locked = await redis('set', lockKey, '1', 'NX', 'EX', '180');
    if (!locked) {
      // Another request is already generating this image — wait and return from cache
      await new Promise(r => setTimeout(r, 8000));
      const cached = await redis('get', cacheKey).catch(() => null);
      if (cached) return res.status(200).json({ image: cached, cached: true });
      // If still not cached after wait, fall through and generate anyway
    }
  } catch (_) {}

  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: buildPrompt(name, img_prompt),
        n: 1,
        size: '1024x1024',
        quality: 'high',
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.error?.message || `OpenAI error ${r.status}` });
    }

    const data = await r.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: 'OpenAI не вернул изображение' });

    // Try to store the PNG permanently in Vercel Blob and cache only its URL.
    try {
      const buffer = Buffer.from(b64, 'base64');
      const { url } = await put(`exercises/${slug}-${promptHash(img_prompt)}.png`, buffer, {
        access: 'public',
        contentType: 'image/png',
        addRandomSuffix: false, // deterministic path = one file per exercise
      });
      await redis('set', cacheKey, url).catch(e => console.error('Redis SET failed:', e.message));
      redis('del', lockKey).catch(() => {});
      return res.status(200).json({ image: url, cached: false });
    } catch (blobErr) {
      // Blob unavailable (e.g. BLOB_READ_WRITE_TOKEN not set yet) — fall back to base64 in Redis with TTL.
      console.error('Blob upload failed, falling back to Redis base64:', blobErr.message);
      const dataUrl = `data:image/png;base64,${b64}`;
      await redis('set', cacheKey, dataUrl, 'EX', 7776000).catch(e => console.error('Redis SET failed:', e.message));
      redis('del', lockKey).catch(() => {});
      return res.status(200).json({ image: dataUrl, cached: false });
    }
  } catch (e) {
    redis('del', lockKey).catch(() => {});
    return res.status(500).json({ error: e.message });
  }
}
