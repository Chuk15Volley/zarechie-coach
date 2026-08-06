import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advisorySessionQuality } from '../lib/sessionQualityPolicy.mjs';

const sources = [
  '../pages/api/programs/generate.js',
  '../pages/api/programs/generate-status.js',
  '../pages/api/programs/save.js',
  '../pages/api/programs/copy.js',
  '../pages/api/programs/regenerate-exercise.js',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

test('failed dose and timing checks become coach warnings instead of blockers', () => {
  const quality = advisorySessionQuality({
    score: 70,
    valid: false,
    improvements: ['Дозировка и время: выше ориентира'],
  });

  assert.equal(quality.valid, false);
  assert.equal(quality.reviewRequired, true);
  assert.equal(quality.blocking, false);
  assert.match(quality.reviewMessage, /сохранение разрешено/);
});

test('generation and persistence routes contain no hard quality rejection', () => {
  assert.doesNotMatch(sources, /не прошла обязательн[^\n]+не сохранена/);
  assert.doesNotMatch(sources, /if \(!saveQuality\.valid/);
  assert.doesNotMatch(sources, /if \(!copyQuality\.valid/);
  assert.doesNotMatch(sources, /if \(!replacementQuality\.valid/);
  assert.doesNotMatch(sources, /callOpenAIForSession\(apiKey, fixPrompt\)/);
  assert.doesNotMatch(sources, /processing_status: 'quality_correction'/);
});
