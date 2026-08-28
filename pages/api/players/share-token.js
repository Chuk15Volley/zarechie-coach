// pages/api/players/share-token.js
// POST { playerId } → { token }
// Creates or retrieves a persistent cryptographically-random share token per player.
// The token is used in the player page URL instead of the internal player ID.
// Token → playerId mapping is stored in Redis and never exposed to the client.

import crypto from 'crypto';
import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { playerShareKey, shareTokenKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, workspace = 'zarechie', action = 'get' } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  const current = await redis('get', playerShareKey(workspace, playerId)).catch(() => null);
  if (action === 'revoke') {
    const commands = [['DEL', playerShareKey(workspace, playerId)]];
    if (current) commands.push(['DEL', shareTokenKey(workspace, current)]);
    await redisPipeline(commands);
    return res.status(200).json({ revoked: true });
  }

  if (!['get', 'rotate'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

  // Return existing token if already generated for this player
  if (action === 'get' && current && typeof current === 'string' && current.length > 8) {
    const raw = await redis('get', shareTokenKey(workspace, current)).catch(() => null);
    let metadata = null;
    try { metadata = raw && String(raw).startsWith('{') ? JSON.parse(raw) : null; } catch (_) {}
    if (raw) return res.status(200).json({ token: current, createdAt: metadata?.createdAt || null, rotatedAt: metadata?.rotatedAt || null });
  }

  // Generate new 40-char hex token (160 bits — cryptographically unguessable)
  const token = crypto.randomBytes(20).toString('hex');
  const now = new Date().toISOString();
  const payload = JSON.stringify({ playerId: String(playerId), workspace, createdAt: now, rotatedAt: action === 'rotate' ? now : null });

  const commands = [
    ['SET', shareTokenKey(workspace, token), payload],
    ['SET', playerShareKey(workspace, playerId), token],
  ];
  if (action === 'rotate' && current) commands.push(['DEL', shareTokenKey(workspace, current)]);
  await redisPipeline(commands);

  return res.status(200).json({ token, rotated: action === 'rotate', createdAt: now });
}
