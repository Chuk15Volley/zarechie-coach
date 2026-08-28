import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAttentionQueue, buildStationRotation, sessionPlanFact } from '../lib/floorOperations.mjs';
import { recommendLoad } from '../lib/loadProgression.mjs';

const coachPage = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
const playerPage = readFileSync(new URL('../pages/player/[id].js', import.meta.url), 'utf8');
const teamStatusApi = readFileSync(new URL('../pages/api/programs/team-status.js', import.meta.url), 'utf8');
const snapshotApi = readFileSync(new URL('../pages/api/system/snapshots.js', import.meta.url), 'utf8');
const recoveryApi = readFileSync(new URL('../pages/api/system/recovery-drill.js', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

const blockStats = [
  { label: 'A', exercises: [{ name: 'Trap Bar Deadlift' }], station: 'Штанга / трап-гриф' },
  { label: 'B', exercises: [{ name: 'Cable Row' }], station: 'Кроссовер' },
  { label: 'C', exercises: [{ name: 'Pallof Press Band' }], station: 'Резины' },
];

test('station rotation offsets groups to avoid opening on the same equipment', () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({
    player: { id: index + 1, name: `Игрок ${index + 1}` },
    status: { hasSession: true, live: { blockStats } },
  }));
  const groups = buildStationRotation(rows, 3);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(group => group.rotation[0].block), ['A', 'B', 'C']);
});

test('plan versus fact reports completion, tonnage and session RPE', () => {
  const session = { blocks: [{ exercises: [{ name: 'Deadlift', weightKg: 50, targetSets: ['5', '5'] }] }] };
  const fact = sessionPlanFact(session, { actualTonnage: 450, compliance: 100, sessionRpe: 7 }, { done: { '0-0-0': true, '0-0-1': true } });
  assert.equal(fact.completionPercent, 100);
  assert.equal(fact.plannedTonnage, 500);
  assert.equal(fact.tonnagePercent, 90);
  assert.equal(fact.sessionRpe, 7);
});

test('multi-exposure progression increases only after repeatable easy completions', () => {
  const recommendation = recommendLoad([
    { date: '2026-08-01', kg: 50, rpe: 6, completedSets: 3, plannedSets: 3 },
    { date: '2026-08-08', kg: 50, rpe: 6, completedSets: 3, plannedSets: 3 },
    { date: '2026-08-15', kg: 50, rpe: 6.5, completedSets: 3, plannedSets: 3 },
    { date: '2026-08-22', kg: 50, rpe: 6, completedSets: 3, plannedSets: 3 },
  ], { name: 'Trap Bar Deadlift' });
  assert.equal(recommendation.trend, 'increase');
  assert.equal(recommendation.confidence, 'high');
  assert.ok(recommendation.suggestedKg > 50);
});

test('pain and low completion take priority over progression', () => {
  const pain = recommendLoad([{ date: '2026-08-22', kg: 30, rpe: 6, completedSets: 3, plannedSets: 3, pain: true }], { name: 'DB Split Squat' });
  assert.equal(pain.trend, 'reduce');
  assert.ok(pain.suggestedKg < 30);
});

test('attention centre ranks red readiness and live failures first', () => {
  const rows = [{ player: { id: '1', name: 'Игрок' }, status: { hasSession: true, live: { alerts: ['Нет синхронизации более 2 минут'] } } }];
  const queue = buildAttentionQueue(rows, [{ id: '1', status: 'red', dataCompleteness: 25, doms: 4 }]);
  assert.equal(queue[0].priority, 100);
  assert.ok(queue.some(item => item.code === 'live_alert'));
  assert.ok(queue.some(item => item.code === 'data_missing'));
});

test('operations surfaces include live commands, batched status, checkpoints and CI', () => {
  assert.match(coachPage, /LIVE-вмешательство/);
  assert.match(coachPage, /Центр внимания тренера/);
  assert.match(coachPage, /Станции и ротация групп/);
  assert.match(playerPage, /api\/player\/commands/);
  assert.match(playerPage, /Сообщение тренера · LIVE/);
  assert.match(teamStatusApi, /redisPipeline/);
  assert.match(snapshotApi, /RESTORE \$\{id\}/);
  assert.match(snapshotApi, /createEncryptedBackup/);
  assert.match(coachPage, /Проверить восстановление/);
  assert.match(recoveryApi, /runRecoveryDrill/);
  assert.match(workflow, /npm run build/);
});
