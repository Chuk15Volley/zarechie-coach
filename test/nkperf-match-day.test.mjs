import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  expectsPerformanceTests,
  usesSeasonCalendar,
  workspaceDisplayName,
} from '../lib/workspacePolicy.mjs';
import { resolveSeasonSession } from '../lib/seasonPolicy.mjs';

test('both coaching workspaces use isolated season calendars', () => {
  assert.equal(usesSeasonCalendar('zarechie'), true);
  assert.equal(usesSeasonCalendar('nkperf'), true);
  assert.equal(usesSeasonCalendar('unknown'), false);
  assert.equal(workspaceDisplayName('zarechie'), 'ЗАРЕЧЬЕ');
  assert.equal(workspaceDisplayName('nkperf'), 'NK PERFORMANCE');
});

test('NK Performance shares match-day policy without requiring club neuro tests', () => {
  assert.equal(expectsPerformanceTests('zarechie'), true);
  assert.equal(expectsPerformanceTests('nkperf'), false);

  for (const workspace of ['zarechie', 'nkperf']) {
    assert.equal(usesSeasonCalendar(workspace), true);
    const decision = resolveSeasonSession({
      events: [{ date: '2026-08-20', type: 'game' }],
      targetDate: '2026-08-20',
      requestedFocus: 'inseason_strength',
      requestedTrainingType: 'full_body',
    });
    assert.equal(decision.key, 'match_day', workspace);
    assert.equal(decision.label, 'Игровой день · силовой праймер', workspace);
  }
});

test('generation, warmup, reschedule and decision APIs enable the shared calendar policy', () => {
  const sources = [
    'pages/api/programs/generate.js',
    'pages/api/programs/generate-warmup.js',
    'pages/api/programs/reschedule.js',
    'pages/api/players/decision-data.js',
  ].map(file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));

  for (const source of sources) assert.match(source, /usesSeasonCalendar\(workspace\)/);
  assert.match(sources[0], /systemPromptForGeneration[\s\S]*usesSeasonCalendar\(workspace\) && isInSeasonFocus\(focus\)/);
  assert.match(sources[0], /expectsPerformanceTests\(workspace\) && seasonDecision\?\.key !== 'match_day'/);
  assert.match(sources[3], /День матча · силовой праймер/);
});

test('NK UI loads its own schedule and enforces individual manual review on match day', () => {
  const source = fs.readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
  assert.match(source, /const matchDayManualReview = usesSeasonCalendar\(workspace\)/);
  assert.match(source, /fetch\(`\/api\/schedule\?workspace=\$\{workspace\}`/);
  assert.doesNotMatch(source, /if \(workspace === 'nkperf'\) \{\s*setScheduleEvents\(\[\]\)/);
  assert.match(source, /Календарь NK Performance/);
});
