import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { playerId, photoUrl } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

  if (!photoUrl) {
    await redis('del', `player:photo:${playerId}`).catch(() => {});
  } else {
    try { new URL(photoUrl); } catch (_) { return res.status(400).json({ error: 'Invalid URL' }); }
    await redis('set', `player:photo:${playerId}`, photoUrl).catch(() => {});
  }

  res.status(200).json({ ok: true });
}
