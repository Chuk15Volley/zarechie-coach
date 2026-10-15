import { isAuthorized } from '../../../lib/auth';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { preventionOverview } from '../../../lib/prevention/store';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!['zarechie', 'nkperf'].includes(req.query.workspace)) return res.status(400).json({ error: 'Некорректное пространство.' });
  if (!await enforceRateLimit(req, res, { scope: 'prevention-overview', limit: 60, windowSeconds: 600 })) return;
  try { return res.status(200).json(await preventionOverview(req.query.workspace)); }
  catch { return res.status(503).json({ error: 'Не удалось загрузить обзор профилактики. Повторите загрузку.' }); }
}
