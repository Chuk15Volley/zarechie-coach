import test from 'node:test';
import assert from 'node:assert/strict';
import { readySixGymState, recommendGymSession, applyReadySixGymDose, readySixGenerationIssue } from '../lib/readySixGym.mjs';
import { readinessDecisionFromSnapshot } from '../lib/readinessDecision.mjs';
import { buildDosePrescription, auditDose } from '../lib/sessionDose.mjs';
const date = '2026-09-16';
const snapshot = (events = [], decision = {}) => ({ readySixMeta: { revision: 'r1' }, readySixDecision: { recommendation: 'full', capPercent: 100, confidence: 'high', ...decision }, readySixCalendar: { date, events } });
const rec = s => recommendGymSession({ snapshot: s, targetDate: date });
test('ReadySix stop and missing decisions fail closed', () => {
  assert.equal(readySixGymState(null).needsReview, true);
  assert.equal(rec(snapshot([], { capPercent: 0 })).canApply, false);
  assert.equal(rec(snapshot([], { recommendation: 'load_stop' })).key, 'review');
});
test('upstream full readiness is not downgraded by local WHOOP thresholds', () => {
  const s = { ...snapshot(), whoop: [{ date, recovery: 5 }], surveys: [] };
  assert.equal(readinessDecisionFromSnapshot(s, date).decision.level, 'green');
});
test('a scheduled rest day is not a health stop', () => {
  const s = snapshot([{ date, type: 'rest' }], { targets: [{ target: 'strength_lower', capPercent: 0, healthCapPercent: 100, planApplicability: 'not_planned' }] });
  assert.equal(rec(s).state.level, 'green');
  assert.equal(rec(s).key, 'no_gym');
  const p = applyReadySixGymDose(buildDosePrescription(), rec(s));
  assert.ok(p.totalSets.max > 0);
  assert.equal(p.loadedHardSetsMax, 0);
});
for (const [game, key] of [['2026-09-16', 'match_day'], ['2026-09-17', 'activation'], ['2026-09-18', 'microdose'], ['2026-09-20', 'strength'], ['2026-09-15', 'recovery']]) {
  test(`calendar ${game} recommends ${key}`, () => assert.equal(rec(snapshot([{ date: game, type: 'match' }])).key, key));
}
test('missing or stale calendar does not invent a development window', () => {
  assert.equal(rec(snapshot()).key, 'maintenance');
  const s = snapshot([{ date: '2026-09-20', type: 'match' }]);
  s.readySixCalendar.date = '2026-09-15';
  assert.equal(rec(s).key, 'maintenance');
  assert.equal(rec(s).calendar.nextGame, null);
});
test('contradictory plan blocks recommendation even on rest day', () => {
  const s = snapshot([{ date, type: 'match' }]);
  s.readySixCalendar.today = { confirmed: true, planType: 'rest' };
  s.readySixCalendar.conflicts = [{ date, reportType: 'match', scheduleType: 'rest' }];
  assert.equal(rec(s).key, 'calendar_conflict');
});
test('history helps alternate strength and power only with an adequate gap', () => {
  const s = snapshot([{ date: '2026-09-20', type: 'match' }]);
  assert.equal(recommendGymSession({ snapshot: s, targetDate: date, recentSessions: [{ date: '2026-09-14', focus: 'inseason_strength' }] }).key, 'power');
  assert.equal(recommendGymSession({ snapshot: s, targetDate: date, recentSessions: [{ date: '2026-09-15', focus: 'inseason_strength' }] }).key, 'maintenance');
});
test('calendar and regional dose caps only reduce budgets', () => {
  const s = snapshot([{ date: '2026-09-17', type: 'match' }], { capPercent: 80, targets: [{ target: 'strength_lower', healthCapPercent: 50 }] });
  const original = buildDosePrescription({ focus: 'inseason_strength' });
  const p = applyReadySixGymDose(original, rec(s));
  assert.equal(p.readySix.capPercent, 50);
  assert.ok(p.totalSets.max <= original.totalSets.max / 2);
  assert.ok(p.hardSets.max <= 6);
  assert.ok(p.minutes.max <= 20);
  assert.ok(p.targetRpe.max <= 5);
});

test('protected calendar days reject conflicting development methods without silently changing choice', () => {
  for (const gameDate of ['2026-09-15', '2026-09-16', '2026-09-17']) {
    const recommendation = rec(snapshot([{ date: gameDate, type: 'match' }]));
    assert.equal(readySixGenerationIssue(recommendation, 'inseason_strength').status, 409);
    assert.equal(readySixGenerationIssue(recommendation, recommendation.focus), null);
  }
});
test('post-match recovery permits light coded work but blocks external loading', () => {
  const recommendation = rec(snapshot([{ date: '2026-09-15', type: 'match' }]));
  const p = applyReadySixGymDose(buildDosePrescription({ focus: recommendation.focus }), recommendation);
  const exercise = { code: 'A1', name: 'Dead Bug', targetSets: ['6', '6'] };
  const light = { blocks: [{ code: 'A', exercises: [exercise] }] };
  assert.equal(auditDose(light, p).safe, true);
  const loaded = { blocks: [{ code: 'A', exercises: [{ ...exercise, weightKg: 40 }] }] };
  assert.equal(auditDose(loaded, p).safe, false);
});

test('ReadySix-resolved calendar discrepancies do not block neighbouring match days', () => {
  const s = snapshot([{ date, type: 'match', source: 'reports' }, { date: '2026-09-15', type: 'rest', source: 'reports' }]);
  s.readySixCalendar.conflicts = [{ date: '2026-09-15', reportType: 'rest', scheduleType: 'recovery' }];
  assert.equal(rec(s).key, 'match_day');
  assert.equal(rec(s).calendar.conflicts.length, 0);
  assert.equal(rec(s).warnings.length, 1);
  s.readySixCalendar.events = [{ date, type: 'rest', source: 'reports' }];
  s.readySixCalendar.conflicts = [{ date, reportType: 'rest', scheduleType: 'recovery' }];
  assert.equal(rec(s).key, 'no_gym', 'Resolved rest remains a day without gym');
});
