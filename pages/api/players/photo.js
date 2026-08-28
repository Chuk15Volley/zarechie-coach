import crypto from 'node:crypto';
import { redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { playerPhotoKey } from '../../../lib/workspacePrefix';
import { decodeImageDataUrl } from '../../../lib/imageData';
import { legacyPlayerPhotoKey } from '../../../lib/playerPhotos';

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

  if (req.method === 'GET') {
    const playerId = String(req.query.playerId || '').trim();
    const workspace = req.query.workspace === 'nkperf' ? 'nkperf' : 'zarechie';
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(playerId)) return res.status(400).json({ error: 'Invalid playerId' });
    const commands = idVariants(playerId).flatMap(id => [
      ['GET', playerPhotoKey(workspace, id)],
      ...(workspace === 'zarechie' ? [['GET', legacyPlayerPhotoKey(id)]] : []),
    ]);
    const values = await redisPipeline(commands).catch(() => []);
    const value = values.find(candidate => {
      if (String(candidate || '').startsWith('data:')) {
        try { decodeImageDataUrl(candidate); return true; } catch (_) { return false; }
      }
      try { return new URL(String(candidate)).protocol === 'https:'; } catch (_) { return false; }
    });
    if (!value) return res.status(404).end();

    if (String(value).startsWith('data:')) {
      try {
        const { buffer, mimeType } = decodeImageDataUrl(value);
        const etag = `"${crypto.createHash('sha256').update(buffer).digest('hex')}"`;
        const versioned = /^[a-f0-9]{12}$/.test(String(req.query.v || ''));
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', versioned ? 'private, max-age=31536000, immutable' : 'private, max-age=300');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', String(buffer.length));
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        return res.status(200).send(buffer);
      } catch (_) {
        return res.status(404).end();
      }
    }

    try {
      const parsed = new URL(String(value));
      if (parsed.protocol !== 'https:') throw new Error('Invalid photo URL');
      const versioned = /^[a-f0-9]{12}$/.test(String(req.query.v || ''));
      res.setHeader('Cache-Control', versioned ? 'private, max-age=31536000, immutable' : 'private, max-age=300');
      return res.redirect(302, parsed.toString());
    } catch (_) {
      return res.status(404).end();
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }

  const { playerId, photoUrl } = req.body || {};
  const workspace = req.body?.workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(playerId || '').trim())) return res.status(400).json({ error: 'Invalid playerId' });
  const ids = idVariants(playerId);

  if (!photoUrl) {
    try {
      await redisPipeline(ids.flatMap(id => [
        ['DEL', playerPhotoKey(workspace, id)],
        ...(workspace === 'zarechie' ? [['DEL', legacyPlayerPhotoKey(id)]] : []),
      ]));
    } catch (_) {
      return res.status(503).json({ error: 'Photo storage is temporarily unavailable' });
    }
  } else {
    if (String(photoUrl).startsWith('data:')) {
      try { decodeImageDataUrl(photoUrl); } catch (error) { return res.status(400).json({ error: error.message }); }
    } else {
      try {
        const parsed = new URL(photoUrl);
        if (parsed.protocol !== 'https:' || String(photoUrl).length > 2048) throw new Error('Invalid URL');
      } catch (_) { return res.status(400).json({ error: 'Invalid URL' }); }
    }
    try {
      await redisPipeline(ids.flatMap(id => [
        ['SET', playerPhotoKey(workspace, id), photoUrl],
        ...(workspace === 'zarechie' ? [['SET', legacyPlayerPhotoKey(id), photoUrl]] : []),
      ]));
    } catch (_) {
      return res.status(503).json({ error: 'Photo storage is temporarily unavailable' });
    }
  }

  res.status(200).json({ ok: true });
}
