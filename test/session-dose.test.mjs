import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDose, buildDosePrescription } from '../lib/sessionDose.mjs';

function isoSession(setCount = 3) {
  const labels = ['A', 'B', 'C', 'D', 'E'];
  return {
    blocks: labels.map((label, blockIndex) => ({
      label,
      rest_note: '2-3 мин после круга',
      exercises: [0, 1].map(exIndex => ({
        code: `${label}${exIndex + 1}`,
        name: `${label} Unique ISO Exercise ${exIndex + 1}`,
        targetSets: Array.from({ length: setCount }, () => '5'),
        tempo: '0-5сек-X-0',
      })),
    })),
  };
}

test('isometric prescription enforces the 60-70 minute development-session budget', () => {
  const prescription = buildDosePrescription({ focus: 'camp_iso_anterior' });
  const audit = auditDose(isoSession(), prescription);
  assert.equal(prescription.minutes.min, 60);
  assert.equal(audit.valid, true);
  assert.equal(audit.actual.totalSets, 30);
  assert.equal(audit.actual.hardSets, 18);
});

test('dose audit rejects excessive set volume even when exercise count looks normal', () => {
  const audit = auditDose(isoSession(5), buildDosePrescription({ focus: 'camp_iso_anterior' }));
  assert.equal(audit.checks.totalSets, false);
  assert.equal(audit.valid, false);
});

test('red coach status deterministically reduces volume and RPE ceilings', () => {
  const normal = buildDosePrescription({ focus: 'camp_iso_anterior', coachRecovery: 'green' });
  const red = buildDosePrescription({ focus: 'camp_iso_anterior', coachRecovery: 'red' });
  assert.ok(red.totalSets.max < normal.totalSets.max);
  assert.equal(red.targetRpe.max, 6);
});
