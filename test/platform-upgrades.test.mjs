import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ensureSessionExerciseIds } from '../lib/exerciseIdentity.mjs';
import { mergeWorkoutProgress, summarizePlayerWorkout } from '../lib/workoutProgress.mjs';

const coachPage = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
const playerPage = readFileSync(new URL('../pages/player/[id].js', import.meta.url), 'utf8');
const shareApi = readFileSync(new URL('../pages/api/players/share-token.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');

const session = {
  blocks: [
    { label: 'A', exercises: [{ name: 'Trap Bar Deadlift', targetSets: ['3', '3'] }, { name: 'Row', targetSets: ['5'] }] },
    { label: 'B', exercises: [{ name: 'Pallof Press', targetSets: ['6/side'] }] },
  ],
};

test('cross-device progress keeps the newest value for each individual set', () => {
  const existing = {
    done: { '0-0-0': true, '0-0-1': false },
    setUpdatedAt: { '0-0-0': '2026-08-28T10:00:00.000Z', '0-0-1': '2026-08-28T10:05:00.000Z' },
    revision: 4,
  };
  const incoming = {
    done: { '0-0-0': false, '0-0-1': true },
    setUpdatedAt: { '0-0-0': '2026-08-28T09:59:00.000Z', '0-0-1': '2026-08-28T10:06:00.000Z' },
    clientRevision: 4,
    requestId: 'request-1',
  };
  const merged = mergeWorkoutProgress(existing, incoming, '2026-08-28T10:07:00.000Z');
  assert.equal(merged.done['0-0-0'], true);
  assert.equal(merged.done['0-0-1'], true);
  assert.equal(merged.revision, 5);
  assert.equal(mergeWorkoutProgress(merged, incoming, '2026-08-28T10:08:00.000Z').revision, 5);
  const later = mergeWorkoutProgress(merged, { done: {}, requestId: 'request-2', lastActionAt: '2026-08-28T10:08:00.000Z' }, '2026-08-28T10:08:00.000Z');
  assert.equal(mergeWorkoutProgress(later, incoming, '2026-08-28T10:09:00.000Z').revision, later.revision);
});

test('older device metadata cannot clear a newer active block or rest timer', () => {
  const existing = {
    activeBlock: 2,
    restUntil: '2026-08-28T10:10:00.000Z',
    lastActionAt: '2026-08-28T10:09:00.000Z',
    revision: 2,
  };
  const merged = mergeWorkoutProgress(existing, {
    activeBlock: 0,
    restUntil: null,
    lastActionAt: '2026-08-28T10:08:00.000Z',
    requestId: 'old-device',
  }, '2026-08-28T10:09:30.000Z');
  assert.equal(merged.activeBlock, 2);
  assert.equal(merged.restUntil, existing.restUntil);
});

test('team live summary exposes active block, progress and attention flags', () => {
  const summary = summarizePlayerWorkout(session, {
    done: { '0-0-0': true, '0-0-1': true, '0-1-0': true },
    startedAt: '2026-08-28T10:00:00.000Z',
    savedAt: '2026-08-28T10:00:00.000Z',
    restUntil: '2026-08-28T10:01:00.000Z',
  }, null, '2026-08-28T10:05:00.000Z');
  assert.equal(summary.activeBlock, 'B');
  assert.equal(summary.progress, 75);
  assert.ok(summary.alerts.includes('Нет синхронизации более 2 минут'));
  assert.ok(summary.alerts.includes('Время отдыха завершено'));
});

test('saved sessions receive stable exercise identities without replacing existing ids', () => {
  const normalized = ensureSessionExerciseIds(session);
  assert.match(normalized.blocks[0].exercises[0].exerciseId, /^v2-/);
  const preserved = ensureSessionExerciseIds({ blocks: [{ exercises: [{ name: 'Renamed', exerciseId: 'library-42' }] }] });
  assert.equal(preserved.blocks[0].exercises[0].exerciseId, 'library-42');
});

test('coach application exposes live operations, continuity, access and health surfaces', () => {
  assert.match(coachPage, /Тренировка команды LIVE/);
  assert.match(coachPage, /Преемственность нагрузки/);
  assert.match(coachPage, /Доступ игрока/);
  assert.match(coachPage, /Здоровье платформы/);
  assert.match(shareApi, /action === 'rotate'/);
  assert.match(shareApi, /action === 'revoke'/);
});

test('player synchronization sends per-field clocks and mobile accessibility safeguards', () => {
  assert.match(playerPage, /setUpdatedAt/);
  assert.match(playerPage, /weightUpdatedAt/);
  assert.match(playerPage, /requestId/);
  assert.match(styles, /@media \(pointer: coarse\)/);
  assert.match(styles, /font-size: 16px !important/);
  assert.match(styles, /prefers-reduced-motion/);
});
