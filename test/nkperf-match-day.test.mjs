import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  expectsPerformanceTests,
  usesMatchLoad,
  usesSeasonCalendar,
  workspaceDisplayName,
} from '../lib/workspacePolicy.mjs';
import {
  formatSeasonDecisionForPrompt,
  MANUAL_MATCH_DAY_FOCUS,
  resolveManualMatchDaySession,
} from '../lib/seasonPolicy.mjs';

test('only Zarechie uses the team season calendar', () => {
  assert.equal(usesSeasonCalendar('zarechie'), true);
  assert.equal(usesSeasonCalendar('nkperf'), false);
  assert.equal(usesSeasonCalendar('unknown'), false);
  assert.equal(usesMatchLoad('zarechie'), true);
  assert.equal(usesMatchLoad('nkperf'), true);
  assert.equal(workspaceDisplayName('zarechie'), 'ЗАРЕЧЬЕ');
  assert.equal(workspaceDisplayName('nkperf'), 'NK PERFORMANCE');
});

test('NK Performance match day is a manual per-athlete selection', () => {
  assert.equal(expectsPerformanceTests('zarechie'), true);
  assert.equal(expectsPerformanceTests('nkperf'), false);
  assert.equal(MANUAL_MATCH_DAY_FOCUS, 'inseason_match_day_primer');

  for (const consecutiveGameDay of [1, 2, 3, 4]) {
    const decision = resolveManualMatchDaySession({
      targetDate: '2026-08-20',
      consecutiveGameDay,
    });
    assert.equal(decision.key, 'match_day');
    assert.equal(decision.label, 'Игровой день · силовой праймер');
    assert.equal(decision.manualSelection, true);
    assert.equal(decision.calendar.consecutiveGameDay, Math.min(consecutiveGameDay, 3));
    const prompt = formatSeasonDecisionForPrompt(decision);
    assert.match(prompt, /РУЧНОЕ РЕШЕНИЕ ТРЕНЕРА/);
    assert.match(prompt, /без общего календаря/);
    assert.doesNotMatch(prompt, /Предыдущий матч:/);
  }
});

test('generation APIs keep NK manual while Zarechie retains calendar safety', () => {
  const generation = fs.readFileSync(new URL('../pages/api/programs/generate.js', import.meta.url), 'utf8');
  const warmup = fs.readFileSync(new URL('../pages/api/programs/generate-warmup.js', import.meta.url), 'utf8');
  const teamWarmup = fs.readFileSync(new URL('../pages/api/warmup/generate.js', import.meta.url), 'utf8');
  const reschedule = fs.readFileSync(new URL('../pages/api/programs/reschedule.js', import.meta.url), 'utf8');
  const decisionData = fs.readFileSync(new URL('../pages/api/players/decision-data.js', import.meta.url), 'utf8');

  assert.match(generation, /manualMatchDayRequested = workspace === 'nkperf' && isManualMatchDayFocus\(focus\)/);
  assert.match(generation, /resolveManualMatchDaySession\(\{ targetDate, consecutiveGameDay: previousManualMatchDays \+ 1 \}\)/);
  assert.match(generation, /usesSeasonCalendar\(workspace\) \? redis\('get', scheduleKey\(workspace\)\)/);
  assert.match(generation, /expectsPerformanceTests\(workspace\) && seasonDecision\?\.key !== 'match_day'/);
  assert.match(warmup, /workspace === 'nkperf' && isManualMatchDayFocus\(focus\)/);
  assert.match(teamWarmup, /usesSeasonCalendar\(workspace\)[\s\S]*savedSeasonDecision/);
  assert.match(reschedule, /if \(usesSeasonCalendar\(workspace\)\)/);
  assert.match(decisionData, /usesSeasonCalendar\(workspace\)/);
});

test('NK UI offers manual match day and never loads a team schedule', () => {
  const source = fs.readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
  assert.match(source, /MANUAL_MATCH_DAY_FOCUS/);
  assert.match(source, /workspace === 'nkperf' && isManualMatchDayFocus\(focus\)/);
  assert.match(source, /if \(!usesSeasonCalendar\(workspace\)\) \{\s*setScheduleEvents\(\[\]\);\s*setShowSchedule\(false\)/);
  assert.match(source, /phasesForWorkspace\(period, workspace\)/);
  assert.match(source, /s\.id !== 'planner' \|\| usesSeasonCalendar\(workspace\)/);
  assert.match(source, /mainSection === 'planner' && usesSeasonCalendar\(workspace\)/);
  assert.match(source, /Режим NK Performance/);
  assert.doesNotMatch(source, /Календарь NK Performance/);
});
