// pages/api/exercises/image.js
// POST { name } → exercise illustration URL via Pollinations.ai (no auth needed),
// URL cached in Redis by exercise name slug.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

// Deterministic seed so same exercise always generates same illustration
function slugSeed(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (Math.imul(31, h) + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 1_000_000;
}

function buildPrompt(name) {
  return (
    `anatomical fitness illustration, athlete performing "${name}", ` +
    `black ink line art on white background, side view, full body, ` +
    `sports science textbook style, no text, no shading, clean lines`
  );
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const slug = slugify(name);
  const cacheKey = `exercise:pollinations:${slug}`;

  // Return cached URL immediately if available
  try {
    const cached = await redis('get', cacheKey);
    if (cached) return res.status(200).json({ image: cached, cached: true });
  } catch (_) {}

  const seed = slugSeed(slug);
  const prompt = buildPrompt(name);
  const imageUrl =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=512&height=512&nologo=true&model=flux&seed=${seed}`;

  // Cache the URL (not the binary — browser loads image directly from Pollinations)
  redis('set', cacheKey, imageUrl).catch(() => {});

  return res.status(200).json({ image: imageUrl, cached: false });
}
