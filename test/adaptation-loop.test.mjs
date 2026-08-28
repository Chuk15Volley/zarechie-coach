import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  adaptSessionDraft,
  adaptationVersionSummary,
  markAdaptationApplied,
  normalizeAdaptationRecommendation,
} from '../lib/sessionAdaptation.mjs';
import { recommendNextLoad } from '../lib/todayDecisionCenter.mjs';

const session = {
  title: 'Силовая',
  blocks: [{ label: 'Блок A', exercises: [
    { name: 'Присед', targetSets: ['5', '5', '5', '5'], weightKg: 100, autoReg: 'Техника' },
    { name: 'Прыжки', targetSets: ['4', '4', '4'], weightKg: 0 },
  ] }],
};

test('adaptation normalizes untrusted recommendation within hard progression caps', () => {
  const progress = normalizeAdaptationRecommendation({ mode: 'progress', volumePercent: 140, intensityPercent: 120, rpeCap: 15 });
  assert.equal(progress.volumePercent, 103);
  assert.equal(progress.intensityPercent, 102);
  assert.equal(progress.rpeCap, 10);
  assert.equal(progress.requiresCoachApproval, true);
  const reduction = normalizeAdaptationRecommendation({ mode: 'reduce', volumePercent: 110, intensityPercent: 103 });
  assert.equal(reduction.volumePercent, 100);
  assert.equal(reduction.intensityPercent, 100);
});

test('draft adaptation is deterministic, non-destructive and never adds sets', () => {
  const original = structuredClone(session);
  const draft = adaptSessionDraft(session, {
    mode: 'reduce', label: 'Снизить', volumePercent: 50, intensityPercent: 90, rpeCap: 7,
    reasons: ['Высокий RPE'], safeguards: ['Подтвердить'],
  }, { draftId: 'draft-1', baseSavedAt: '2026-08-28T10:00:00.000Z', createdAt: '2026-08-28T11:00:00.000Z' });
  assert.deepEqual(session, original);
  assert.equal(draft.before.sets, 7);
  assert.equal(draft.after.sets, 4);
  assert.equal(draft.session.blocks[0].exercises[0].targetSets.length, 2);
  assert.equal(draft.session.blocks[0].exercises[0].weightKg, 90);
  assert.match(draft.session.blocks[0].exercises[0].autoReg, /RPE ≤ 7/);
  assert.equal(draft.session.adaptation.status, 'draft');
});

test('applied adaptation and version summary preserve rollback metadata', () => {
  const draft = adaptSessionDraft(session, { mode: 'maintain' }, { draftId: 'draft-2' });
  const applied = markAdaptationApplied(draft.session, '2026-08-28T12:00:00.000Z');
  assert.equal(applied.adaptation.status, 'applied');
  const summary = adaptationVersionSummary({ savedAt: '2026-08-28T12:00:00.000Z', trainingLabel: 'День 1', session: applied });
  assert.equal(summary.adaptation.mode, 'maintain');
  assert.equal(summary.stats.sets, 7);
});

test('measured outcome closes the loop and constrains the next recommendation', () => {
  const result = recommendNextLoad({
    readiness: { status: 'green', dataCompleteness: 100 },
    status: { previousAdaptationOutcome: { status: 'measured', date: '2026-08-27', outcome: { sessionRpe: 9, compliance: 60, pain: false } } },
  });
  assert.equal(result.mode, 'reduce');
  assert.ok(result.volumePercent <= 75);
  assert.match(result.reasons.join(' '), /Замкнутый цикл/);
});

test('adaptation APIs require confirmation, use atomic compare-and-set, persist outcome and expose rollback', () => {
  const draftApi = readFileSync(new URL('../pages/api/programs/adaptation-draft.js', import.meta.url), 'utf8');
  const versionsApi = readFileSync(new URL('../pages/api/programs/versions.js', import.meta.url), 'utf8');
  const actualApi = readFileSync(new URL('../pages/api/programs/save-actual.js', import.meta.url), 'utf8');
  const teamStatus = readFileSync(new URL('../pages/api/programs/team-status.js', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
  assert.match(draftApi, /action === 'commit'/);
  assert.match(draftApi, /COMMIT_SCRIPT/);
  assert.match(draftApi, /baseSavedAt/);
  assert.match(versionsApi, /RESTORE_SCRIPT/);
  assert.match(actualApi, /adaptationOutcomeKey/);
  assert.match(actualApi, /adaptationHistoryKey/);
  assert.match(teamStatus, /previousAdaptationOutcome/);
  assert.match(dashboard, /Подтвердить и применить/);
  assert.match(dashboard, /Восстановить/);
});
