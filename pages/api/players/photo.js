import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { playerPhotoKey } from '../../../lib/workspacePrefix';

function idVariants(playerId) {
  const raw = String(playerId || '').trim();
  if (!raw) return [];
  const variants = [raw];
  if (raw.startsWith('whoop_')) variants.push(raw.replace(/^whoop_/, ''));
  else if (/^\d+$/.test(raw)) variants.push(`whoop_${raw}`);
  return [...new Set(variants)];
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { playerId, photoUrl, workspace = 'zarechie' } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'Missing playerId' });
  const ids = idVariants(playerId);

  if (!photoUrl) {
    await Promise.all(ids.flatMap(id => [
      redis('del', playerPhotoKey(workspace, id)).catch(() => {}),
      workspace === 'zarechie' ? redis('del', `player:photo:${id}`).catch(() => {}) : Promise.resolve(),
    ]));
  } else {
    if (!String(photoUrl).startsWith('data:image/')) {
      try { new URL(photoUrl); } catch (_) { return res.status(400).json({ error: 'Invalid URL' }); }
    }
    await Promise.all(ids.flatMap(id => [
      redis('set', playerPhotoKey(workspace, id), photoUrl).catch(() => {}),
      workspace === 'zarechie' ? redis('set', `player:photo:${id}`, photoUrl).catch(() => {}) : Promise.resolve(),
    ]));
  }

  res.status(200).json({ ok: true });
}
