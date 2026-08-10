import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);

test('coach and library UIs never trigger automatic YouTube search', async () => {
  const sources = await Promise.all([
    readFile(new URL('pages/index.js', ROOT), 'utf8'),
    readFile(new URL('pages/library.js', ROOT), 'utf8'),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /\/api\/exercises\/youtube-search/);
  }
});

test('manual YouTube saving remains available to the coach', async () => {
  const source = await readFile(new URL('pages/index.js', ROOT), 'utf8');
  assert.match(source, /\/api\/exercises\/manual-video/);
  assert.match(source, /Добавить YouTube-видео/);
});

test('warmup exercises use the same YouTube video panel as gym exercises', async () => {
  const source = await readFile(new URL('pages/index.js', ROOT), 'utf8');

  assert.match(source, /<ExerciseVideoPanel name=\{ex\.name\} apiKey=\{apiKey\} \/>/);
  assert.doesNotMatch(source, /<ExerciseVideoLink/);
});
