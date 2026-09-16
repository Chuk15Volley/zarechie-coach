import test from 'node:test';
import assert from 'node:assert/strict';
import { getReadySixPlayerContext, getReadySixTeamReadiness } from '../lib/readySixClient.js';
import { combineReadySixPlanningContext, readySixToday } from '../lib/readySixPlanning.mjs';
import { normalizeReadySixPlayerSnapshot, normalizeReadySixTeamReadiness } from '../lib/readySixSnapshotAdapter.js';
import { recommendGymSession, readySixGenerationIssue, applyReadySixGymDose } from '../lib/readySixGym.mjs';
import { buildDosePrescription } from '../lib/sessionDose.mjs';
const today = '2026-09-16', tomorrow = '2026-09-17';
const player = { id: 'qa-player', name: 'Test' };
const payload = (date, decision, monitoring = {}) => ({ schema: 'readysix.program-generator-context', schemaVersion: 1, mode: 'player-context', organizationId: 'zarechie-odintsovo', revision: `revision-${date}`, date, player, decision, monitoring, calendar: { date, events: [{ date: tomorrow, type: 'gym_volleyball' }, { date: '2026-09-21', type: 'match' }] } });
const options = { now: '2026-09-16T18:00:00Z', environment: { READYSIX_URL: 'https://readysix.test', READYSIX_ZARECHIE_API_KEY: 'synthetic' } };
const missing = { recommendation: 'insufficient_data', capPercent: 100, confidence: 'insufficient', reasons: ['Анкет пока нет'] };
const limited = { recommendation: 'limited', capPercent: 50, restrictions: ['Не нагружать плечо'], targets: [{ target: 'strength_upper', healthCapPercent: 30, capPercent: 30 }] };

test('evening fetch separates tomorrow calendar from today decision and preserves limits and provenance', async () => {
  const calls = [];
  const result = await getReadySixPlayerContext('zarechie', player.id, tomorrow, 28, { ...options, fetchImpl: async url => {
    const date = url.searchParams.get('date'); calls.push(date);
    return { ok: true, json: async () => payload(date, date === today ? limited : missing, { morning: [{ date: today, readiness: 3 }], evening: [{ date: today, fatigue: 4 }] }) };
  } });
  assert.deepEqual(calls.sort(), [today, tomorrow]);
  assert.equal(result.date, tomorrow);
  assert.equal(result.calendar.date, tomorrow);
  assert.equal(result.decision.capPercent, 50);
  assert.ok(result.decision.restrictions.includes('Не нагружать плечо'));
  assert.equal(result.planning.assessmentDate, today);
  assert.equal(result.planning.latestObservationDate, today);
  assert.equal(result.planning.assessmentRevision, `revision-${today}`);
  const snapshot = normalizeReadySixPlayerSnapshot(result, { targetDate: tomorrow });
  const rec = recommendGymSession({ snapshot, targetDate: tomorrow, today });
  assert.equal(rec.planning.preliminary, true);
  const dose = applyReadySixGymDose(buildDosePrescription(), rec);
  assert.equal(dose.readySix.capPercent, 30);
  assert.equal(dose.readySix.planning.targetDate, tomorrow);
});

test('missing tomorrow and today questionnaires permit a draft without inventing green readiness', () => {
  const snapshot = normalizeReadySixPlayerSnapshot(combineReadySixPlanningContext(payload(tomorrow, missing), payload(today, missing)), { targetDate: tomorrow });
  const rec = recommendGymSession({ snapshot, targetDate: tomorrow, today });
  assert.equal(rec.state.level, 'yellow');
  assert.equal(rec.planning.latestObservationDate, null);
  assert.equal(readySixGenerationIssue(rec, 'camp_iso_anterior'), null);
  assert.ok(rec.warnings.some(text => text.includes('Анкет пока недостаточно')));
});

test('a future rest plan permits preparation only and retains its warning and date', () => {
  const future = payload(tomorrow, missing);future.calendar.events = [{ date: tomorrow, type: 'rest' }];
  const snapshot = normalizeReadySixPlayerSnapshot(combineReadySixPlanningContext(future, payload(today, missing)), { targetDate: tomorrow });
  const rec = recommendGymSession({ snapshot, targetDate: tomorrow, today });
  assert.equal(rec.key, 'planning_only');
  assert.equal(readySixGenerationIssue(rec, 'camp_iso_anterior'), null);
  assert.ok(rec.warnings.some(text => text.includes('согласуйте рабочий день')));
  const dose = buildDosePrescription({ focus: 'camp_iso_anterior' });
  assert.equal(applyReadySixGymDose(dose, rec).totalSets.max, dose.totalSets.max);
});

test('known stop or severe cap on either date cannot be erased by missing future data', () => {
  for (const dangerous of [{ recommendation: 'load_stop', capPercent: 0 }, { ...missing, capPercent: 15 }]) {
    for (const decisions of [[dangerous, missing], [missing, dangerous]]) {
      const snapshot = normalizeReadySixPlayerSnapshot(combineReadySixPlanningContext(payload(tomorrow, decisions[0]), payload(today, decisions[1])), { targetDate: tomorrow });
      const rec = recommendGymSession({ snapshot, targetDate: tomorrow, today });
      assert.equal(readySixGenerationIssue(rec, 'camp_iso_anterior').status, 409);
    }
  }
});

test('team planning joins by player ID and uses the same observations as individual planning', async () => {
  const result = await getReadySixTeamReadiness('zarechie', tomorrow, { ...options, fetchImpl: async url => {
    const date = url.searchParams.get('date');
    return { ok: true, json: async () => ({ ...payload(date, null), mode: 'team-readiness', players: [
      { player: { id: 'other' }, decision: { recommendation: 'full', capPercent: 100 } },
      { player, decision: date === today ? limited : missing, monitoring: { morning: [{ date: today }] } },
    ].reverse() }) };
  } });
  const snapshot = normalizeReadySixTeamReadiness(result).snapshots.find(row => row.player.id === player.id);
  assert.equal(snapshot.readySixDecision.capPercent, 50);
  assert.equal(snapshot.readySixPlanning.assessmentDate, today);
});

test('historical context never reads future health and Moscow midnight defines planning day', async () => {
  const calls = [];
  await getReadySixPlayerContext('zarechie', player.id, '2026-09-15', 28, { ...options, fetchImpl: async url => {
    const date = url.searchParams.get('date');calls.push(date);return { ok: true, json: async () => payload(date, missing) };
  } });
  assert.deepEqual(calls, ['2026-09-15']);
  assert.equal(readySixToday('2026-09-16T21:05:00Z'), tomorrow);
});

test('current load and questionnaires never become tomorrow observations', () => {
  const current = payload(today, missing, { overtraq: { jumps: 42 }, morning: [{ date: today, readiness: 3 }, { date: tomorrow, readiness: 5 }], manual: { [tomorrow]: { jumps: 90 } } });
  const snapshot = normalizeReadySixPlayerSnapshot(combineReadySixPlanningContext(payload(tomorrow, missing), current), { targetDate: tomorrow });
  assert.equal(snapshot.targetDate, tomorrow);
  assert.equal(snapshot.manual[today].jumps, 42);
  assert.equal(snapshot.manual[tomorrow], undefined);
  assert.deepEqual(snapshot.morning.map(row => row.date), [today]);
});
