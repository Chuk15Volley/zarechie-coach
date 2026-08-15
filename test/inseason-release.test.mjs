import test from 'node:test';
import assert from 'node:assert/strict';
import { advisorySessionQuality } from '../lib/sessionQualityPolicy.mjs';
import { assessSessionQuality } from '../lib/sessionValidator.js';
import { buildDosePrescription } from '../lib/sessionDose.mjs';
import { buildSeasonMicrocycle, resolveSeasonSession } from '../lib/seasonPolicy.mjs';

function exercise(code, name, { sets = 2, weightNote = 'без нагрузки', weightKg } = {}) {
  return {
    code,
    name,
    targetSets: Array.from({ length: sets }, () => '6'),
    tempo: '2-0-2-0',
    cue: 'Спокойно, без боли.',
    weightNote,
    ...(weightKg ? { weightKg } : {}),
    loadUnits: 1,
  };
}

function recoverySession({ loaded = false, jumping = false } = {}) {
  return {
    blocks: [
      {
        label: 'A',
        rest_note: '30 сек',
        exercises: [
          exercise('A1', loaded ? 'Goblet Squat' : 'Dead Bug', loaded ? { weightKg: 24, weightNote: '24 кг, RPE 8' } : {}),
          exercise('A2', 'Ankle Mobility'),
        ],
      },
      {
        label: 'B',
        rest_note: '30 сек',
        exercises: [
          exercise('B1', jumping ? 'Pogo Jump' : 'Bird Dog', { sets: jumping ? 3 : 2 }),
          exercise('B2', 'Band Shoulder External Rotation'),
        ],
      },
      {
        label: 'E',
        rest_note: '30 сек',
        exercises: [exercise('E1', 'Calf Isometric'), exercise('E2', 'Breathing Reset')],
      },
    ],
  };
}

const game = [{ date: '2026-08-15', type: 'game' }];

test('release scenario: safe MD+1 recovery remains saveable', () => {
  const seasonDecision = resolveSeasonSession({
    events: game,
    targetDate: '2026-08-16',
    previousMatchLoad: { status: 'high' },
  });
  const dosePrescription = buildDosePrescription({
    focus: seasonDecision.focus,
    trainingType: seasonDecision.trainingType,
    seasonContext: seasonDecision,
  });
  const quality = advisorySessionQuality(assessSessionQuality(recoverySession(), {
    focus: seasonDecision.focus,
    trainingType: seasonDecision.trainingType,
    dosePrescription,
    seasonDecision,
  }));
  assert.equal(quality.blocking, false);
  assert.equal(quality.checks.find(check => check.id === 'season_safety').ok, true);
});

test('release scenario: loaded strength and jumps are blocked on MD+1', () => {
  const seasonDecision = resolveSeasonSession({
    events: game,
    targetDate: '2026-08-16',
    previousMatchLoad: { status: 'medium' },
  });
  const dosePrescription = buildDosePrescription({
    focus: seasonDecision.focus,
    trainingType: seasonDecision.trainingType,
    seasonContext: seasonDecision,
  });
  const quality = advisorySessionQuality(assessSessionQuality(recoverySession({ loaded: true, jumping: true }), {
    focus: seasonDecision.focus,
    trainingType: seasonDecision.trainingType,
    dosePrescription,
    seasonDecision,
  }));
  assert.equal(quality.blocking, true);
  assert.equal(quality.checks.find(check => check.id === 'season_safety').ok, false);
  assert.ok(quality.dose.actual.loadedHardSets > 0);
  assert.ok(quality.dose.actual.jumpContacts > 0);
});

test('release scenario: match day, MD-1, MD-2 and travel cannot retain a heavy coach selection', () => {
  const calendar = [
    { date: '2026-08-19', type: 'travel' },
    { date: '2026-08-20', type: 'game' },
  ];
  const resolve = targetDate => resolveSeasonSession({
    events: calendar,
    targetDate,
    requestedFocus: 'inseason_strength',
    requestedTrainingType: 'full_body',
  });
  assert.equal(resolve('2026-08-18').key, 'md_minus_1');
  assert.equal(resolve('2026-08-19').key, 'travel_day');
  assert.equal(resolve('2026-08-20').key, 'match_day');
  assert.equal(resolve('2026-08-18').overridden, true);

  const simpleCalendar = [{ date: '2026-08-20', type: 'game' }];
  assert.equal(resolveSeasonSession({ events: simpleCalendar, targetDate: '2026-08-18' }).key, 'compressed_microdose');
});

test('release scenario: congested week produces only safe non-match-day exposures', () => {
  const events = [
    { date: '2026-08-18', type: 'game' },
    { date: '2026-08-22', type: 'game' },
    { date: '2026-08-21', type: 'travel' },
  ];
  const plan = buildSeasonMicrocycle({ events, startDate: '2026-08-17' });
  assert.ok(plan.length >= 2 && plan.length <= 4);
  assert.equal(plan.some(item => events.some(event => event.date === item.date && ['game', 'travel'].includes(event.type))), false);
  assert.ok(plan.some(item => item.key === 'md_plus_1'));
  assert.ok(plan.some(item => item.key === 'md_minus_1'));
});
