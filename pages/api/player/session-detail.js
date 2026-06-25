import { redis } from '../../../lib/redis';

export default async function handler(req, res) {
  const { token, date } = req.query;
  if (!token || !date) return res.status(400).json({ error: 'Missing params' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

  const playerId = await redis('get', `coach:share_token:${token}`).catch(() => null);
  if (!playerId) return res.status(404).json({ error: 'Invalid token' });

  const raw = await redis('get', `coach:session:${playerId}:${date}`).catch(() => null);
  if (!raw) return res.status(404).json({ error: 'Not found' });

  let session;
  try { session = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) {
    return res.status(500).json({ error: 'Parse error' });
  }

  res.status(200).json({ session });
}
