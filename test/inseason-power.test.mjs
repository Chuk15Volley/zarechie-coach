import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  auditInSeasonPowerSession,
  buildInSeasonPowerContext,
} from '../lib/inSeasonPower.mjs';
import { buildDosePrescription } from '../lib/sessionDose.mjs';
import { assessSessionQuality, validateSession } from '../lib/sessionValidator.js';
import { advisorySessionQuality } from '../lib/sessionQualityPolicy.mjs';

function calendarDecision(daysToGame, previousMatchStatus = 'low', key = 'coach_selected') {
  return { key, calendar: { daysToGame }, previousMatchStatus };
}

function exercise(code, name, targetSets, weightNote = 'Вес тела', autoReg = 'Второе ухудшение подряд → закончить упражнение.') {
  return { code, name, targetSets, weightNote, autoReg, tempo: 'реактивный', cue: 'Максимально резко.', loadUnits: 1, alternatives: [] };
}

function developmentSession() {
  return {
    blocks: [
      { label: 'A', rest_note: '90 сек', exercises: [
        exercise('A1', '5 m Acceleration', ['5 м', '5 м', '5 м']),
        exercise('A2', '5 m Change-of-Direction Sprint', ['5 м', '5 м', '5 м']),
      ] },
      { label: 'B', rest_note: '2 мин', exercises: [exercise('B1', 'Approach Jump', ['3', '3', '3'])] },
      { label: 'C', rest_note: '20 сек C1→C2, 3 мин после пары', exercises: [
        exercise('C1', 'Conventional Barbell Deadlift', ['2', '2', '2'], '80% 1ПМ, RPE 7'),
        exercise('C2', 'Box Jump', ['2', '2', '2']),
      ] },
      { label: 'D', rest_note: '90 сек', exercises: [exercise('D1', 'MB Rotational Throw', ['3/сторона', '3/сторона', '3/сторона'])] },
      { label: 'E', rest_note: '2 мин', exercises: [exercise('E1', 'Hang Power Clean', ['2', '2', '2'], '60% 1ПМ, RPE 6')] },
      { label: 'F', rest_note: '60 сек', exercises: [exercise('F1', 'Rotator Cuff Prehab (Band)', ['8', '8'])] },
    ],
  };
}

function microdoseSession() {
  return {
    blocks: [
      { label: 'A', rest_note: '60-90 сек', exercises: [
        exercise('A1', '5 m Acceleration', ['5 м', '5 м']),
        exercise('A2', '5 m Change-of-Direction Sprint', ['5 м', '5 м']),
      ] },
      { label: 'B', rest_note: '2 мин', exercises: [exercise('B1', 'Countermovement Jump', ['2', '2'])] },
      { label: 'C', rest_note: '2 мин', exercises: [exercise('C1', 'Hang Power Clean', ['3', '3'], '55% 1ПМ, RPE 5')] },
      { label: 'D', rest_note: '60 сек', exercises: [
        exercise('D1', 'MB Chest Pass', ['3', '3']),
        exercise('D2', 'Shoulder Prehab (Band)', ['8', '8']),
      ] },
    ],
  };
}

test('power placement resolves Development, MD-3 fallback, Microdose and red recovery deterministically', () => {
  const development = buildInSeasonPowerContext({
    focus: 'inseason_power', position: 'Центральная', recoveryStatus: 'green',
    seasonDecision: calendarDecision(3, 'low'),
  });
  assert.equal(development.mode, 'development');
  assert.deepEqual(development.jumpContacts, { min: 18, max: 24 });

  const md3Yellow = buildInSeasonPowerContext({
    focus: 'inseason_power', position: 'Доигровщица', recoveryStatus: 'yellow',
    seasonDecision: calendarDecision(3, 'low'),
  });
  assert.equal(md3Yellow.mode, 'microdose');

  const md2 = buildInSeasonPowerContext({
    focus: 'inseason_power', position: 'Связующая', recoveryStatus: 'green',
    seasonDecision: calendarDecision(2, 'low', 'compressed_microdose'),
  });
  assert.equal(md2.mode, 'microdose');
  assert.deepEqual(md2.jumpContacts, { min: 4, max: 8 });

  const red = buildInSeasonPowerContext({ focus: 'inseason_power', position: 'Либеро', recoveryStatus: 'red' });
  assert.equal(red.mode, 'recovery');
  assert.deepEqual(red.jumpContacts, { min: 0, max: 0 });

  const manualMicrodose = buildInSeasonPowerContext({
    focus: 'inseason_power', position: 'Доигровщица', recoveryStatus: 'green', requestedMode: 'microdose',
  });
  assert.equal(manualMicrodose.mode, 'microdose');
});

