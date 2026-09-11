import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionInventory, compareSessionInventory, newestBackupBlobs } from '../lib/backupIntegrity.mjs';
const snapshot = { workspace: 'zarechie', id: 'backup', createdAt: '2026-09-04T00:00:00Z', entries: [
  { key: 'coach:session:1:2026-07-17', type: 'string', ttlMs: -1 },
  { key: 'coach:session:1:2026-09-04', type: 'string', ttlMs: -1 },
  { key: 'coach:session:1:2026-09-04:versions', type: 'list' },
  { key: 'nkperf:session:2:2026-09-04', type: 'string' },
] };
test('rollback to July is detected even if fresh workouts increase total count', () => {
  const baseline = sessionInventory(snapshot);
  assert.equal(baseline.sessionCount, 2);
  const current = { workspace: 'zarechie', players: { 1: ['2026-07-17', '2026-09-10', '2026-09-11'] } };
  assert.deepEqual(compareSessionInventory(baseline, current), { ok: false, missingCount: 1, missing: [{ playerId: '1', date: '2026-09-04' }] });
  assert.equal(compareSessionInventory(baseline, baseline).ok, true);
  assert.throws(() => compareSessionInventory(baseline, { workspace: 'nkperf' }));
});
test('latest archive is selected across ALL Blob pages before applying limit', async () => {
  const calls = [];
  const newest = await newestBackupBlobs(async options => {
    calls.push(options);
    return options.cursor ? { hasMore: false, blobs: [{ pathname: 'backups/new.backup', uploadedAt: '2026-09-04' }] } : { hasMore: true, cursor: 'page2', blobs: [{ pathname: 'backups/old.backup', uploadedAt: '2026-08-28' }] };
  }, 'backups/', 1);
  assert.equal(calls.length, 2);
  assert.equal(newest[0].pathname, 'backups/new.backup');
});
test('broken pagination fails instead of silently selecting an old archive', async () => {
  await assert.rejects(newestBackupBlobs(async () => ({ blobs: [], hasMore: true }), 'backups/', 1));
});
test('exercise disappearance is detected even when other cards are added', () => {
  const baseline = sessionInventory({...snapshot, entries: [...snapshot.entries, {key:'ex:lib:archived',type:'hash',ttlMs:-1}]});
  assert.deepEqual(baseline.libraryIds,['archived']);
  assert.equal(compareSessionInventory(baseline,{...baseline,libraryIds:['new']}).ok,false);
  assert.equal(compareSessionInventory(baseline,{...baseline,libraryIds:['new','archived']}).ok,true);
  assert.deepEqual(sessionInventory({...snapshot,workspace:'nkperf'}).libraryIds,[]);
});
