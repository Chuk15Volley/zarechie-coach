import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAthleteWeekLoad, summarizeTeamWeek } from '../lib/weekLoadManagement.mjs';

function entry(date, { sets = 2, weight = 10, reps = 10, actualTonnage = 0, completed = false, pain = false, label = 'Сила' } = {}) {
  const targetSets = Array.from({ length: sets }, () => String(reps));
  const done = Object.fromEntries(targetSets.map((_, index) => [`set-${index}`, completed]));
  return {
    date,
    record: {
      savedAt: `${date}T08:00:00.000Z`,
      trainingLabel: label,
      session: { blocks: [{ exercises: [{ name: 'Присед', weightKg: weight, targetSets }] }] },
    },
    actual: actualTonnage || pain ? { savedAt: `${date}T10:00:00.000Z`, actualTonnage, exercises: [{ pain }] } : null,
    log: completed ? { completedAt: `${date}T10:00:00.000Z`, done } : null,
  };
}

const dates = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'];

test('personalized budget uses the median of completed historical weeks', () => {
  const athlete = buildAthleteWeekLoad({
    player: { id: 'p1', name: 'Игрок' }, weekStart: dates[0], dates,
    entries: [
      entry('2026-08-10', { sets: 5, weight: 10, actualTonnage: 500, completed: true }),
      entry('2026-08-17', { sets: 6, weight: 10, actualTonnage: 600, completed: true }),
      entry('2026-08-24', { sets: 5, weight: 10 }),
    ],
  });
  assert.equal(athlete.budget.referenceTonnage, 550);
  assert.equal(athlete.budget.tonnage, 550);
  assert.equal(athlete.budget.status, 'near');
  assert.equal(athlete.budget.utilizationPercent, 91);
});

test('readiness recommendation and RTP can only reduce the weekly allowance', () => {
  const athlete = buildAthleteWeekLoad({
    player: { id: 'p1' }, weekStart: dates[0], dates,
    entries: [
      entry('2026-08-10', { sets: 10, actualTonnage: 1000, completed: true }),
      entry('2026-08-17', { sets: 10, actualTonnage: 1000, completed: true }),
      entry('2026-08-24', { sets: 5 }),
    ],
    recommendation: { mode: 'reduce', volumePercent: 80, intensityPercent: 90, rpeCap: 7 },
    returnToPlay: { status: 'active', currentPhase: 2 },
  });
  assert.equal(athlete.budget.factorPercent, 50);
  assert.equal(athlete.budget.tonnage, 500);
  assert.equal(athlete.budget.rtp.phase, 2);
});

test('insufficient history stays in calibration without a false over-budget alert', () => {
  const athlete = buildAthleteWeekLoad({
    player: { id: 'p1' }, weekStart: dates[0], dates,
    entries: [entry('2026-08-17', { sets: 4 }), entry('2026-08-24', { sets: 8 })],
  });
  assert.equal(athlete.budget.status, 'calibrating');
  assert.equal(athlete.conflicts.some(conflict => conflict.code === 'budget_exceeded'), false);
});

test('dense high-load exposures and pain are surfaced as weekly conflicts', () => {
  const athlete = buildAthleteWeekLoad({
    player: { id: 'p1' }, weekStart: dates[0], dates,
    entries: [
      entry('2026-08-10', { sets: 3 }), entry('2026-08-17', { sets: 3 }),
      entry('2026-08-24', { sets: 3 }), entry('2026-08-25', { sets: 3, pain: true }),
    ],
  });
  assert.equal(athlete.conflicts.some(conflict => conflict.code === 'dense_loading'), true);
  assert.equal(athlete.conflicts.some(conflict => conflict.code === 'pain_reported'), true);
});

test('team summary rolls up budget, fact and conflicts', () => {
  const first = buildAthleteWeekLoad({ player: { id: 'p1' }, weekStart: dates[0], dates, entries: [entry('2026-08-24')] });
  const second = buildAthleteWeekLoad({ player: { id: 'p2' }, weekStart: dates[0], dates, entries: [entry('2026-08-25', { completed: true, actualTonnage: 180 })] });
  const summary = summarizeTeamWeek([first, second]);
  assert.equal(summary.athletes, 2);
  assert.equal(summary.sessions, 2);
  assert.equal(summary.completed, 1);
  assert.equal(summary.actualTonnage, 180);
});
