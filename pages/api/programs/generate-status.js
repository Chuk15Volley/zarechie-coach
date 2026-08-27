// pages/api/programs/generate-status.js
// GET ?batchId=xxx -> polls a queued OpenAI background Responses API session.
// While processing: { status: 'pending', processing_status }.
// When done: extracts the build_session function call, optionally persists the session to
// Redis, and returns { status: 'done', session, player, dataSummary, date, dayGoal }.

import { isAuthorized } from '../../../lib/auth';
import { redis, redisPipeline } from '../../../lib/redis';
import { getPlayerSnapshot } from '../../../lib/playerData';
import { exhistKey, exweightKey, gymTonnageDatesKey, gymTonnageKey, sessionKey, sessionsKey } from '../../../lib/workspacePrefix';
import { assessSessionQuality, qualityCorrectionPrompt } from '../../../lib/sessionValidator';
import { advisorySessionQuality } from '../../../lib/sessionQualityPolicy.mjs';
import { sanitizeUnavailableEquipmentExercises } from '../../../lib/equipmentRestrictions.mjs';
import { normalizeSessionTempoDescriptions } from '../../../lib/tempoDescription.mjs';
import { OPENAI_SESSION_MODEL, SYSTEM_PROMPT, buildGenerationInputs, normalizeExerciseLanguage } from './generate';
import { normExName } from '../players/progression';
import { loadUnitsForExercise, weightKgFromExercise } from '../../../lib/tonnage';
import {
  isOutputTokenLimit,
  SESSION_OUTPUT_TOKENS,
  SESSION_RETRY_OUTPUT_TOKENS,
  sessionResponseFailureMessage,
} from '../../../lib/sessionResponsePolicy.mjs';

export const config = { maxDuration: 60 };

function sessionToolForOpenAI(tool) {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
    strict: false,
  };
}

function parseFunctionArguments(args) {
  if (!args) return null;
  if (typeof args === 'object') return args;
  try { return JSON.parse(args); } catch { return null; }
}

function targetSetReps(value) {
  const multiple = String(value || '').match(/^(\d+)\s*[x×]\s*(\d+)/i);
  if (multiple) return Number(multiple[1]) * Number(multiple[2]);
  return parseInt(value, 10) || 0;
}

function autoSaveCommands(record, workspace, playerId, date) {
  const score = parseInt(String(date).replace(/-/g, ''), 10);
  const versionsKey = `${sessionKey(workspace, playerId, date)}:versions`;
  const commands = [
    ['SET', sessionKey(workspace, playerId, date), JSON.stringify(record)],
    ['ZADD', sessionsKey(workspace, playerId), score, date],
    ['LPUSH', versionsKey, JSON.stringify(record)],
    ['LTRIM', versionsKey, '0', '9'],
  ];
  let tonnage = 0;
  for (const block of record.session?.blocks || []) {
    for (const exercise of block.exercises || []) {
      const kg = weightKgFromExercise(exercise);
      const reps = (exercise.targetSets || []).reduce((sum, target) => sum + targetSetReps(target), 0);
      if (kg > 0) {
        const norm = normExName(exercise.name);
        commands.push(['HSET', exweightKey(workspace, playerId, norm), 'kg', String(kg), 'date', date, 'loadUnits', String(loadUnitsForExercise(exercise)), 'source', 'planned']);
        commands.push(['HSET', exhistKey(workspace, playerId, norm), date, String(kg)]);
        tonnage += kg * loadUnitsForExercise(exercise) * reps;
      }
    }
  }
  if (tonnage > 0) {
    commands.push(['SET', gymTonnageKey(workspace, playerId, date), String(Math.round(tonnage))]);
    commands.push(['ZADD', gymTonnageDatesKey(workspace, playerId), score, date]);
  }
  return commands;
}

function findOpenAIFunctionCall(output, name) {
  const stack = Array.isArray(output) ? [...output] : [];
  while (stack.length) {
    const item = stack.shift();
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'function_call' && item.name === name) return item;
    if (Array.isArray(item.content)) stack.push(...item.content);
    if (Array.isArray(item.output)) stack.push(...item.output);
  }
  return null;
}

