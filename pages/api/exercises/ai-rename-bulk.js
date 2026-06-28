// pages/api/exercises/ai-rename-bulk.js
// POST {} → { renames: [{ canonicalId, oldTitle, newTitle }] }
// Sends all Russian-named library cards to Claude Haiku → gets professional English S&C names
// → updates title + registers English alias (images/videos preserved via same canonicalId).
import { getAllCards, normalize } from '../../../lib/exerciseLibrary';
import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cards = await getAllCards();
  if (!cards.length) return res.status(200).json({ renames: [], skipped: 0 });

  const toRename = cards.filter(c => /[а-яёА-ЯЁ]/.test(c.title || c.canonicalId));
  if (!toRename.length) return res.status(200).json({ renames: [], skipped: cards.length });

  const list = toRename.map((c, i) => `${i + 1}. ${c.title || c.canonicalId}`).join('\n');

  const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are an elite S&C coach. Translate each Russian exercise name to professional English S&C terminology.
Use standard nomenclature: modifier + equipment + movement + qualifier.
Examples: "Bulgarian Split Squat", "Trap Bar Romanian Deadlift", "Single-Leg Hip Thrust (DB)",
"Copenhagen Adductor Plank", "Pallof Press (Band)", "SL Eccentric Step-Down",
"Dead Bug", "Bird-Dog", "Slider Hamstring Curl", "KB Swing (Two-Hand)",
"Goblet Squat (KB)", "Box Jump (Bilateral)", "Countermovement Jump (CMJ)",
"Plyo Push-Up", "Inverted Row (TRX)", "Landmine Press", "DB Incline Press",
"MB Rotational Throw", "Y-T-W (Band)", "Band Pull-Apart", "Face Pull (Band)",
"RKC Plank", "Hollow Body Hold", "Suitcase Carry (DB)".
Return ONLY a JSON array, no explanation.

Russian names:
${list}

Return: [{"i":1,"name":"English Name"},{"i":2,"name":"English Name"},...]`,
      }],
    }),
  });

  if (!apiResponse.ok) {
    const err = await apiResponse.text().catch(() => '');
    return res.status(500).json({ error: 'Claude API error', raw: err.slice(0, 200) });
  }

  const aiData = await apiResponse.json();
  const text = aiData.content?.[0]?.text || '';
  const renames = [];

  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return res.status(500).json({ error: 'AI parse error', raw: text.slice(0, 300) });

    const parsed = JSON.parse(match[0]);
    for (const item of parsed) {
      const card = toRename[item.i - 1];
      if (!card || !item.name?.trim()) continue;

      const clean = item.name.trim();
      const { normName } = normalize(clean);
      const ts = String(Date.now());

      await redis('hset', `ex:lib:${card.canonicalId}`, 'title', clean, 'updatedAt', ts);
      await redis('hset', 'ex:alias', normName, card.canonicalId);

      renames.push({ canonicalId: card.canonicalId, oldTitle: card.title || card.canonicalId, newTitle: clean });
    }
  } catch (e) {
    return res.status(500).json({ error: 'AI parse error', raw: text.slice(0, 300) });
  }

  return res.status(200).json({ renames, skipped: cards.length - toRename.length });
}
