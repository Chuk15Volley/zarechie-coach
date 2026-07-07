import { redis } from './redis';
import { shareTokenKey } from './workspacePrefix';

const WORKSPACES = ['zarechie', 'nkperf'];

function parseTokenPayload(raw, workspace) {
  if (!raw) return null;
  if (typeof raw === 'object') {
    const playerId = raw.playerId != null ? String(raw.playerId) : '';
    return playerId ? { playerId, workspace: raw.workspace || workspace } : null;
  }
  const value = String(raw);
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      const playerId = parsed?.playerId != null ? String(parsed.playerId) : '';
      return playerId ? { playerId, workspace: parsed.workspace || workspace } : null;
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
