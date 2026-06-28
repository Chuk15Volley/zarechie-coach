// pages/api/exercises/migrate.js
// POST → one-shot migration of legacy keys into the new exercise library.
//   Scans exercise:manual:*  → setImage(name, base64)
//   Scans exercise:yt-manual:* → setVideo(name, url)
// The slug is converted back to a name by replacing dashes with spaces; resolveId
// then normalises + dedupes, so differently-spelled duplicates collapse into one card.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { setImage, setVideo } from '../../../lib/exerciseLibrary';

export const config = { maxDuration: 60 };

// SCAN a pattern via Upstash REST: /scan/{cursor}/match/{pattern}/count/100
// Returns all matching keys (follows the cursor to completion).
async function scanKeys(pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const res = await redis('scan', cursor, 'match', pattern, 'count', '100').catch(() => null);
    // Upstash returns [nextCursor, [keys...]]
    if (!Array.isArray(res)) break;
    cursor = String(res[0]);
    const batch = res[1] || [];
    for (const k of batch) keys.push(k);
  } while (cursor !== '0');
  return keys;
}

function nameFromSlug(slug) {
  return slug.replace(/-/g, ' ').trim();
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  let migrated = 0;
  let skipped = 0;
  const errors = [];

  try {
    // ── Images ──────────────────────────────────────────────────────────────
    const imageKeys = await scanKeys('exercise:manual:*');
    for (const key of imageKeys) {
      const slug = key.slice('exercise:manual:'.length);
      const value = await redis('get', key).catch(() => null);
      if (!value) { skipped++; continue; }
      try {
        await setImage(nameFromSlug(slug), value);
        migrated++;
      } catch (e) {
        errors.push(`${key}: ${e.message}`);
      }
    }

    // ── Videos ──────────────────────────────────────────────────────────────
    const videoKeys = await scanKeys('exercise:yt-manual:*');
    for (const key of videoKeys) {
      const slug = key.slice('exercise:yt-manual:'.length);
      const value = await redis('get', key).catch(() => null);
      if (!value) { skipped++; continue; }
      try {
        await setVideo(nameFromSlug(slug), value);
        migrated++;
      } catch (e) {
        errors.push(`${key}: ${e.message}`);
      }
    }

    return res.status(200).json({ migrated, skipped, errors });
  } catch (e) {
    return res.status(500).json({ error: e.message, migrated, skipped, errors });
  }
}
