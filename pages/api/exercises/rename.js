// pages/api/exercises/rename.js
// PUT { canonicalId, newTitle } → { ok }
// Renames a library card: updates title + registers English alias → same canonicalId.
// The old canonicalId is preserved so images and videos are NOT lost.
import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { normalize } from '../../../lib/exerciseLibrary';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { canonicalId, newTitle } = req.body || {};
  if (!canonicalId || !newTitle?.trim()) {
    return res.status(400).json({ error: 'canonicalId and newTitle required' });
  }

  const clean = newTitle.trim();
  const { normName } = normalize(clean);
  const ts = String(Date.now());

  await redis('hset', `ex:lib:${canonicalId}`, 'title', clean, 'updatedAt', ts);
  // Register English normName → same canonicalId so future lookups succeed.
  await redis('hset', 'ex:alias', normName, canonicalId);

  return res.status(200).json({ ok: true, newTitle: clean });
}
