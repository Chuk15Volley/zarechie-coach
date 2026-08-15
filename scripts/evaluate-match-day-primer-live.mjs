#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { IN_SEASON_SYSTEM_PROMPT } from '../lib/inSeasonPrompt.mjs';
import {
  buildMatchDayPrimerContext,
  formatMatchDayPrimerForPrompt,
} from '../lib/matchDayPrimer.mjs';
import { buildDosePrescription, formatDosePrescriptionForPrompt } from '../lib/sessionDose.mjs';
import { resolveSeasonSession } from '../lib/seasonPolicy.mjs';
import { advisorySessionQuality } from '../lib/sessionQualityPolicy.mjs';
import { assessSessionQuality } from '../lib/sessionValidator.js';
import { SESSION_GENERATION_MODEL } from '../lib/sessionResponsePolicy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function localApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) return '';
  const line = fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find(value => /^OPENAI_API_KEY\s*=/.test(value));
  if (!line) return '';
  return line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
}

function isoDateOffset(date, offset) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function readiness(date, overrides = {}) {
  return {
    exactMorning: { date, readiness: 4, sleepQuality: 4, fatigue: 2 },
    morning: { date, readiness: 4, sleepQuality: 4, fatigue: 2 },
    morningFresh: true,
    evening: { date: isoDateOffset(date, -1), shoulderLoad: 2, fatigue: 2, soreness: 2 },
    eveningFresh: true,
    postMorning: null,
    postMorningFresh: false,
    whoop: { date, recovery: 74, hrv: 68 },
    activeInjuries: [],
    ...overrides,
  };
}

const targetDate = '2026-09-12';
const scenarios = [
  {
    id: 'setter-full',
    position: 'Связующая',
    events: [{ date: targetDate, type: 'game' }],
    readiness: readiness(targetDate),
    recoveryStatus: 'green',
  },
  {
    id: 'middle-second-match',
    position: 'Центральная',
    events: [
      { date: isoDateOffset(targetDate, -1), type: 'game' },
      { date: targetDate, type: 'game' },
    ],
    readiness: readiness(targetDate),
    recoveryStatus: 'green',
  },
  {
    id: 'outside-high-shoulder',
    position: 'Доигровщица',
    events: [{ date: targetDate, type: 'game' }],
    readiness: readiness(targetDate, {
      evening: { date: isoDateOffset(targetDate, -1), shoulderLoad: 5, fatigue: 2, soreness: 2 },
    }),
    recoveryStatus: 'green',
  },
  {
    id: 'opposite-stale-data',
    position: 'Диагональная',
    events: [{ date: targetDate, type: 'game' }],
    readiness: readiness(targetDate, {
      exactMorning: null,
      morning: { date: isoDateOffset(targetDate, -2), readiness: 4 },
      morningFresh: false,
      evening: { date: isoDateOffset(targetDate, -2), shoulderLoad: 2 },
      eveningFresh: false,
      whoop: null,
    }),
    recoveryStatus: 'green',
  },
  {
    id: 'libero-stale-active-injury',
    position: 'Либеро',
    events: [{ date: targetDate, type: 'game' }],
    readiness: readiness(targetDate, {
      exactMorning: null,
      morning: null,
      morningFresh: false,
      evening: null,
      eveningFresh: false,
      whoop: null,
      activeInjuries: [{ bodyPart: 'правое плечо', painLevel: 4, severity: 2 }],
    }),
    recoveryStatus: 'green',
  },
];

const exerciseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'name', 'targetSets', 'weightNote', 'tempo', 'autoReg', 'alternatives', 'cue', 'loadUnits'],
  properties: {
    code: { type: 'string' },
    name: { type: 'string' },
    targetSets: { type: 'array', items: { type: 'string' } },
    weightNote: { type: 'string' },
    weightKg: { type: 'number' },
    tempo: { type: 'string' },
    autoReg: { type: 'string' },
    alternatives: { type: 'array', items: { type: 'string' } },
    cue: { type: 'string' },
    loadUnits: { type: 'integer', enum: [1, 2] },
  },
};

const tool = {
  type: 'function',
  name: 'build_session',
  description: 'Структурированный силовой праймер в игровой день.',
  strict: false,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['assessment', 'periodization_note', 'blocks', 'warnings', 'triggers'],
    properties: {
      assessment: { type: 'string' },
      periodization_note: { type: 'string' },
      blocks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'rest_note', 'exercises'],
          properties: {
            label: { type: 'string' },
            rest_note: { type: 'string' },
            exercises: { type: 'array', items: exerciseSchema },
          },
        },
      },
      warnings: { type: 'string' },
      triggers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['signal', 'value', 'action'],
          properties: {
            signal: { type: 'string' },
            value: { type: 'string' },
            action: { type: 'string' },
          },
        },
      },
    },
  },
};

function findFunctionCall(output) {
  const queue = Array.isArray(output) ? [...output] : [];
  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'function_call' && item.name === 'build_session') return item;
    if (Array.isArray(item.content)) queue.push(...item.content);
    if (Array.isArray(item.output)) queue.push(...item.output);
  }
  return null;
}

async function generate(apiKey, prompt) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: SESSION_GENERATION_MODEL,
      instructions: IN_SEASON_SYSTEM_PROMPT,
      input: prompt,
      max_output_tokens: 10000,
      reasoning: { effort: 'medium' },
      text: { verbosity: 'low' },
      tools: [tool],
      tool_choice: { type: 'function', name: 'build_session' },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI HTTP ${response.status}`);
  const call = findFunctionCall(payload.output);
  if (!call?.arguments) throw new Error(`Модель не вернула build_session (${payload.status || 'unknown'})`);
  return typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
}

async function main() {
  const apiKey = localApiKey();
  if (!apiKey) throw new Error('OPENAI_API_KEY не найден');
  const results = [];
  for (const scenario of scenarios) {
    const seasonDecision = resolveSeasonSession({
      events: scenario.events,
      targetDate,
      requestedFocus: 'inseason_strength',
      requestedTrainingType: 'full_body',
    });
    const primer = buildMatchDayPrimerContext({
      targetDate,
      seasonDecision,
      readiness: scenario.readiness,
      position: scenario.position,
      recoveryStatus: scenario.recoveryStatus,
    });
    const decisionWithPrimer = { ...seasonDecision, primer };
    const dose = buildDosePrescription({
      focus: seasonDecision.focus,
      trainingType: seasonDecision.trainingType,
      seasonContext: decisionWithPrimer,
      matchDayPrimer: primer,
    });
    const prompt = `Создай одну контрольную тренировку.\n` +
      `Игрок: ${scenario.position}; история весов не передана — не выдумывай кг, назначь ручной подбор до RPE 6.\n` +
      `${formatMatchDayPrimerForPrompt(primer)}${formatDosePrescriptionForPrompt(dose)}`;
    const session = await generate(apiKey, prompt);
    const quality = advisorySessionQuality(assessSessionQuality(session, {
      focus: seasonDecision.focus,
      trainingType: seasonDecision.trainingType,
      seasonDecision: decisionWithPrimer,
      dosePrescription: dose,
    }));
    results.push({
      scenario: scenario.id,
      position: scenario.position,
      mode: primer.mode,
      score: quality.score,
      blocking: quality.blocking,
      valid: quality.valid,
      issues: quality.improvements,
      exercises: session.blocks?.flatMap(block => block.exercises?.map(exercise => exercise.name) || []) || [],
    });
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  if (results.some(result => result.blocking || !result.valid)) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`Match-day primer live evaluation failed: ${error.message}\n`);
  process.exitCode = 1;
});
