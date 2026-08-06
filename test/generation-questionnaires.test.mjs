import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const playerData = readFileSync(new URL('../lib/playerData.js', import.meta.url), 'utf8');
const generate = readFileSync(new URL('../pages/api/programs/generate.js', import.meta.url), 'utf8');
const asyncSubmit = readFileSync(new URL('../pages/api/programs/generate-async.js', import.meta.url), 'utf8');
const asyncStatus = readFileSync(new URL('../pages/api/programs/generate-status.js', import.meta.url), 'utf8');

test('snapshot reads all three questionnaire families including post-morning load', () => {
  assert.match(playerData, /survey:morning:/);
  assert.match(playerData, /survey:latest:/);
  assert.match(playerData, /survey:session:latest:/);
  assert.match(playerData, /postMorningSurveys/);
  assert.match(generate, /СВЕЖАЯ АНКЕТА ПОСЛЕ УТРЕННЕЙ ТРЕНИРОВКИ/);
  assert.match(generate, /questionnaireContext/);
});

test('async generation refreshes questionnaires immediately before the first model request', () => {
  assert.match(asyncSubmit, /generationRequest: req\.body/);
  assert.match(asyncStatus, /buildGenerationInputs\(record\.generationRequest\)/);
  assert.match(asyncStatus, /inputsRefreshedAt/);
  assert.ok(
    asyncStatus.indexOf('buildGenerationInputs(record.generationRequest)')
      < asyncStatus.indexOf('createOpenAIBackgroundResponse(apiKey, activePrompt, sessionTool)'),
  );
});
