// pages/api/programs/generate-async.js
// POST { playerId, date, dayGoal, days, focus, notes, warmupSummary, teamUsedExercises }
// Submits one gym-session generation to the Anthropic Message Batches API (Sonnet 4.6, no
// 60s Vercel timeout) and returns a batchId the client polls via generate-status.js.
//
// Why batches: Sonnet produces noticeably better sessions than Haiku but takes 60-80s —
// over Vercel Hobby's 60s function cap. The Batch API runs the request asynchronously
// (typically 1-3 min) with no per-request timeout, and this endpoint only submits, so it
// returns in well under 5s.

import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';
import { buildGenerationInputs, buildSessionTool, SYSTEM_PROMPT } from './generate';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY не настроен в переменных среды Vercel' });
  }

  const { playerId, dayGoal = '' } = req.body || {};

  // Build the exact same SYSTEM_PROMPT / userPrompt / tool as the synchronous generator.
  const inputs = await buildGenerationInputs(req.body || {});
  if (inputs.error) return res.status(inputs.status || 400).json({ error: inputs.error });
  const { userPrompt, targetDate } = inputs;

  // Sonnet schema includes img_prompt (no token-budget concern in batch mode).
  const sessionTool = buildSessionTool({ includeImgPrompt: true });
  const customId = `gen-${playerId}-${Date.now()}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages/batches', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'message-batches-2024-09-24,prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            custom_id: customId,
            params: {
              model: 'claude-sonnet-4-6',
              max_tokens: 5000,
              system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
              messages: [{ role: 'user', content: userPrompt }],
              tools: [sessionTool],
              tool_choice: { type: 'tool', name: 'build_session' },
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `Batch API error ${response.status}` });
    }

    const data = await response.json();
    const batchId = data.id;
    if (!batchId) return res.status(502).json({ error: 'Batch API не вернул id' });

    console.log('BATCH submitted:', batchId);

    // Track the batch so generate-status can resolve playerId/date/dayGoal/customId later.
    await redis(
      'set',
      `coach:batch:${batchId}`,
      JSON.stringify({
        playerId: String(playerId),
        date: targetDate,
        dayGoal,
        customId,
        status: 'pending',
        submittedAt: new Date().toISOString(),
      }),
      'EX',
      3600,
    ).catch(e => console.error('Redis SET batch failed:', e.message));

    return res.status(200).json({ batchId, estimatedMinutes: 2 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
