import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOutputTokenLimit,
  SESSION_OUTPUT_TOKENS,
  SESSION_RETRY_OUTPUT_TOKENS,
  sessionResponseFailureMessage,
} from '../lib/sessionResponsePolicy.mjs';

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
