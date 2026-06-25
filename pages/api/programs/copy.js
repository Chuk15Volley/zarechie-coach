import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { fromPlayerId, toPlayerId, date } = req.body || {};
  if (!fromPlayerId || !toPlayerId || !date) return res.status(400).json({ error: 'Missing params' });

  const raw = await redis('get', `coach:session:${fromPlayerId}:${date}`).catch(() => null);
  if (!raw) return res.status(404).json({ error: 'Source session not found' });

  let record;
  try { record = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) {
    return res.status(500).json({ error: 'Parse error' });
  }

  // Look up target player info so the copy has correct player metadata
  const [rawWhoop, rawRoster] = await Promise.all([
    redis('get', `whoop:player:${toPlayerId}`).catch(() => null),
    redis('get', `roster:player:${toPlayerId}`).catch(() => null),
  ]);
  const rawPlayer = rawWhoop || rawRoster;
  let targetPlayer = null;
  if (rawPlayer) {
    try {
      const p = typeof rawPlayer === 'string' ? JSON.parse(rawPlayer) : rawPlayer;
      targetPlayer = {
        id: toPlayerId,
        name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        position: p.position || '',
      };
    } catch (_) {}
  }

  const newRecord = {
    ...record,
    player: targetPlayer || record.player,
    savedAt: new Date().toISOString(),
  };

  const dateScore = parseInt(date.replace(/-/g, ''), 10);
  await Promise.all([
    redis('set', `coach:session:${toPlayerId}:${date}`, JSON.stringify(newRecord)),
    redis('zadd', `coach:sessions:${toPlayerId}`, dateScore, date),
  ]);

  res.status(200).json({ ok: true });
}
