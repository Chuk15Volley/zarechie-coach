import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FINISH_REASONS, actualRepsFromTarget } from '../lib/playerWorkout.mjs';

function fixture({ failWrite = false, failRead = false } = {}) {
  const writes = [], memories = [];
  const session = { session: { blocks: [{ label: 'A', exercises: [
    { name: 'DB Row', targetSets: ['5/side', '5/side'], weightKg: 10 },
    { name: 'Plank', targetSets: ['30 сек'] },
  ] }] } };
  const deps = {
    redis: async (command, key, value) => { if (failRead) throw new Error('offline'); if (command === 'set') { writes.push(['SET', key, value]); return 'OK'; } return key.startsWith('session:') ? session : null; },
    redisPipeline: async commands => { writes.push(...commands); if (failWrite) throw new Error('write failed'); },
    resolveShareToken: async () => ({ playerId: 'synthetic', workspace: 'nkperf' }),
    pfx: w => w,
    sessionKey: (w, p, d) => `session:${w}:${p}:${d}`,
    feedbackKey: (w, p, d) => `feedback:${w}:${p}:${d}`,
    exhistKey: (w, p, ex) => `${w}:exhist:${p}:${ex}`,
    exweightKey: (w, p, ex) => `${w}:exweight:${p}:${ex}`,
    gymTonnageKey: (w, p, d) => `${w}:tonnage:${p}:${d}`,
    gymTonnageDatesKey: (w, p) => `${w}:dates:${p}`,
    normExName: name => name, exerciseId: ex => ex.name,
    loadUnitsForExercise: () => 1, weightKgFromExercise: ex => ex.weightKg || 0,
    sanitizeUnavailableEquipmentExercises: value => value,
    updateExerciseMemory: async (...args) => memories.push(args), linkPainToExercises: async () => {},
    FINISH_REASONS, actualRepsFromTarget,
  };
  const source = readFileSync(new URL('../pages/api/player/feedback.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
    .replace('export default async function', 'async function');
  const handler = new Function(...Object.keys(deps), `${source}; return handler;`)(...Object.values(deps));
  const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() {} };
  const request = { method: 'POST', body: { token: 'fake', date: '2026-09-17', rpe: 7, fatigue: 3, finishReason: 'Нет оборудования', done: { '0-0-0': true }, weights: { '0-0-0': '12,5' } } };
  return { handler, request, response, writes, memories };
}

test('partial workout stores only completed actuals and an explicit finish reason', async () => {
  const f = fixture(); await f.handler(f.request, f.response);
  assert.equal(f.response.statusCode, 200);
  const actual = JSON.parse(f.writes.find(cmd => cmd[1] === 'nkperf:session:actual:synthetic:2026-09-17')[2]);
  assert.equal(actual.finishReason, 'Нет оборудования');
  assert.equal(actual.actualTonnage, 125);
  assert.equal(actual.exercises[0].completedSets, 1);
  assert.equal(actual.exercises[1].completedSets, 0);
  assert.deepEqual(f.memories[0][1].map(ex => ex.name), ['DB Row']);
  assert.ok(f.writes.every(cmd => !String(cmd[1]).includes('coach:')));
});

test('failed actuals write returns retryable error instead of a feedback-only success', async () => {
  const f = fixture({ failWrite: true }); await f.handler(f.request, f.response);
  assert.equal(f.response.statusCode, 503); assert.equal(f.memories.length, 0);
  assert.equal(f.writes.some(cmd => String(cmd[1]).startsWith('feedback:')), false);
});

test('unavailable session storage cannot produce a false successful submission', async () => {
  const f = fixture({ failRead: true }); await f.handler(f.request, f.response);
  assert.equal(f.response.statusCode, 503); assert.equal(f.writes.length, 0);
});
