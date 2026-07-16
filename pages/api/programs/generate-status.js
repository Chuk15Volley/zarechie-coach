// pages/api/programs/generate-status.js
// GET ?batchId=xxx -> polls a queued OpenAI background Responses API session.
// While processing: { status: 'pending', processing_status }.
// When done: extracts the build_session function call, optionally persists the session to
// Redis, and returns { status: 'done', session, player, dataSummary, date, dayGoal }.

import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';
import { getPlayerSnapshot } from '../../../lib/playerData';
import { sessionKey, sessionsKey } from '../../../lib/workspacePrefix';
import { SYSTEM_PROMPT, normalizeExerciseLanguage } from './generate';

export const config = { maxDuration: 60 };

const OPENAI_SESSION_MODEL = 'gpt-5.5';

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

async function createOpenAIBackgroundResponse(apiKey, userPrompt, sessionTool) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_SESSION_MODEL,
      instructions: SYSTEM_PROMPT,
      input: userPrompt,
      max_output_tokens: 6500,
      background: true,
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

function responseFailureMessage(response) {
  return response?.error?.message
    || response?.incomplete_details?.reason
    || response?.last_error?.message
    || `OpenAI response ended with status ${response?.status || 'unknown'}`;
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
    });
  }

  const { playerId, date, dayGoal = '', workspace = 'zarechie', focus = '', userPrompt, sessionTool, autoSave = true } = record;
  if (!userPrompt || !sessionTool) {
    return res.status(500).json({ error: 'Неполные данные задачи генерации' });
  }

  try {
    let openaiResponse = null;
    let openaiResponseId = record.openaiResponseId;

    if (!openaiResponseId) {
      const created = await createOpenAIBackgroundResponse(apiKey, userPrompt, sessionTool);
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
      return res.status(502).json({ error: responseFailureMessage(openaiResponse) });
    }

    let session = parseSessionFromResponse(openaiResponse);
    if (!session) {
      return res.status(502).json({ error: 'Модель не вернула структурированную тренировку' });
    }
    session = normalizeExerciseLanguage(session, focus);

    const snapshot = await getPlayerSnapshot(String(playerId), 7, date, 7, workspace).catch(() => null);
    const player = snapshot?.player || null;
    const dataSummary = record.dataSummary || '';

    const record2 = {
      session,
      player,
      dataSummary,
      dayGoal: dayGoal || '',
      date,
      savedAt: new Date().toISOString(),
    };
    if (autoSave) {
      const dateScore = parseInt(String(date).replace(/-/g, ''), 10);
      await Promise.all([
        redis('set', sessionKey(workspace, playerId, date), JSON.stringify(record2)),
        redis('zadd', sessionsKey(workspace, playerId), dateScore, date),
      ]).catch(e => console.error('Redis save session failed:', e.message));
    }

    await redis('set', `coach:batch:${batchId}`, JSON.stringify({
      ...record,
      status: 'done',
      session,
      player,
      dataSummary,
      autoSaved: !!autoSave,
      completedAt: new Date().toISOString(),
    }), 'EX', 3600).catch(() => {});

    return res.status(200).json({
      status: 'done',
      session,
      player,
      dataSummary,
      date,
      dayGoal,
      autoSaved: !!autoSave,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
