import {
  evaluateMatchDayPrimerScenario,
  MATCH_DAY_LIVE_SCENARIOS,
} from '../../../scripts/evaluate-match-day-primer-live.mjs';
import { isAuthorized } from '../../../lib/auth';
import { enforceRateLimit } from '../../../lib/rateLimit';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // This diagnostic endpoint is intentionally absent from production. Preview
  // deployments are protected by Vercel authentication and no player data is
  // read or persisted by the evaluator.
  if (process.env.VERCEL_ENV === 'production') return res.status(404).end();
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await enforceRateLimit(req, res, { scope: 'ai-match-day-evaluation', limit: 10, windowSeconds: 3600 })) return;

  const scenarioId = String(req.query?.scenario || '');
  if (!MATCH_DAY_LIVE_SCENARIOS.some(item => item.id === scenarioId)) {
    return res.status(400).json({
      error: 'Unknown scenario',
      scenarios: MATCH_DAY_LIVE_SCENARIOS.map(item => item.id),
    });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY is not configured for Preview' });
  }

  try {
    const result = await evaluateMatchDayPrimerScenario(process.env.OPENAI_API_KEY, scenarioId);
    return res.status(result.blocking || !result.valid ? 422 : 200).json(result);
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
}
