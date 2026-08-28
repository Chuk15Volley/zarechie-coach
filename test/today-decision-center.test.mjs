import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildTodayDecisionCenter,
  evaluateReturnToPlay,
  normalizeReturnToPlay,
  recommendNextLoad,
} from '../lib/todayDecisionCenter.mjs';

const coachPage = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
const teamStatusApi = readFileSync(new URL('../pages/api/programs/team-status.js', import.meta.url), 'utf8');
const rtpApi = readFileSync(new URL('../pages/api/players/return-to-play.js', import.meta.url), 'utf8');

test('return-to-play normalization constrains phase, pain and user-provided text', () => {
  const plan = normalizeReturnToPlay({
    status: 'active', currentPhase: 99, painScore: -2, title: '  Голеностоп  ',
    criteria: [{ label: ' Без боли ', complete: true }, { label: '' }],
  }, '2026-08-28');
  assert.equal(plan.currentPhase, 5);
  assert.equal(plan.painScore, 0);
  assert.equal(plan.title, 'Голеностоп');
  assert.equal(plan.criteria.length, 1);
});

test('active RTP caps volume and RPE before readiness progression', () => {
  const recommendation = recommendNextLoad({
    readiness: { status: 'green', dataCompleteness: 100 },
    status: { planFact: { completionPercent: 100, sessionRpe: 6 } },
    returnToPlay: { status: 'active', currentPhase: 2, painScore: 0 },
  });
  assert.equal(recommendation.mode, 'rtp');
  assert.equal(recommendation.volumePercent, 50);
  assert.equal(recommendation.rpeCap, 6);
  assert.equal(recommendation.requiresCoachApproval, true);
});

test('red readiness and pain block automatic progression', () => {
  const recommendation = recommendNextLoad({
    readiness: { status: 'red', doms: 5, dataCompleteness: 100 },
    activeInjuries: [{ status: 'active' }],
    status: { planFact: { completionPercent: 100, sessionRpe: 6 } },
  });
  assert.equal(recommendation.mode, 'recover');
  assert.ok(recommendation.volumePercent <= 55);
  assert.ok(recommendation.rpeCap <= 6);
});

test('progression is small and only available on complete high-quality evidence', () => {
  const recommendation = recommendNextLoad({
    readiness: { status: 'green', doms: 1, dataCompleteness: 100 },
    status: { planFact: { completionPercent: 100, sessionRpe: 6 } },
  });
  assert.equal(recommendation.mode, 'progress');
  assert.equal(recommendation.volumePercent, 103);
  assert.equal(recommendation.intensityPercent, 102);
});

test('today centre prioritizes red readiness, RTP review and live signals', () => {
  const centre = buildTodayDecisionCenter([
    { player: { id: '1', name: 'А' }, status: { hasSession: true, returnToPlay: { status: 'active', currentPhase: 3, nextReviewDate: '2026-08-20' } } },
    { player: { id: '2', name: 'Б' }, status: { hasSession: false } },
  ], [
    { id: '1', status: 'yellow', dataCompleteness: 100 },
    { id: '2', status: 'red', dataCompleteness: 100 },
  ]);
  assert.equal(centre.athletes[0].player.id, '2');
  assert.equal(centre.summary.rtp, 1);
  assert.equal(centre.summary.decisions, 2);
});

test('RTP evaluation surfaces due reviews and completed criteria', () => {
  const plan = evaluateReturnToPlay({
    status: 'active', currentPhase: 4, nextReviewDate: '2026-08-20',
    criteria: [{ label: 'Спринт', complete: true }],
  }, '2026-08-28');
  assert.equal(plan.reviewDue, true);
  assert.equal(plan.criteriaPercent, 100);
  assert.equal(plan.coachDecisionRequired, true);
});

test('coach application and batched API expose the complete Today workflow', () => {
  assert.match(coachPage, /Умный центр решений/);
  assert.match(coachPage, /Return-to-Play/);
  assert.match(coachPage, /Применить рекомендацию/);
  assert.match(teamStatusApi, /recommendNextLoad/);
  assert.match(teamStatusApi, /returnToPlayKey/);
  assert.match(rtpApi, /normalizeReturnToPlay/);
});
