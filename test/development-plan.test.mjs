import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDevelopmentPlan,
  formatDevelopmentPlanForPrompt,
  normalizeDevelopmentPlan,
} from '../lib/developmentPlan.mjs';

test('development plan is capped at three goals and review is exactly four weeks', () => {
  const plan = normalizeDevelopmentPlan({
    cycleStart: '2026-08-06',
    reviewDate: '2099-01-01',
    goals: [
      { title: 'Goal 1', criterion: 'A' },
      { title: 'Goal 2', criterion: 'B' },
      { title: 'Goal 3', criterion: 'C' },
      { title: 'Goal 4', criterion: 'D' },
    ],
  });

  assert.equal(plan.reviewDate, '2026-09-03');
  assert.equal(plan.goals.length, 3);
  assert.deepEqual(plan.goals.map(goal => goal.title), ['Goal 1', 'Goal 2', 'Goal 3']);
});

test('development goals guide continuity without overriding safety or session method', () => {
  const text = formatDevelopmentPlanForPrompt({
    cycleStart: '2026-08-01',
    goals: [
      { title: 'Сила задней цепи', criterion: 'RDL 3x6 без боли' },
    ],
  }, '2026-08-10');

  assert.match(text, /ИНДИВИДУАЛЬНЫЙ ПЛАН РАЗВИТИЯ/);
  assert.match(text, /Сила задней цепи/);
  assert.match(text, /не пытайся закрыть все цели в одной сессии/);
  assert.match(text, /Боль.*всегда сильнее целей/);
});

test('expired development cycle requires review before adding goal-driven volume', () => {
  const text = formatDevelopmentPlanForPrompt({
    cycleStart: '2026-07-01',
    goals: [{ title: 'Улучшить силу' }],
  }, '2026-08-06');

  assert.match(text, /наступил срок пересмотра/);
  assert.match(text, /не добавляй новый целевой объём/);
});

test('four-week review reports adherence, meaningful change and target achievement', () => {
  const reviewed = evaluateDevelopmentPlan({
    cycleStart: '2026-07-01',
    goals: [{ id: 'cmj', title: 'Увеличить CMJ', metric: 'cmj', baselineValue: 40, targetValue: 42, unit: ' см' }],
  }, {
    targetDate: '2026-08-01',
    plannedSessions: 12,
    actualSessions: 11,
    metrics: { cmj: { value: 42.4, date: '2026-07-31', decisionThresholdPercent: 3 } },
  });
  assert.equal(reviewed.review.due, true);
  assert.equal(reviewed.review.adherencePercent, 92);
  assert.equal(reviewed.goals[0].achieved, true);
  assert.equal(reviewed.goals[0].meaningful, true);
  assert.equal(reviewed.goals[0].reviewStatus, 'achieved');
});

test('sprint goal correctly treats a lower time as improvement', () => {
  const reviewed = evaluateDevelopmentPlan({
    cycleStart: '2026-07-01',
    goals: [{ title: 'Улучшить 10 м', metric: 'sprint10m', baselineValue: 1.9, targetValue: 1.82 }],
  }, { targetDate: '2026-08-01', metrics: { sprint10m: { value: 1.81, decisionThresholdPercent: 3 } } });
  assert.equal(reviewed.goals[0].achieved, true);
  assert.ok(reviewed.goals[0].performanceDeltaPercent > 0);
});
