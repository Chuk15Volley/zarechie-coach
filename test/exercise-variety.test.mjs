import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExerciseVarietyContext, auditExerciseVariety, varietyExerciseKey, formatExerciseVarietyForPrompt, preferVarietyCorrection } from '../lib/exerciseVariety.mjs';
import { assessSessionQuality } from '../lib/sessionValidator.js';
import { advisorySessionQuality } from '../lib/sessionQualityPolicy.mjs';

const session = (...names) => ({ blocks: [{ label: 'F', exercises: names.map((name, i) => ({ code: `F${i + 1}`, name })) }] });
const record = (date, focus, ...names) => ({ date, focus, session: session(...names) });
const targetDate = '2026-09-16';
// Exercise every exposed method and body-region selection, including legacy
// methods that remain accepted by saved plans and API clients.
const source = readFileSync(new URL('../pages/api/programs/generate.js', import.meta.url), 'utf8');
const labels = source.slice(source.indexOf('const FOCUS_LABELS'), source.indexOf('const MANUAL_FOCUS_LABELS'));
const focuses = [...labels.matchAll(/^  (\w+):/gm)].map(match => match[1]);
for (const focus of focuses) {
  for (const trainingType of ['anterior_chain', 'posterior_chain', 'full_body', 'recovery_prehab', 'activation_power']) {
    test(`${focus}/${trainingType}: detects repeated F-block and accepts fresh variant`, () => {
      const context = buildExerciseVarietyContext([
        record('2026-09-10', focus, 'Dumbbell Row'), record('2026-09-14', focus, 'DB Row'),
      ], { targetDate, focus, trainingType });
      const result = auditExerciseVariety(session('DB Row'), context);
      assert.equal(result.repeated[0].thirdConsecutive, true);
      assert.equal(result.needsCorrection, !context.protectedProtocol);
      assert.equal(auditExerciseVariety(session('Cable Row'), context).ok, true);
      assert.match(formatExerciseVarietyForPrompt(context), /две программы подряд/);
    });
  }
}

test('window includes previous two programs and same-method history; excludes same day and future', () => {
  const context = buildExerciseVarietyContext([
    record('2026-09-17', 'strength', 'Future'), record('2026-09-16', 'strength', 'Today'),
    record('2026-09-15', 'power', 'Latest'), record('2026-09-14', 'recovery', 'Previous'),
    record('2026-09-01', 'strength', 'Older strength'), record('2026-08-25', 'strength', 'Oldest strength'),
    record('2026-08-20', 'strength', 'Outside window'),
  ], { targetDate, focus: 'strength' });
  assert.deepEqual(context.historyDates, ['2026-08-25', '2026-09-01', '2026-09-14', '2026-09-15']);
  assert.equal(context.recent.length, 4);
});

test('at most two actual main anchors can repeat; relabeling accessories does not exempt them', () => {
  const previous = { date: '2026-09-15', focus: 'strength', session: { blocks: [{ exercises: [
    { code: 'A1', name: 'Trap Bar Deadlift' }, { code: 'B1', name: 'DB Press' },
    { code: 'C1', name: 'Cable Row' }, { code: 'E1', name: 'Pallof Press' },
  ] }] } };
  const context = buildExerciseVarietyContext([previous], { targetDate, focus: 'strength' });
  const result = auditExerciseVariety(previous.session, context);
  assert.equal(result.anchors, 2);
  assert.deepEqual(result.repeated.map(ex => ex.name), ['Cable Row', 'Pallof Press']);
  const disguised = { blocks: [{ exercises: [{ code: 'A1', name: 'Pallof Press' }] }] };
  assert.equal(auditExerciseVariety(disguised, context).needsCorrection, true);
  const recovery = buildExerciseVarietyContext([previous], { targetDate, focus: 'inseason_deload' });
  assert.equal(auditExerciseVariety(previous.session, recovery).anchors, 0);
});

test('name normalization preserves equipment and real variants, ignores abbreviations and dose', () => {
  assert.equal(varietyExerciseKey('Dumbbell Single-Leg RDL (RPE 6)'), varietyExerciseKey('DB one leg RDL'));
  assert.notEqual(varietyExerciseKey('Row (DB)'), varietyExerciseKey('Row (Cable)'));
  assert.notEqual(varietyExerciseKey('DB Row'), varietyExerciseKey('Cable Row'));
});

test('empty history does not invent repetitions; validator reports concrete repeated exercise', () => {
  assert.equal(auditExerciseVariety(session('DB Row'), buildExerciseVarietyContext([], { targetDate })).ok, true);
  const varietyContext = buildExerciseVarietyContext([record('2026-09-15', 'power', 'DB Row')], { targetDate, focus: 'power' });
  const quality = assessSessionQuality(session('DB Row'), { focus: 'power', varietyContext });
  assert.equal(quality.variety.needsCorrection, true);
  assert.match(quality.checks.find(check => check.id === 'variation').detail, /DB Row/);
});

test('repair prefers fresh safe result but rejects new safety or method failures', () => {
  const original = { valid: true, score: 95, checks: [{ id: 'safety', ok: true }, { id: 'power_method', ok: true }], variety: { needsCorrection: true } };
  const fresh = { ...original, score: 94, variety: { ok: true } };
  assert.equal(preferVarietyCorrection(fresh, original), true);
  for (const id of ['safety', 'power_method']) {
    assert.equal(preferVarietyCorrection({ ...fresh, checks: [{ id, ok: false }] }, original), false);
  }
  assert.equal(preferVarietyCorrection({ ...fresh, valid: false }, original), false);
});

test('remaining repetitions request coach review even when overall score is high', () => {
  const result = advisorySessionQuality({ valid: true, score: 97, checks: [], variety: { needsCorrection: true } });
  assert.equal(result.reviewRequired, true);
  assert.equal(result.blocking, false);
});

test('Redis history filters by date before limiting and stays in the requested workspace', async () => {
  let historySource = readFileSync(new URL('../lib/sessionHistory.js', import.meta.url), 'utf8');
  historySource = historySource.replace("import { redis, redisPipeline } from './redis';", `
    const redis = async (...args) => { globalThis.__varietyRedisCalls.push(args); return ['2026-09-15', '2026-09-14']; };
    const redisPipeline = async commands => { globalThis.__varietyRedisCalls.push(commands); return commands.map(() => JSON.stringify({session:{blocks:[{exercises:[]}]}})); };
  `).replace("import { pfx, sessionKey } from './workspacePrefix';", `const pfx = workspace => workspace === 'nkperf' ? 'nkperf' : 'coach';`);
  globalThis.__varietyRedisCalls = [];
  try {
    const { getRecentSessionRecords } = await import(`data:text/javascript;base64,${Buffer.from(historySource).toString('base64')}`);
    const records = await getRecentSessionRecords('p1', 12, 'nkperf', targetDate);
    assert.deepEqual(globalThis.__varietyRedisCalls[0], ['zrevrangebyscore', 'nkperf:sessions:p1', '20260915', '-inf', 'LIMIT', 0, 12]);
    assert.equal(globalThis.__varietyRedisCalls[1][0][1], 'nkperf:session:p1:2026-09-14');
    assert.deepEqual(records.map(rec => rec.date), ['2026-09-14', '2026-09-15']);
  } finally { delete globalThis.__varietyRedisCalls; }
});
