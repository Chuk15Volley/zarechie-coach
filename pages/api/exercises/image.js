// pages/api/exercises/image.js
// POST { name } → anatomical SVG exercise illustration via Claude Haiku,
// cached in Redis by slug. Returns data:image/svg+xml;base64,... URL.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

// Minimal fallback — shows a question-mark placeholder instead of error text
function fallbackSVG(name) {
  const label = name.length > 28 ? name.slice(0, 27) + '…' : name;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360" width="300" height="360">
  <rect width="300" height="360" fill="white"/>
  <circle cx="150" cy="155" r="55" stroke="#d1d5db" stroke-width="2" fill="none"/>
  <text x="150" y="165" text-anchor="middle" font-family="system-ui" font-size="52" fill="#d1d5db" font-weight="bold">?</text>
  <text x="150" y="300" text-anchor="middle" font-family="system-ui" font-size="11" fill="#9ca3af">${label}</text>
</svg>`;
}

function buildPrompt(name) {
  return `Draw a simple anatomical SVG of the exercise: "${name}"

STRICT OUTPUT FORMAT:
- Output ONLY the SVG. No markdown, no explanation.
- Start with: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360" width="300" height="360">
- Second line: <rect width="300" height="360" fill="white"/>
- End with: </svg>
- All elements: stroke="#1a1a1a" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"

FIGURE (use simple shapes, do NOT use complex paths):
- Head: <ellipse> circle ~18px radius
- Neck: <line>
- Torso: <rect> or <polygon> (shoulders wider than hips)
- Upper arms, forearms: <line> segments
- Hands: small <ellipse>
- Thighs, shins: <line> segments
- Feet: short angled <line>

EXERCISE POSITION: Show the body in correct position for "${name}" — correct joint angles, spine alignment, and any equipment (barbell, dumbbell, bench, cable machine, box).

Keep it SIMPLE. Use <line>, <ellipse>, <rect>, <polygon> only. Max ~40 elements.`;
}

function extractSVG(text) {
  if (!text) return null;
  // greedy match to get full SVG including all nested content
  const m = text.match(/<svg[\s\S]*<\/svg>/i);
  return m ? m[0] : null;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const slug = slugify(name);
  const cacheKey = `exercise:svg2:${slug}`;

  try {
    const cached = await redis('get', cacheKey);
    if (cached) return res.status(200).json({ image: cached, cached: true });
  } catch (_) {}

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY не настроен' });

  let svg = null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: buildPrompt(name) }],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const raw = data.content?.[0]?.text?.trim() || '';
      svg = extractSVG(raw);
    }
  } catch (_) {}

  // Always return something — fallback if Claude failed or didn't produce SVG
  if (!svg) {
    svg = fallbackSVG(name);
  }

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  redis('set', cacheKey, dataUrl).catch(() => {});

  return res.status(200).json({ image: dataUrl, cached: false });
}
