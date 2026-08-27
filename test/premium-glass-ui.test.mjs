import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dashboard = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles/globals.css', import.meta.url), 'utf8');

test('dashboard uses branded popovers instead of native select menus', () => {
  assert.match(dashboard, /function PremiumSelect\(/);
  assert.match(dashboard, /createPortal\(/);
  assert.doesNotMatch(dashboard, /<select\b/);
  assert.match(styles, /\.premium-select-popover/);
});

test('roster heading scrolls with the player list', () => {
  const rosterHeader = dashboard.match(/className="([^"]*sidebar-roster-head[^"]*)"/)?.[1] || '';
  assert.ok(rosterHeader, 'roster header class must exist');
  assert.doesNotMatch(rosterHeader, /\bsticky\b/);
  assert.doesNotMatch(rosterHeader, /\btop-0\b/);
});

test('premium surfaces use glass layers and a stronger NK watermark', () => {
  assert.match(styles, /\.premium-command-center[\s\S]*?backdrop-filter:\s*blur\(28px\)/);
  assert.match(styles, /\.premium-modal-card/);
  assert.match(styles, /\.nk-background-mark[\s\S]*?opacity:\s*0\.062/);
});
