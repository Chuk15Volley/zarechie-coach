import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
