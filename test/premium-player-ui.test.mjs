import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const playerPage = readFileSync(new URL('../pages/player/[id].js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');

test('player app uses a full identity hero and compact sticky workout controls', () => {
  assert.match(playerPage, /className="player-hero/);
  assert.match(playerPage, /className="player-progress-dock sticky top-0/);
  assert.match(playerPage, /<h1 className="player-page-title text-white">/);
  assert.doesNotMatch(playerPage, /player-page-title truncate/);
});

test('player exercise surfaces use premium branded glass components', () => {
  assert.match(playerPage, /player-exercise-card/);
  assert.match(playerPage, /player-exercise-media/);
  assert.match(playerPage, /player-set-button/);
  assert.match(styles, /\.player-exercise-card[\s\S]*backdrop-filter: blur\(24px\)/);
  assert.match(styles, /\.player-page-shell::before[\s\S]*url\('\/nk-logo\.jpg'\)/);
});

test('player install prompt stays aligned to the mobile application canvas', () => {
  assert.match(styles, /\.player-install-hint \{[\s\S]*width: min\(calc\(100% - 32px\), 508px\)/);
});

test('player experience includes start, focus, rest, undo and completion states', () => {
  assert.match(playerPage, /player-start-card/);
  assert.match(playerPage, /player-focus-toggle/);
  assert.match(playerPage, /player-rest-timer/);
  assert.match(playerPage, /player-undo-toast/);
  assert.match(playerPage, /player-completion-summary/);
  assert.match(playerPage, /gym:pending:/);
});

test('exercise technique opens in a branded in-app video modal', () => {
  assert.match(playerPage, /PlayerVideoModal/);
  assert.match(playerPage, /youtube-nocookie\.com\/embed/);
  assert.match(styles, /\.player-video-modal-card/);
  assert.match(styles, /@keyframes player-modal-in/);
});
