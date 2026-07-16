import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { playerPhotoKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { playerId, photoUrl, workspace = 'zarechie' } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'Missing playerId' });
  const key = playerPhotoKey(workspace, playerId);

  if (!photoUrl) {
    await redis('del', key).catch(() => {});
    if (workspace === 'zarechie') await redis('del', `player:photo:${playerId}`).catch(() => {});
  } else {
    try { new URL(photoUrl); } catch (_) { return res.status(400).json({ error: 'Invalid URL' }); }
    await redis('set', key, photoUrl).catch(() => {});
  }

  res.status(200).json({ ok: true });
}
