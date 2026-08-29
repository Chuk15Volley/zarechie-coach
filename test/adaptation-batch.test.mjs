import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../pages/api/programs/adaptation-batch.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
const weekApi = readFileSync(new URL('../pages/api/schedule/week.js', import.meta.url), 'utf8');

test('batch adaptation is bounded and commits all members through one compare-and-set script', () => {
  assert.match(api, /const MAX_ITEMS = 20/);
  assert.match(api, /if redis\.call\('get', KEYS\[keyOffset\]\) ~= ARGV\[argOffset\]/);
  assert.match(api, /\['EVAL', COMMIT_SCRIPT/);
  assert.match(api, /Одна из программ изменилась/);
});

test('package rollback is atomic and refuses to overwrite later coach edits', () => {
  assert.match(api, /ROLLBACK_SCRIPT/);
  assert.match(api, /member\.appliedRaw/);
  assert.match(api, /Автоматический откат остановлен/);
  assert.match(api, /restoredFromBatch/);
});

test('week screen requires an explicit preview confirmation and exposes package rollback', () => {
  assert.match(ui, /Проверка командной адаптации/);
  assert.match(ui, /Подтвердить весь пакет/);
  assert.match(ui, /Откатить последний пакет/);
  assert.match(ui, /loadCalendarWeek/);
});

test('week API returns enriched athlete budgets while preserving the legacy session map', () => {
  assert.match(weekApi, /zarechie\.team-week\.v2/);
  assert.match(weekApi, /buildAthleteWeekLoad/);
  assert.match(weekApi, /sessions,/);
  assert.match(weekApi, /latestBatch/);
});
