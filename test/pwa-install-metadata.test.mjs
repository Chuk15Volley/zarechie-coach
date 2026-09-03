import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../pages/_app.js', import.meta.url), 'utf8');
const playerSource = readFileSync(new URL('../pages/player/[id].js', import.meta.url), 'utf8');
const playerManifestSource = readFileSync(new URL('../pages/api/player-manifest/[token].js', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));

const expectedIcons = [
  '/icons/nk-team-192.png',
  '/icons/nk-team-512.png',
  '/icons/nk-team-maskable-512.png',
];

test('coach install metadata uses the NK TEAM SYSTEM identity', () => {
  assert.equal(manifest.name, 'NK TEAM SYSTEM');
  assert.equal(manifest.short_name, 'NK TEAM SYSTEM');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map(icon => icon.src), expectedIcons);
  assert.match(appSource, /name="apple-mobile-web-app-title" content="NK TEAM SYSTEM"/);
  assert.match(appSource, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(appSource, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/);
});

test('all manifest icon files are present and use explicit PNG metadata', () => {
  for (const icon of manifest.icons) {
    const iconUrl = new URL(`../public${icon.src}`, import.meta.url);
    const [expectedWidth, expectedHeight] = icon.sizes.split('x').map(Number);
    assert.equal(icon.type, 'image/png');
    assert.ok(existsSync(iconUrl), `${icon.src} must exist`);
    const png = readFileSync(iconUrl);
    assert.equal(png.readUInt32BE(16), expectedWidth, `${icon.src} width must match its manifest`);
    assert.equal(png.readUInt32BE(20), expectedHeight, `${icon.src} height must match its manifest`);
    assert.ok(workerSource.includes(`'${icon.src}'`), `${icon.src} must be available offline`);
  }
  const appleIcon = readFileSync(new URL('../public/icons/apple-touch-icon.png', import.meta.url));
  assert.equal(appleIcon.readUInt32BE(16), 180);
  assert.equal(appleIcon.readUInt32BE(20), 180);
});

test('player home-screen install keeps the same NK name and logo', () => {
  assert.match(playerSource, /apple-mobile-web-app-title" content="NK TEAM SYSTEM"/);
  assert.match(playerSource, /href="\/icons\/apple-touch-icon\.png"/);
  assert.match(playerManifestSource, /name: 'NK TEAM SYSTEM'/);
  assert.match(playerManifestSource, /short_name: 'NK TEAM SYSTEM'/);
  assert.doesNotMatch(playerManifestSource, /player-photo/);
});
