import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSessionQuality } from '../lib/sessionValidator.js';
import { buildDosePrescription } from '../lib/sessionDose.mjs';

function conservativeSession() {
  const counts = { A: 2, B: 3, C: 1, D: 2, E: 3 };
  return {
    blocks: Object.entries(counts).map(([label, count]) => ({
      label,
      rest_note: ['A', 'B', 'C'].includes(label) ? '2-3 мин после круга' : '30-45 сек между упражнениями',
      exercises: Array.from({ length: count }, (_, index) => ({
        code: `${label}${index + 1}`,
        name: `${label} Safe Movement ${index + 1}`,
        targetSets: ['5', '5', '5'],
        weightNote: 'RPE 6',
        loadUnits: 1,
        tempo: 'контролируемый',
        cue: 'Темп контролируемый. Сохраняй устойчивую позицию.',
        ...(/^[ABC]1$/.test(`${label}${index + 1}`) ? { autoReg: 'RPE 7 → стоп.' } : {}),
      })),
    })),
  };
}

test('quality gate accepts a safe conservative session instead of returning 422', () => {
  const quality = assessSessionQuality(conservativeSession(), {
    focus: 'camp_ecc_anterior',
    trainingType: 'anterior_chain',
    dosePrescription: buildDosePrescription({ focus: 'camp_ecc_anterior', coachRecovery: 'green' }),
  });
  assert.equal(quality.dose.valid, false);
  assert.equal(quality.dose.safe, true);
  assert.equal(quality.dose.minimumViable, true);
  assert.equal(quality.valid, true);
  assert.ok(quality.score >= 85);
});
