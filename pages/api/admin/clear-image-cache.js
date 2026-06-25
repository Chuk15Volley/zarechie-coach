// pages/api/admin/clear-image-cache.js
// POST → scans Redis for all exercise:dalle3:* keys and deletes them.
// Auth: trainer API key (isAuthorized). One-time use to purge stale image cache.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  try {
    let cursor = '0';
    const keysToDelete = [];

    // Paginate through all matching keys
    do {
      const result = await redis('scan', cursor, 'match', 'exercise:dalle3:*', 'count', '200');
      if (!Array.isArray(result)) break;
      const [nextCursor, keys] = result;
      cursor = String(nextCursor ?? '0');
      if (Array.isArray(keys) && keys.length > 0) {
        keysToDelete.push(...keys);
      }
    } while (cursor !== '0');

    // Delete in parallel batches of 20
    for (let i = 0; i < keysToDelete.length; i += 20) {
      const batch = keysToDelete.slice(i, i + 20);
      await Promise.all(batch.map(key => redis('del', key).catch(() => {})));
    }

    return res.status(200).json({ deleted: keysToDelete.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