async function createOpenAIBackgroundResponse(apiKey, userPrompt, systemPrompt, sessionTool, {
  maxOutputTokens = SESSION_OUTPUT_TOKENS,
  reasoningEffort = 'medium',
} = {}) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_SESSION_MODEL,
      instructions: systemPrompt || SYSTEM_PROMPT,
      input: userPrompt,
      max_output_tokens: maxOutputTokens,
      background: true,
      reasoning: { effort: reasoningEffort },
      text: { verbosity: 'low' },
      tools: [sessionToolForOpenAI(sessionTool)],
      tool_choice: { type: 'function', name: 'build_session' },
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return { error: err.error?.message || `OpenAI API error ${response.status}`, status: 502 };
  }
  return { response: await response.json() };
}

async function retrieveOpenAIResponse(apiKey, responseId) {
  const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return { error: err.error?.message || `OpenAI API error ${response.status}`, status: 502 };
  }
  return { response: await response.json() };
}

function parseSessionFromResponse(response) {
  const functionCall = findOpenAIFunctionCall(response?.output, 'build_session');
  return parseFunctionArguments(functionCall?.arguments);
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'OPENAI_API_KEY не настроен в переменных среды Vercel' });
  }

  const { batchId } = req.query || {};
  if (!batchId) return res.status(400).json({ error: 'batchId required' });

  // Resolve the queued record saved at submit time.
  let record;
  try {
    const raw = await redis('get', `coach:batch:${batchId}`);
    if (!raw) return res.status(404).json({ error: 'Batch не найден (истёк или неверный id)' });
    record = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  if (record.status === 'done' && record.session) {
    return res.status(200).json({
      status: 'done',
      session: record.session,
      player: record.player || null,
      dataSummary: record.dataSummary || '',
      date: record.date,
      dayGoal: record.dayGoal || '',
      autoSaved: !!record.autoSaved,
      saveWarning: record.saveWarning || '',
      quality: record.quality || null,
      focus: record.qualityContext?.focus || record.focus || '',
      trainingType: record.qualityContext?.trainingType || record.trainingType || '',
      strengthMode: record.qualityContext?.strengthMode || record.strengthMode || null,
    });
  }
  if (record.status === 'failed') {
    return res.status(422).json({
      status: 'failed',
      error: record.error || 'Тренировка не прошла обязательный контроль качества.',
      quality: record.quality || null,
    });
  }

  // A player can submit a questionnaire after the coach clicks Generate but
  // before the background OpenAI request is actually created. Refresh the
  // complete input exactly at that boundary so the model always receives the
  // newest morning, post-morning and evening records available at generation.
  if (!record.openaiResponseId && record.generationRequest && !record.inputsRefreshedAt) {
    try {
      const refreshed = await buildGenerationInputs(record.generationRequest);
      if (refreshed.error) {
        return res.status(refreshed.status || 400).json({ error: refreshed.error });
      }
      record = {
        ...record,
        date: refreshed.targetDate,
        dayGoal: refreshed.dayGoal || record.dayGoal || '',
        userPrompt: refreshed.userPrompt,
        systemPrompt: refreshed.systemPrompt || SYSTEM_PROMPT,
        dataSummary: refreshed.dataSummary,
        playerRestrictions: refreshed.playerRestrictions || [],
        qualityContext: refreshed.qualityContext || {},
        questionnaireContext: refreshed.questionnaireContext || {},
        inputsRefreshedAt: new Date().toISOString(),
      };
      await redis('set', `coach:batch:${batchId}`, JSON.stringify(record), 'EX', 3600);
    } catch (error) {
      // Do not spend tokens on a prompt whose health/load data could be stale.
      return res.status(503).json({ error: `Не удалось обновить последние анкеты перед генерацией: ${error.message}` });
    }
  }

  const {
    playerId,
    date,
    dayGoal = '',
    workspace = 'zarechie',
    focus = '',
    trainingType = '',
    userPrompt,
    systemPrompt = SYSTEM_PROMPT,
    sessionTool,
    autoSave = true,
    playerRestrictions = [],
    qualityContext = {},
  } = record;
  if (!userPrompt || !sessionTool) {
    return res.status(500).json({ error: 'Неполные данные задачи генерации' });
  }

  try {
    let openaiResponse = null;
    let openaiResponseId = record.openaiResponseId;

    if (!openaiResponseId) {
      const activePrompt = record.activePrompt || userPrompt;
      const created = await createOpenAIBackgroundResponse(apiKey, activePrompt, systemPrompt, sessionTool);
      if (created.error) return res.status(created.status || 502).json({ error: created.error });
      openaiResponse = created.response;
      openaiResponseId = openaiResponse?.id;
      if (!openaiResponseId) return res.status(502).json({ error: 'OpenAI не вернул response id' });

      record = {
        ...record,
        status: 'submitted',
        openaiResponseId,
        openaiStatus: openaiResponse.status || 'queued',
        submittedToOpenAIAt: new Date().toISOString(),
        activePrompt,
        tokenRetryCount: record.tokenRetryCount || 0,
      };
      await redis('set', `coach:batch:${batchId}`, JSON.stringify(record), 'EX', 3600).catch(() => {});
    } else {
      const retrieved = await retrieveOpenAIResponse(apiKey, openaiResponseId);
      if (retrieved.error) return res.status(retrieved.status || 502).json({ error: retrieved.error });
      openaiResponse = retrieved.response;
    }

    if (['queued', 'in_progress'].includes(openaiResponse?.status)) {
      await redis('set', `coach:batch:${batchId}`, JSON.stringify({
        ...record,
        status: 'submitted',
        openaiStatus: openaiResponse.status,
        lastPolledAt: new Date().toISOString(),
      }), 'EX', 3600).catch(() => {});
      return res.status(200).json({ status: 'pending', processing_status: openaiResponse.status });
    }

    if (openaiResponse?.status !== 'completed') {
      if (isOutputTokenLimit(openaiResponse) && Number(record.tokenRetryCount || 0) < 1) {
        const activePrompt = record.activePrompt || userPrompt;
        const retried = await createOpenAIBackgroundResponse(apiKey, activePrompt, systemPrompt, sessionTool, {
          maxOutputTokens: SESSION_RETRY_OUTPUT_TOKENS,
          reasoningEffort: 'low',
        });
        if (retried.error) return res.status(retried.status || 502).json({ error: retried.error });
        const retryResponseId = retried.response?.id;
        if (!retryResponseId) return res.status(502).json({ error: 'Сервис не вернул идентификатор повторной генерации' });
        await redis('set', `coach:batch:${batchId}`, JSON.stringify({
          ...record,
          status: 'submitted',
          openaiResponseId: retryResponseId,
          openaiStatus: retried.response.status || 'queued',
          activePrompt,
          tokenRetryCount: Number(record.tokenRetryCount || 0) + 1,
          tokenRetryStartedAt: new Date().toISOString(),
        }), 'EX', 3600).catch(() => {});
        return res.status(200).json({ status: 'pending', processing_status: 'token_limit_retry' });
      }
      const failureMessage = sessionResponseFailureMessage(openaiResponse);
      await redis('set', `coach:batch:${batchId}`, JSON.stringify({
        ...record,
        status: 'failed',
        error: failureMessage,
        completedAt: new Date().toISOString(),
      }), 'EX', 3600).catch(() => {});
      return res.status(502).json({ status: 'failed', error: failureMessage });
    }

    let session = parseSessionFromResponse(openaiResponse);
    if (!session) {
      return res.status(502).json({ error: 'Модель не вернула структурированную тренировку' });
    }
    session = normalizeExerciseLanguage(session, focus);
    session = sanitizeUnavailableEquipmentExercises(session);
    session = normalizeSessionTempoDescriptions(session);

    let quality = assessSessionQuality(session, {
      ...qualityContext,
      focus: qualityContext.focus || focus,
      trainingType: qualityContext.trainingType || trainingType,
      playerRestrictions,
    });

    // The strength methodology gets one automatic repair attempt. If the
    // deterministic structure/dose audit still fails after that attempt, the
    // original or corrected candidate is returned with a specific warning and
    // remains available for an explicit manual save.
    if (quality.strength && !quality.valid && !record.correctionAttempted) {
      const correctionPrompt = qualityCorrectionPrompt(userPrompt, session, quality);
      const corrected = await createOpenAIBackgroundResponse(apiKey, correctionPrompt, systemPrompt, sessionTool, {
        maxOutputTokens: SESSION_RETRY_OUTPUT_TOKENS,
        reasoningEffort: 'low',
      });
      if (!corrected.error && corrected.response?.id) {
        await redis('set', `coach:batch:${batchId}`, JSON.stringify({
          ...record,
          status: 'submitted',
          openaiResponseId: corrected.response.id,
          openaiStatus: corrected.response.status || 'queued',
          activePrompt: correctionPrompt,
          correctionAttempted: true,
          candidateSession: session,
          candidateQuality: quality,
          tokenRetryCount: 0,
          correctionStartedAt: new Date().toISOString(),
        }), 'EX', 3600).catch(() => {});
        return res.status(200).json({ status: 'pending', processing_status: 'quality_correction' });
      }
    }

    // Compare the single repair attempt with its original candidate and keep
    // the better complete version.
    if (record.correctionAttempted && record.candidateSession && record.candidateQuality) {
      const candidateQuality = record.candidateQuality;
      const correctedIsBetter = (quality.valid && !candidateQuality.valid)
        || (quality.valid === candidateQuality.valid && quality.score > candidateQuality.score)
        || (quality.score === candidateQuality.score && quality.valid && !candidateQuality.valid);
      if (!correctedIsBetter) {
        session = record.candidateSession;
        quality = candidateQuality;
      }
    }

    // Re-sanitize compatibility candidates from older deployments too.
    session = sanitizeUnavailableEquipmentExercises(session);
    session = normalizeSessionTempoDescriptions(session);
    quality = advisorySessionQuality(assessSessionQuality(session, {
      ...qualityContext,
      focus: qualityContext.focus || focus,
      trainingType: qualityContext.trainingType || trainingType,
      playerRestrictions,
    }));

    const snapshot = await getPlayerSnapshot(String(playerId), 7, date, 7, workspace).catch(() => null);
    const player = snapshot?.player || null;
    const dataSummary = record.dataSummary || '';

    const record2 = {
      session,
      player,
      dataSummary,
      dayGoal: dayGoal || '',
      focus: qualityContext.focus || focus || '',
      trainingType: qualityContext.trainingType || trainingType || '',
      strengthMode: qualityContext.strengthMode || null,
      quality,
      date,
      savedAt: new Date().toISOString(),
    };
    let autoSaved = false;
    let saveWarning = '';
    const manualSaveRequired = quality.seasonDecision?.primer?.manualSaveRequired === true;
    if (autoSave && !quality.blocking && !quality.medicalReviewRequired && !manualSaveRequired) {
      try {
        await redisPipeline(autoSaveCommands(record2, workspace, playerId, date));
        autoSaved = true;
      } catch (error) {
        // The generated result remains recoverable from the batch and is sent
        // to the UI even if persistence has a temporary outage.
        saveWarning = 'Тренировка создана, но автосохранение временно недоступно. Нажмите «Сохранить» ещё раз.';
        console.error('Redis save session failed:', error.message);
      }
    } else if (autoSave && (quality.blocking || quality.medicalReviewRequired || manualSaveRequired)) {
      saveWarning = manualSaveRequired
        ? 'Игровой праймер не автосохранён: откройте игрока, визуально проверьте программу и сохраните вручную.'
        : quality.blocking
        ? quality.reviewMessage || 'Тренировка не автосохранена: нарушен лимит безопасности.'
        : quality.medicalReviewReason;
    }

    await redis('set', `coach:batch:${batchId}`, JSON.stringify({
      ...record,
      status: 'done',
      session,
      player,
      dataSummary,
      quality,
      autoSaved,
      saveWarning,
      completedAt: new Date().toISOString(),
    }), 'EX', 3600).catch(() => {});

    return res.status(200).json({
      status: 'done',
      session,
      player,
      dataSummary,
      date,
      dayGoal,
      autoSaved,
      saveWarning,
      quality,
      focus: qualityContext.focus || focus || '',
      trainingType: qualityContext.trainingType || trainingType || '',
      strengthMode: qualityContext.strengthMode || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
