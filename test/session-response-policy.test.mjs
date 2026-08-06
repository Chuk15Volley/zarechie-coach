import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isOutputTokenLimit,
  SESSION_GENERATION_MODEL,
  SESSION_OUTPUT_TOKENS,
  SESSION_RETRY_OUTPUT_TOKENS,
  sessionResponseFailureMessage,
} from '../lib/sessionResponsePolicy.mjs';

test('uses the cost-quality GPT-5.6 tier for session generation', () => {
  assert.equal(SESSION_GENERATION_MODEL, 'gpt-5.6-terra');
});

test('all active app AI routes avoid the unsuffixed Sol alias', async () => {
  const routePaths = [
    '../pages/api/programs/generate.js',
    '../pages/api/programs/generate-status.js',
    '../pages/api/programs/generate-warmup.js',
    '../pages/api/programs/regenerate-exercise.js',
    '../pages/api/programs/suggest-alternative.js',
    '../pages/api/warmup/generate.js',
    '../pages/api/exercises/ai-categorize.js',
    '../pages/api/exercises/ai-rename-bulk.js',
  ];
  const sources = await Promise.all(routePaths.map(path => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of sources) {
    assert.doesNotMatch(source, /['"]gpt-5\.6['"]/);
  }
});

test('recognizes Responses API output-token exhaustion and reserves a larger retry budget', () => {
  const response = { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } };
  assert.equal(isOutputTokenLimit(response), true);
  assert.ok(SESSION_OUTPUT_TOKENS >= 12000);
  assert.ok(SESSION_RETRY_OUTPUT_TOKENS > SESSION_OUTPUT_TOKENS);
});

test('never exposes raw max_output_tokens as the coach-facing error', () => {
  const message = sessionResponseFailureMessage({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } });
  assert.doesNotMatch(message, /^max_output_tokens$/);
  assert.match(message, /автоматически увеличила лимит/);
});
