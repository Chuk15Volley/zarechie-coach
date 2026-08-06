import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessDecisionFromSnapshot, strictestRecoveryStatus } from '../lib/readinessDecision.mjs';

test('latest low morning readiness reduces a future-day dose without changing method', () => {
  const result = readinessDecisionFromSnapshot({
    morning: [{ date: '2026-08-06', readiness: 1 }],
    latestMorning: { date: '2026-08-06', readiness: 1 },
    surveys: [],
    whoop: [],
    injuryLog: [],
  }, '2026-08-07', { testsExpected: true, neuroFresh: false });
  assert.equal(result.decision.level, 'red');
  assert.equal(strictestRecoveryStatus('green', result.decision.level), 'red');
});

test('manual red status stays red even when automatic readiness is green', () => {
  assert.equal(strictestRecoveryStatus('red', 'green'), 'red');
  assert.equal(strictestRecoveryStatus('yellow', 'green'), 'yellow');
});
