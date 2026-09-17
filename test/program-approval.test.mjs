import test from 'node:test';
import assert from 'node:assert/strict';
import { approveProgramSession } from '../lib/programApproval.mjs';
import { parseSavedSession, sessionTrainingLabel } from '../lib/sessionLabel.js';

test('manual approval records coach verification without changing the prescription', () => {
  const source = { kind: 'prehab_training_draft', blocks: [{ exercises: [{ name: 'Row', targetSets: ['8', '8'] }] }], warnings: 'Исключить осевую нагрузку. Сохраняется ограничение ReadySix или календаря: это черновик для согласования, не разрешение выполнить нагрузку.' };
  const result = approveProgramSession(source, '2026-09-17T13:00:00Z');
  assert.equal(result.approval.status, 'coach_approved');
  assert.equal(result.approval.method, 'manual_save');
  assert.deepEqual(result.blocks, source.blocks);
  assert.match(result.warnings, /Исключить осевую нагрузку/);
  assert.doesNotMatch(result.warnings, /черновик/i);
  assert.match(source.warnings, /черновик/);
});

test('legacy saved programs show final labels in player current session and history', () => {
  const source = { trainingLabel: 'Профилактика · индивидуальный черновик', session: { blocks: [], warnings: 'Это черновик для тренера, а не допуск к выполнению. Исключить прыжки.' } };
  const parsed = parseSavedSession(JSON.stringify(source));
  assert.equal(sessionTrainingLabel(source), 'Профилактика · индивидуальная программа');
  assert.doesNotMatch(parsed.session.warnings, /черновик/i);
  assert.match(parsed.session.warnings, /Исключить прыжки/);
  assert.equal(sessionTrainingLabel({trainingLabel: 'Силовая', session: {blocks: []}}), 'Силовая');
});
