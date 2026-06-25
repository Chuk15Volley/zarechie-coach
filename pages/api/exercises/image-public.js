// pages/api/exercises/image-public.js
// POST { name, token, img_prompt? } → exercise illustration for player pages.
// Auth: share token (validates player, not trainer key). Cache-first, then generates.

import { createHash } from 'crypto';
import { redis } from '../../../lib/redis';

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
  if (req.method !== 'POST') return res.status(405).end();
  const { name, token, img_prompt } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  // Validate share token — cheap Redis lookup, no trainer key needed
  if (!token) return res.status(401).json({ error: 'token required' });
  const playerId = await redis('get', `coach:share_token:${token}`).catch(() => null);
  if (!playerId) return res.status(401).json({ error: 'invalid token' });

  const cacheKey = `exercise:dalle3:${slugify(name)}:${promptHash(img_prompt)}`;

  // Cache hit
  try {
    const cached = await redis('get', cacheKey);
    if (cached) return res.status(200).json({ image: cached, cached: true });
  } catch (_) {}

  // Generate
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'OpenAI not configured' });

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
    if (!b64) return res.status(502).json({ error: 'no image returned' });

    const dataUrl = `data:image/png;base64,${b64}`;
    redis('set', cacheKey, dataUrl, 'EX', 7776000).catch(e => console.error('Redis SET failed:', e.message));

    return res.status(200).json({ image: dataUrl, cached: false });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
