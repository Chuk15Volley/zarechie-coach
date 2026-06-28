// pages/api/exercises/sync-videos.js
// POST → scans exercise:yt:* cache and persists every non-'none' URL into ex:lib.
// One-time backfill; safe to re-run (overwrite:false never clobbers a manual link).

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { setVideo } from '../../../lib/exerciseLibrary';

export const config = { maxDuration: 60 };

async function scanKeys(pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const res = await redis('scan', cursor, 'match', pattern, 'count', '100').catch(() => null);
    if (!Array.isArray(res)) break;
    cursor = String(res[0]);
    (res[1] || []).forEach(k => keys.push(k));
  } while (cursor !== '0');
  return keys;
}

function nameFromSlug(slug) {
  return slug.replace(/-/g, ' ').trim();
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  let synced = 0, skipped = 0;
  const errors = [];

  try {
    const keys = await scanKeys('exercise:yt:*');
    for (const key of keys) {
      const slug = key.slice('exercise:yt:'.length);
      const url = await redis('get', key).catch(() => null);
      if (!url || url === 'none') { skipped++; continue; }
      const name = nameFromSlug(slug);
      try {
        await setVideo(name, url, { overwrite: false });
        synced++;
      } catch (e) {
        errors.push(`${key}: ${e.message}`);
      }
    }
    return res.status(200).json({ synced, skipped, errors, total: keys.length });
  } catch (e) {
    return res.status(500).json({ error: e.message, synced, skipped, errors });
  }
}
