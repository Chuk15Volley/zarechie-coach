// pages/api/exercises/image.js
// POST { name } → a minimalist line-art instructional diagram for one exercise, generated via
// Gemini's image-capable model and cached forever in Redis by exercise name. First request for
// a given exercise pays the generation cost/latency; every later request (any player, any day)
// is an instant cache hit — the illustration library effectively builds itself over time.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

const STYLE_PROMPT = `Create a single minimalist black-and-white line-art instructional diagram of a person performing the exercise named below, in the style of a professional strength & conditioning coach's exercise reference card.
Strict style rules: clean white background, no text, no labels, no logos, no shading or color — pure black line-art silhouette/stick-figure style, side or 3/4 view, simple motion arrows only where they help show the movement direction (e.g. an upward arrow for a jump). Square composition, the figure centered and filling most of the frame.
Exercise: `;

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name required' });
  }

  const slug = slugify(name);
  const cacheKey = `exercise:image:${slug}`;

  try {
    const cached = await redis('get', cacheKey);
    if (cached) {
      return res.status(200).json({ image: cached, cached: true });
    }
  } catch (e) {
    // Cache lookup failing shouldn't block generation — just skip the cache this time.
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'GEMINI_API_KEY не настроен в переменных среды Vercel' });
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: STYLE_PROMPT + name }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      }
    );

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `Image API error ${r.status}` });
    }

    const data = await r.json();
    const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part) {
      return res.status(502).json({ error: 'Модель не вернула изображение для этого упражнения' });
    }

    const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;

    redis('set', cacheKey, dataUrl).catch(() => {});

    return res.status(200).json({ image: dataUrl, cached: false });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
