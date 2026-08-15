import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMatchDayPrimerContext,
  isApprovedMatchDayExercise,
  matchDayAutomaticRecoveryStatus,
  matchDayDataFreshness,
} from '../lib/matchDayPrimer.mjs';
import { buildDosePrescription } from '../lib/sessionDose.mjs';
import { resolveSeasonSession } from '../lib/seasonPolicy.mjs';
import { assessSessionQuality } from '../lib/sessionValidator.js';

function decision(day = '2026-08-20', events = [{ date: '2026-08-20', type: 'game' }]) {
  return resolveSeasonSession({ events, targetDate: day, requestedFocus: 'inseason_strength', requestedTrainingType: 'full_body' });
}

function readiness(overrides = {}) {
  return {
    exactMorning: { date: '2026-08-20', readiness: 4 },
    morning: { date: '2026-08-20', readiness: 4 },
    morningFresh: true,
    evening: { date: '2026-08-19', shoulderLoad: 2 },
    eveningFresh: true,
    postMorning: null,
    postMorningFresh: false,
    whoop: { date: '2026-08-20', recovery: 75 },
    activeInjuries: [],
    ...overrides,
  };
}

function exercise(code, name, targetSets, { kg = null, tempo = 'X-0-X-0' } = {}) {
  return {
    code,
    name,
    targetSets,
    tempo,
    weightKg: kg,
    weightNote: kg ? `${kg} кг, RPE 6` : 'Вес тела, максимальное качество',
    cue: 'Темп: максимально быстро. Остановись до снижения скорости.',
    autoReg: code.endsWith('1') ? 'RPE выше 6 или скорость падает → снизь вес.' : '',
    loadUnits: 1,
    alternatives: [],
  };
}

function fullPrimerSession() {
  return {
    title: 'Match-Day Full-Body Primer',
    blocks: [
      {
        code: 'A', label: 'Lower Body Contrast', rest_note: '15–30 сек внутри пары; 3 мин между кругами',
        exercises: [
          exercise('A1', 'Trap Bar Deadlift', ['2', '2'], { kg: 80 }),
          exercise('A2', 'Countermovement Jump (CMJ)', ['2', '2']),
        ],
      },
      {
        code: 'B', label: 'Upper Body Contrast', rest_note: '15–30 сек внутри пары; 3 мин между кругами',
        exercises: [
          exercise('B1', 'DB Bench Press', ['3', '3'], { kg: 18 }),
          exercise('B2', 'MB Chest Pass', ['3', '3']),
        ],
      },
      {
        code: 'C', label: 'Trunk Contrast', rest_note: '15–30 сек внутри пары; 3 мин между кругами',
        exercises: [
          exercise('C1', 'Pallof Press ISO (Band)', ['10 сек/сторона', '10 сек/сторона'], { tempo: 'изометрический' }),
          exercise('C2', 'MB Rotational Throw', ['3/сторона', '3/сторона']),
        ],
      },
    ],
  };
}

test('calendar detects the first, second and third consecutive match day', () => {
  const events = ['2026-08-18', '2026-08-19', '2026-08-20'].map(date => ({ date, type: 'game' }));
  assert.equal(decision('2026-08-18', events).calendar.consecutiveGameDay, 1);
  assert.equal(decision('2026-08-19', events).calendar.consecutiveGameDay, 2);
  assert.equal(decision('2026-08-20', events).calendar.consecutiveGameDay, 3);
});

test('previous morning plus previous evening remains a normal primer data source', () => {
  const context = matchDayDataFreshness({
    exactMorning: null,
    morning: { date: '2026-08-19' },
    evening: { date: '2026-08-19' },
  }, '2026-08-20');
  assert.equal(context.key, 'previous_day');
  assert.equal(context.volumeModifier, 1);
});

test('stale readiness or a third consecutive match forces the minimal profile', () => {
  const stale = buildMatchDayPrimerContext({
    targetDate: '2026-08-20',
    seasonDecision: decision(),
    readiness: readiness({ exactMorning: null, morning: { date: '2026-08-18' }, evening: { date: '2026-08-18' }, whoop: null }),
    position: 'Центральная',
  });
  assert.equal(stale.mode, 'minimal');
  const staleDose = buildDosePrescription({ seasonContext: { ...decision(), primer: stale }, matchDayPrimer: stale });
  assert.equal(staleDose.key, 'match-day-primer-minimal');
  assert.deepEqual(staleDose.exercises, { min: 6, max: 6 });
  assert.deepEqual(staleDose.totalSets, { min: 6, max: 6 });

  const events = ['2026-08-18', '2026-08-19', '2026-08-20'].map(date => ({ date, type: 'game' }));
  const third = buildMatchDayPrimerContext({
    targetDate: '2026-08-20', seasonDecision: decision('2026-08-20', events), readiness: readiness(), position: 'Доигровщица',
  });
  assert.equal(third.seriesDay, 3);
  assert.equal(third.mode, 'minimal');
});

