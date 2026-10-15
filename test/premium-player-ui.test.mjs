import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const playerPage = readFileSync(new URL('../pages/player/[id].js', import.meta.url), 'utf8');
const videoModal = readFileSync(new URL('../components/player/PlayerVideoModal.js', import.meta.url), 'utf8');
const videoPreview = readFileSync(new URL('../components/player/PlayerVideoPreview.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');

test('player app uses a full identity hero and compact sticky workout controls', () => {
  assert.match(playerPage, /className="player-hero/);
  assert.match(playerPage, /player-progress-dock[^\n]{0,100}sticky top-0/);
  assert.match(playerPage, /<h1 className="player-page-title text-white">/);
  assert.doesNotMatch(playerPage, /player-page-title truncate/);
});

test('player exercise surfaces use premium branded glass components', () => {
  assert.match(playerPage, /player-exercise-card/);
  assert.match(videoPreview, /player-exercise-media/);
  assert.match(playerPage, /gym-confirm-set/);
  assert.match(styles, /\.player-exercise-card[\s\S]*backdrop-filter: blur\(24px\)/);
  assert.match(styles, /\.player-page-shell::before[\s\S]*url\('\/nk-logo\.jpg'\)/);
});

test('player install prompt stays aligned to the mobile application canvas', () => {
  assert.match(styles, /\.player-install-hint \{[\s\S]*width: min\(calc\(100% - 32px\), 508px\)/);
});

test('player experience includes start, open exercises, rest, undo and completion states', () => {
  assert.match(playerPage, /player-start-card/);
  assert.doesNotMatch(playerPage, /player-focus-toggle|Все упражнения|Текущее упражнение/);
  assert.match(playerPage, /player-rest-timer/);
  assert.match(playerPage, /player-undo-toast/);
  assert.match(playerPage, /player-completion-summary/);
  assert.match(playerPage, /gym:pending:/);
});

test('exercise technique opens inline with an original-video fallback and scoped close', () => {
  assert.match(playerPage, /href=\{watchUrl\}[\s\S]*?target="_blank"/);
  assert.match(playerPage, /PlayerVideoModal/);
  assert.match(videoModal, /youtube-nocookie\.com\/embed/);
  assert.match(videoModal, /Закрыть видео/);
  assert.doesNotMatch(styles, /\.player-video-modal-card|@keyframes player-modal-in/);
});

test('open exercise list preserves circuit progression without hiding blocks or exercises', () => {
  assert.match(playerPage, /blockIsComplete\(context\.block, context\.bi, newDone, skipped\)/);
  assert.match(playerPage, /nextIncompleteBlock\(session, context\.bi, newDone, skipped\)/);
  assert.doesNotMatch(playerPage, /blockCollapsed|focusedEi|previewOpen/);
  assert.doesNotMatch(playerPage, /collapsed=\{focusMode && \(activeExercise/);
});
