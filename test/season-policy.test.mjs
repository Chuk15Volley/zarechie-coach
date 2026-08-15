import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeasonMicrocycle, resolveSeasonSession } from '../lib/seasonPolicy.mjs';
import { buildDosePrescription } from '../lib/sessionDose.mjs';
import { assignFocuses } from '../lib/monthPlanner.js';

const events = [{ date: '2026-08-15', type: 'game' }];

test('MD+1 with unknown or meaningful match load is recovery-only', () => {
  const decision = resolveSeasonSession({
    events,
    targetDate: '2026-08-16',
    requestedFocus: 'inseason_strength',
    requestedTrainingType: 'full_body',
    previousMatchLoad: { status: 'high' },
  });
  assert.equal(decision.key, 'md_plus_1');
  assert.equal(decision.trainingType, 'recovery_prehab');
  const dose = buildDosePrescription({ focus: decision.focus, trainingType: decision.trainingType, seasonContext: decision });
  assert.deepEqual(dose.hardSets, { min: 0, max: 4 });
  assert.deepEqual(dose.jumpContacts, { min: 0, max: 0 });
});

test('low match exposure does not erase a safe coach-selected strength session', () => {
  const decision = resolveSeasonSession({
    events,
    targetDate: '2026-08-16',
    requestedFocus: 'inseason_strength',
    requestedTrainingType: 'full_body',
    previousMatchLoad: { status: 'low' },
  });
  assert.equal(decision.key, 'coach_selected');
});

test('inactive status is never interpreted as automatic freshness on MD+1', () => {
  const decision = resolveSeasonSession({
    events,
    targetDate: '2026-08-16',
    requestedFocus: 'inseason_strength',
    requestedTrainingType: 'full_body',
    previousMatchLoad: { status: 'inactive' },
  });
  assert.equal(decision.key, 'md_plus_1');
});

test('MD-2 and MD-1 resolve to a microdose then primer', () => {
  const calendar = [{ date: '2026-08-20', type: 'game' }];
  assert.equal(resolveSeasonSession({ events: calendar, targetDate: '2026-08-18' }).key, 'compressed_microdose');
  assert.equal(resolveSeasonSession({ events: calendar, targetDate: '2026-08-19' }).key, 'md_minus_1');
});

test('quiet week has two strength exposures and one power exposure', () => {
  const plan = buildSeasonMicrocycle({ events: [], startDate: '2026-08-17' });
  assert.deepEqual(plan.map(item => item.date), ['2026-08-17', '2026-08-19', '2026-08-21']);
  assert.deepEqual(plan.map(item => item.trainingType), ['full_body', 'activation_power', 'full_body']);
});

test('monthly planner uses MD rules without legacy month or fixed-date phases', () => {
  const days = [
    { date: '2026-08-18', type: 'training' },
    { date: '2026-08-19', type: 'training' },
    { date: '2026-08-20', type: 'game' },
    { date: '2026-08-21', type: 'training' },
  ];
  const planned = assignFocuses(days);
  assert.equal(planned.find(day => day.date === '2026-08-18').focus, 'inseason_power');
  assert.equal(planned.find(day => day.date === '2026-08-19').focus, 'inseason_md1_activation');
  assert.equal(planned.find(day => day.date === '2026-08-21').focus, 'inseason_prophylaxis');
});
