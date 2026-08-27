import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assessOneRmFreshness,
  auditInSeasonStrengthSession,
  buildInSeasonStrengthContext,
  inSeasonStrengthDoseProfile,
} from '../lib/inSeasonStrength.mjs';
import { validateSession } from '../lib/sessionValidator.js';

const ex = (code, name, sets, extra = {}) => ({
  code, name, targetSets: Array.from({ length: sets }, () => '5'),
  weightNote: 'RPE 7–8', tempo: '2-0-X-0', cue: 'Контролируй вниз, вверх максимально резко.',
  autoReg: /1$/.test(code) ? 'Любой grind, потеря позиции, RPE > 8 или боль → стоп.' : '',
  alternatives: [], loadUnits: 1, ...extra,
});

const developmentSession = {
  blocks: [
    { code: 'A', label: 'A · Lower anchor', rest_note: '3 мин', exercises: [ex('A1', 'Conventional Deadlift', 3, { targetSets: ['3', '3', '3'], weightNote: '82% 1RM, RPE 7–8' })] },
    { code: 'B', label: 'B · Press + pull', rest_note: '2 мин', exercises: [ex('B1', 'Barbell Bench Press', 3), ex('B2', 'Chest-Supported DB Row', 3)] },
    { code: 'C', label: 'C · Unilateral lower', rest_note: '2 мин', exercises: [ex('C1', 'Bulgarian Split Squat', 3)] },
    { code: 'D', label: 'D · Posterior + core', rest_note: '90 сек', exercises: [ex('D1', '45-Degree Back Extension', 2), ex('D2', 'Pallof Press', 2)] },
    { code: 'E', label: 'E · Prehab', rest_note: '60 сек', exercises: [ex('E1', 'Spanish Squat ISO', 2), ex('E2', 'Soleus Calf Raise', 2)] },
  ],
};

const maintenanceSession = {
  blocks: [
    { code: 'A', label: 'A · Lower anchor', rest_note: '3 мин', exercises: [ex('A1', 'Trap Bar Deadlift', 2, { targetSets: ['3', '3'], weightNote: '82% 1RM, RPE 7–8' })] },
    { code: 'B', label: 'B · Press + pull', rest_note: '2 мин', exercises: [ex('B1', 'DB Bench Press', 2), ex('B2', 'Cable Row', 2)] },
    { code: 'C', label: 'C · Lower sequence', rest_note: '90 сек', exercises: [ex('C1', 'Reverse Lunge', 2), ex('C2', 'Machine Hamstring Curl', 2)] },
    { code: 'D', label: 'D · Core + prehab', rest_note: '45 сек', exercises: [ex('D1', 'Dead Bug Core', 1), ex('D2', 'Cable External Rotation', 1), ex('D3', 'Soleus Calf Raise', 1)] },
  ],
};

test('manual strength modes and Green/Yellow/Red doses are deterministic', () => {
  const dev = buildInSeasonStrengthContext({ focus: 'inseason_strength', position: 'MB', requestedMode: 'development', recoveryStatus: 'green' });
  const maintenance = buildInSeasonStrengthContext({ focus: 'inseason_strength', position: 'Libero', requestedMode: 'maintenance', recoveryStatus: 'green' });
  const yellow = buildInSeasonStrengthContext({ focus: 'inseason_strength', requestedMode: 'development', recoveryStatus: 'yellow' });
  const red = buildInSeasonStrengthContext({ focus: 'inseason_strength', requestedMode: 'maintenance', recoveryStatus: 'red' });
  assert.equal(dev.mode, 'development');
  assert.deepEqual(inSeasonStrengthDoseProfile(dev).minutes, { min: 50, max: 55 });
  assert.equal(maintenance.mode, 'maintenance');
  assert.deepEqual(inSeasonStrengthDoseProfile(maintenance).minutes, { min: 30, max: 35 });
  assert.deepEqual(inSeasonStrengthDoseProfile(yellow).minutes, { min: 40, max: 45 });
  assert.equal(red.mode, 'red_adaptation');
  assert.deepEqual(inSeasonStrengthDoseProfile(red).jumpContacts, { min: 0, max: 0 });
});

test('same-pattern exposure under 48 hours applies Yellow volume without replacing the selected mode', () => {
  const context = buildInSeasonStrengthContext({
    focus: 'inseason_strength', requestedMode: 'maintenance', recoveryStatus: 'green',
    anchorContext: { closeExposure: true, lowerAnchor: 'Trap Bar Deadlift' },
  });
  assert.equal(context.mode, 'maintenance');
  assert.equal(context.doseStatus, 'yellow');
  assert.deepEqual(inSeasonStrengthDoseProfile(context).minutes, { min: 25, max: 30 });
});

test('1RM is usable for exact percentages for 12 weeks only', () => {
  assert.equal(assessOneRmFreshness([{ date: '2026-06-04' }], '2026-08-27').fresh, true);
  assert.equal(assessOneRmFreshness([{ date: '2026-06-03' }], '2026-08-27').fresh, false);
  assert.equal(assessOneRmFreshness([], '2026-08-27').status, 'missing');
});

test('Development and Maintenance pass exact strength structure audits', () => {
  const devPrescription = inSeasonStrengthDoseProfile(buildInSeasonStrengthContext({ focus: 'inseason_strength', requestedMode: 'development' }));
  const maintenancePrescription = inSeasonStrengthDoseProfile(buildInSeasonStrengthContext({ focus: 'inseason_strength', requestedMode: 'maintenance' }));
  assert.equal(auditInSeasonStrengthSession(developmentSession, devPrescription).valid, true);
  assert.equal(auditInSeasonStrengthSession(maintenanceSession, maintenancePrescription).valid, true);
  assert.equal(validateSession(developmentSession, [], { focus: 'inseason_strength', dosePrescription: devPrescription }).valid, true);
  assert.equal(validateSession(maintenanceSession, [], { focus: 'inseason_strength', dosePrescription: maintenancePrescription }).valid, true);
});

test('strength audit rejects ballistics and validator keeps squats, Olympic lifts and Nordic automatic work forbidden', () => {
  const prescription = inSeasonStrengthDoseProfile(buildInSeasonStrengthContext({ focus: 'inseason_strength', requestedMode: 'development' }));
  const ballistic = structuredClone(developmentSession);
  ballistic.blocks[4].exercises[0].name = 'Countermovement Jump';
  assert.equal(auditInSeasonStrengthSession(ballistic, prescription).valid, false);
  for (const name of ['Back Squat', 'Power Clean', 'Nordic Hamstring Curl']) {
    const invalid = structuredClone(developmentSession);
    invalid.blocks[0].exercises[0].name = name;
    assert.equal(validateSession(invalid, [], { focus: 'inseason_strength', dosePrescription: prescription }).valid, false, name);
  }
});

test('coach UI exposes Russian strength modes and submits the selected mode', () => {
  const source = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
  assert.match(source, /label: 'Развивающая'/);
  assert.match(source, /label: 'Поддерживающая'/);
  assert.match(source, /strengthMode/);
  const statusSource = readFileSync(new URL('../pages/api/programs/generate-status.js', import.meta.url), 'utf8');
  assert.match(statusSource, /processing_status: 'quality_correction'/);
});
