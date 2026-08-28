import { redis } from './redis';
import { shareTokenKey } from './workspacePrefix';

const WORKSPACES = ['zarechie', 'nkperf'];

function parseTokenPayload(raw, workspace) {
  if (!raw) return null;
  if (typeof raw === 'object') {
    const playerId = raw.playerId != null ? String(raw.playerId) : '';
    if (!playerId || raw.revokedAt) return null;
    if (raw.expiresAt && new Date(raw.expiresAt).getTime() <= Date.now()) return null;
    return { ...raw, playerId, workspace: raw.workspace || workspace };
  }
  const value = String(raw);
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      const playerId = parsed?.playerId != null ? String(parsed.playerId) : '';
      if (!playerId || parsed.revokedAt) return null;
      if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
      return { ...parsed, playerId, workspace: parsed.workspace || workspace };
    } catch {
      return null;
    }
  }
  return { playerId: value, workspace };
}

export async function resolveShareToken(token) {
  if (!token) return null;
  for (const workspace of WORKSPACES) {
    const raw = await redis('get', shareTokenKey(workspace, token)).catch(() => null);
    const resolved = parseTokenPayload(raw, workspace);
    if (resolved?.playerId) return resolved;
  }
  return null;
}