test('coach UI exposes and submits the Development/Microdose choice', () => {
  const source = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
  assert.match(source, /useState\('development'\)/);
  assert.match(source, /Development 50–55 · Microdose 30 мин/);
  assert.match(source, /powerMode,/);
  assert.match(source, /setPowerMode\(mode\.value\)/);
});

test('yellow Development retains the heavy pair while reducing positional volume', () => {
  const context = buildInSeasonPowerContext({ focus: 'inseason_power', position: 'Диагональная', recoveryStatus: 'yellow' });
  const dose = buildDosePrescription({ focus: 'inseason_power', coachRecovery: 'yellow', powerContext: context });
  assert.equal(dose.powerMode, 'development');
  assert.deepEqual(dose.minutes, { min: 50, max: 55 });
  assert.deepEqual(dose.hardSets, { min: 2, max: 6 });
  assert.deepEqual(dose.jumpContacts, { min: 11, max: 15 });
  assert.equal(dose.volumeModifier, 0.75);
});

test('Development and Microdose pass their exact structural and positional audits', () => {
  const developmentContext = buildInSeasonPowerContext({ focus: 'inseason_power', position: 'Доигровщица', recoveryStatus: 'green' });
  const developmentDose = buildDosePrescription({ focus: 'inseason_power', powerContext: developmentContext });
  const developmentAudit = auditInSeasonPowerSession(developmentSession(), developmentDose);
  assert.equal(developmentAudit.valid, true, developmentAudit.detail);
  assert.equal(developmentAudit.sprintEfforts, 6);
  assert.equal(developmentAudit.jumpContacts, 15);
  const developmentQuality = advisorySessionQuality(assessSessionQuality(developmentSession(), {
    focus: 'inseason_power', trainingType: 'activation_power', dosePrescription: developmentDose,
  }));
  assert.equal(developmentQuality.dose.safe, true, developmentQuality.dose.detail);
  assert.equal(developmentQuality.blocking, false, developmentQuality.reviewMessage);

  const microContext = buildInSeasonPowerContext({
    focus: 'inseason_power', position: 'Связующая', recoveryStatus: 'green',
    seasonDecision: calendarDecision(2, 'low', 'compressed_microdose'),
  });
  const microDose = buildDosePrescription({ focus: 'inseason_power', powerContext: microContext });
  const microAudit = auditInSeasonPowerSession(microdoseSession(), microDose);
  assert.equal(microAudit.valid, true, microAudit.detail);
  assert.deepEqual(microDose.minutes, { min: 28, max: 32 });
  assert.deepEqual(microDose.targetRpe, { min: 3, max: 5 });
  const microQuality = advisorySessionQuality(assessSessionQuality(microdoseSession(), {
    focus: 'inseason_power', trainingType: 'activation_power', dosePrescription: microDose,
  }));
  assert.equal(microQuality.dose.safe, true, microQuality.dose.detail);
  assert.equal(microQuality.blocking, false, microQuality.reviewMessage);

  const heavyMicrodose = microdoseSession();
  heavyMicrodose.blocks[2].exercises[0].weightNote = '80% 1ПМ, RPE 7';
  const heavyAudit = auditInSeasonPowerSession(heavyMicrodose, microDose);
  assert.equal(heavyAudit.safe, false);
});

test('power validation allows deadlift and Olympic lifts but still rejects squats and high-risk automatic plyometrics', () => {
  const context = buildInSeasonPowerContext({ focus: 'inseason_power', position: 'Доигровщица', recoveryStatus: 'green' });
  const dose = buildDosePrescription({ focus: 'inseason_power', powerContext: context });
  const allowed = validateSession(developmentSession(), [], { focus: 'inseason_power', dosePrescription: dose });
  assert.equal(allowed.valid, true, allowed.errors.join('; '));

  const unsafe = developmentSession();
  unsafe.blocks[1].exercises[0].name = 'Depth Jump';
  unsafe.blocks[4].exercises[0].name = 'Barbell Back Squat';
  const rejected = validateSession(unsafe, [], { focus: 'inseason_power', dosePrescription: dose });
  assert.equal(rejected.valid, false);
  assert.match(rejected.errors.join(' '), /Depth Jump/);
  assert.match(rejected.errors.join(' '), /Back Squat/);
});
