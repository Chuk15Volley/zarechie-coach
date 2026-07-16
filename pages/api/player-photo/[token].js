import { redis } from '../../../lib/redis';
import { resolveShareToken } from '../../../lib/shareToken';
import { playerPhotoKey } from '../../../lib/workspacePrefix';

function streamDataUrl(res, dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return false;
  const [, contentType, payload] = m;
  const buf = Buffer.from(payload, 'base64');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(buf);
  return true;
}

export default async function handler(req, res) {
  const { token } = req.query || {};
  const resolved = await resolveShareToken(token);
  if (!resolved?.playerId) {
    return res.redirect(302, '/nk-logo.jpg');
  }

  const { playerId, workspace } = resolved;
  const photo = await redis('get', playerPhotoKey(workspace, playerId)).catch(() => null);
  const legacy = !photo && workspace === 'zarechie'
    ? await redis('get', `player:photo:${playerId}`).catch(() => null)
    : null;
  const value = photo || legacy;

  if (!value) return res.redirect(302, '/nk-logo.jpg');
  if (streamDataUrl(res, value)) return;

  try {
    const u = new URL(value);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.redirect(302, value);
    }
  } catch {}

  return res.redirect(302, '/nk-logo.jpg');
}

