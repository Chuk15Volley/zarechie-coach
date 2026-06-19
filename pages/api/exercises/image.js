// pages/api/exercises/image.js
// POST { name } → exercise illustration via Gemini Flash image generation,
// cached in Redis by exercise name slug.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function buildPrompt(name) {
  return (
    `Black and white anatomical fitness illustration of the exercise "${name}". ` +
    `Style: professional sports science textbook line art. Clean white background, black ink lines only. ` +
    `Full body athlete shown in the correct starting or mid-movement position of the exercise. ` +
    `Clear muscle engagement visible. Side or 3/4 angle view. No text, no labels, no shading, no color.`
  );
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const slug = slugify(name);
  const cacheKey = `exercise:flash:${slug}`;

  try {
    const cached = await redis('get', cacheKey);
    if (cached) return res.status(200).json({ image: cached, cached: true });
  } catch (_) {}

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY не настроен' });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(name) }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      }
    );

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `Gemini API error ${r.status}` });
    }

    const data = await r.json();
    const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part?.inlineData?.data) {
      return res.status(502).json({ error: 'Gemini не вернул изображение' });
    }

    const dataUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
    redis('set', cacheKey, dataUrl).catch(() => {});

    return res.status(200).json({ image: dataUrl, cached: false });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
