// pages/api/exercises/image.js
// POST { name } → anatomical SVG exercise illustration via Claude Sonnet,
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

const SYSTEM_PROMPT = `You are a professional sports science illustrator specialising in anatomical exercise diagrams for fitness textbooks and coaching manuals. You draw clean, accurate SVG line-art illustrations showing athletes in correct exercise positions.`;

function buildUserPrompt(name) {
  return `Draw an SVG illustration of the exercise: "${name}"

MANDATORY RULES — follow exactly:
1. SVG attributes: viewBox="0 0 300 360" width="300" height="360"
2. First child: <rect width="300" height="360" fill="white"/>
3. All shapes: stroke="#1a1a1a" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
4. Draw a realistic human figure (NOT a stick figure) using:
   - Head: circle or ellipse (~20px radius) with short neck
   - Shoulders: a wide arc or curve connecting neck to upper arms
   - Torso: quadrilateral shape (wider at shoulders, narrower at hips) with a subtle spine line down the centre
   - Upper arms: curved lines from shoulders to elbows
   - Forearms: lines from elbows to wrists with small hand shapes (3 finger lines)
   - Thighs: thick curved shapes from hips to knees
   - Calves/shins: shapes from knees to ankles
   - Feet: small angled shapes at ankles
5. Show the CORRECT body position for "${name}":
   - Precise joint angles appropriate for this exercise
   - Spine aligned correctly (neutral / hinged / arched as the movement requires)
   - Include any equipment: barbell with weight plates, dumbbells, bench, box, cable, resistance band, etc.
6. Use a side view (90°) or 3/4 view — whichever shows the movement most clearly
7. Equipment drawing tips:
   - Barbell: a long horizontal rect (stroke only) with circular weight plates on each end
   - Dumbbells: two short rects connected by a thin bar
   - Bench: a rectangular platform on two vertical legs
8. Add subtle muscle belly curves (1-2 px lighter stroke) on major working muscles to show engagement
9. NO text, NO labels, NO annotations, NO colour fills — pure black lines on white only

Output ONLY the raw SVG code. Begin with <svg and end with </svg>. No markdown, no explanation.`;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const slug = slugify(name);
  const cacheKey = `exercise:svg:${slug}`;

  try {
    const cached = await redis('get', cacheKey);
    if (cached) return res.status(200).json({ image: cached, cached: true });
  } catch (_) {}

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY не настроен' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(name) }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `API error ${response.status}` });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text?.trim() || '';

    // Extract SVG — strip any markdown fences if Claude added them
    const svgMatch = raw.match(/<svg[\s\S]*?<\/svg>/i);
    if (!svgMatch) {
      return res.status(502).json({ error: 'Модель не вернула SVG' });
    }

    const svg = svgMatch[0];
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

    redis('set', cacheKey, dataUrl).catch(() => {});

    return res.status(200).json({ image: dataUrl, cached: false });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