test('high shoulder load disables overhead work and stale injury creates a modified primer', () => {
  const context = buildMatchDayPrimerContext({
    targetDate: '2026-08-20',
    seasonDecision: decision(),
    readiness: readiness({
      exactMorning: null,
      morning: { date: '2026-08-18' },
      evening: { date: '2026-08-18', shoulderLoad: 5 },
      whoop: null,
      activeInjuries: [{ bodyPart: 'knee', painLevel: 4 }],
    }),
    position: 'Диагональная',
  });
  assert.equal(context.noOverhead, true);
  assert.equal(context.mode, 'modified');
});

test('local pain adapts the match-day chain instead of cancelling healthy-region loading', () => {
  assert.equal(matchDayAutomaticRecoveryStatus({ code: 'injury_or_pain', level: 'red' }, true), 'green');
  assert.equal(matchDayAutomaticRecoveryStatus({ code: 'recovery_low', level: 'red' }, true), 'red');
  assert.equal(matchDayAutomaticRecoveryStatus({ code: 'injury_or_pain', level: 'red' }, false), 'red');
});

test('match-day library permits pull derivatives without permitting catch variants', () => {
  assert.equal(isApprovedMatchDayExercise('Snatch-Grip High Pull'), true);
  assert.equal(isApprovedMatchDayExercise('Clean Pull from Hang'), true);
  assert.equal(isApprovedMatchDayExercise('Hang Power Clean'), false);
  assert.equal(isApprovedMatchDayExercise('Barbell Back Squat'), false);
});

test('full match-day primer passes exact structure, dose and approved-library gates', () => {
  const seasonDecision = decision();
  const primer = buildMatchDayPrimerContext({
    targetDate: '2026-08-20', seasonDecision, readiness: readiness(), position: 'Связующая', recoveryStatus: 'green',
  });
  const decisionWithPrimer = { ...seasonDecision, primer };
  const dose = buildDosePrescription({
    focus: seasonDecision.focus,
    trainingType: seasonDecision.trainingType,
    seasonContext: decisionWithPrimer,
    matchDayPrimer: primer,
  });
  const quality = assessSessionQuality(fullPrimerSession(), {
    focus: seasonDecision.focus,
    trainingType: seasonDecision.trainingType,
    seasonDecision: decisionWithPrimer,
    dosePrescription: dose,
  });
  assert.equal(dose.minutes.min, 20);
  assert.equal(dose.jumpContacts.max, 8);
  assert.equal(quality.valid, true, quality.improvements.join('; '));
});

test('an exercise outside the match-day library is a blocking safety error', () => {
  const session = fullPrimerSession();
  session.blocks[0].exercises[0].name = 'Barbell Back Squat';
  const seasonDecision = decision();
  const primer = buildMatchDayPrimerContext({ targetDate: '2026-08-20', seasonDecision, readiness: readiness(), position: 'Центральная' });
  const decisionWithPrimer = { ...seasonDecision, primer };
  const dose = buildDosePrescription({ seasonContext: decisionWithPrimer, matchDayPrimer: primer });
  const quality = assessSessionQuality(session, { seasonDecision: decisionWithPrimer, dosePrescription: dose, focus: seasonDecision.focus, trainingType: seasonDecision.trainingType });
  assert.equal(quality.valid, false);
  assert.match(quality.errors.join(' '), /вне утверждённой библиотеки/);
});

test('a globally approved exercise cannot be used in the wrong primer role', () => {
  const session = fullPrimerSession();
  session.blocks[0].exercises[0].name = 'MB Chest Pass';
  const seasonDecision = decision();
  const primer = buildMatchDayPrimerContext({ targetDate: '2026-08-20', seasonDecision, readiness: readiness(), position: 'Либеро' });
  const decisionWithPrimer = { ...seasonDecision, primer };
  const dose = buildDosePrescription({ seasonContext: decisionWithPrimer, matchDayPrimer: primer });
  const quality = assessSessionQuality(session, { seasonDecision: decisionWithPrimer, dosePrescription: dose, focus: seasonDecision.focus, trainingType: seasonDecision.trainingType });
  assert.equal(quality.valid, false);
  assert.match(quality.errors.join(' '), /Нарушена структура/);
});

test('high shoulder load and stale data are enforced by deterministic safety gates', () => {
  const session = fullPrimerSession();
  session.blocks[1].exercises[0].name = 'Push Press';
  const seasonDecision = decision();
  const primer = buildMatchDayPrimerContext({
    targetDate: '2026-08-20',
    seasonDecision,
    readiness: readiness({ exactMorning: null, morning: { date: '2026-08-18' }, evening: { date: '2026-08-18', shoulderLoad: 5 }, whoop: null }),
    position: 'Доигровщица',
  });
  const decisionWithPrimer = { ...seasonDecision, primer };
  const dose = buildDosePrescription({ seasonContext: decisionWithPrimer, matchDayPrimer: primer });
  const quality = assessSessionQuality(session, { seasonDecision: decisionWithPrimer, dosePrescription: dose, focus: seasonDecision.focus, trainingType: seasonDecision.trainingType });
  assert.equal(quality.valid, false);
  assert.match(quality.errors.join(' '), /надголовное/);
  assert.match(quality.errors.join(' '), /должно быть изометрией/);
});
