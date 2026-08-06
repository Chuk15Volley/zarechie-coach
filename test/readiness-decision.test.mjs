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

test('fresh post-morning questionnaire affects the dose decision', () => {
  const result = readinessDecisionFromSnapshot({
    morning: [{ date: '2026-08-06', readiness: 4 }],
    postMorningSurveys: [{
      date: '2026-08-06',
      fatigue: 5,
      tomorrowReadiness: 2,
      submittedAt: '2026-08-06T11:30:00.000Z',
    }],
    latestPostMorning: {
      date: '2026-08-06',
      fatigue: 5,
      tomorrowReadiness: 2,
      submittedAt: '2026-08-06T11:30:00.000Z',
    },
    surveys: [],
    whoop: [],
    injuryLog: [],
  }, '2026-08-06', { testsExpected: false });

  assert.equal(result.postMorning.date, '2026-08-06');
  assert.equal(result.postMorningFresh, true);
  assert.equal(result.decision.level, 'yellow');
});

test('fresh pain from any questionnaire is normalized and blocks normal loading', () => {
  const result = readinessDecisionFromSnapshot({
    morning: [{
      date: '2026-08-06',
      readiness: 4,
      zoneDetails: { knee: { type: 'pain', level: 8, level10: 8, scaleMax: 10 } },
    }],
    postMorningSurveys: [],
    surveys: [],
    whoop: [],
    injuryLog: [],
  }, '2026-08-06', { testsExpected: false });

  assert.equal(result.decision.level, 'red');
});
