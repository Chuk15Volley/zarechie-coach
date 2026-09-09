export function sessionInventory(snapshot) {
  const prefix = snapshot.workspace === 'zarechie' ? 'coach' : snapshot.workspace === 'nkperf' ? 'nkperf' : null;
  if (!prefix) throw new Error('Invalid backup workspace');
  const players = {};
  for (const entry of snapshot.entries) {
    const match = entry.key.match(new RegExp(`^${prefix}:session:([^:]+):(\\d{4}-\\d{2}-\\d{2})$`));
    if (match && entry.type === 'string' && entry.ttlMs !== -2) (players[match[1]] ||= []).push(match[2]);
  }
  for (const dates of Object.values(players)) dates.sort();
  return { workspace: snapshot.workspace, backupId: snapshot.id, createdAt: snapshot.createdAt, players, sessionCount: Object.values(players).reduce((sum, dates) => sum + dates.length, 0) };
}

export function compareSessionInventory(baseline, current) {
  if (!baseline || baseline.workspace !== current.workspace || !baseline.players) throw new Error('Invalid history baseline');
  const missing = [];
  for (const [id, dates] of Object.entries(baseline.players)) {
    const available = new Set(current.players[id] || []);
    for (const date of dates) if (!available.has(date)) missing.push({ playerId: id, date });
  }
  return { ok: missing.length === 0, missingCount: missing.length, missing };
}

// Blob listing is paginated and ordered by pathname, not newest-first.
export async function newestBackupBlobs(listPage, prefix, limit) {
  const blobs = []; let cursor;
  do {
    const page = await listPage({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    blobs.push(...page.blobs.filter(blob => blob.pathname.endsWith('.backup')));
    if (page.hasMore && (!page.cursor || page.cursor === cursor)) throw new Error('Invalid backup pagination');
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt) || b.pathname.localeCompare(a.pathname)).slice(0, limit);
}
