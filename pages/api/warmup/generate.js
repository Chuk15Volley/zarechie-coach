// pages/api/warmup/generate.js
// POST { date }. The warm-up type is resolved from the match calendar and the
// saved S&C session instead of camp phase or weekday assumptions.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { sanitizeUnavailableEquipmentExercises } from '../../../lib/equipmentRestrictions.mjs';
import { pfx, scheduleKey } from '../../../lib/workspacePrefix';
import { formatSeasonDecisionForPrompt, resolveSeasonSession } from '../../../lib/seasonPolicy.mjs';

const FOCUS_LABELS = {
  anterior: 'передняя цепь',
  posterior: 'задняя цепь',
  fullbody: 'всё тело',
  general: 'общая нагрузка',
};

const OPENAI_WARMUP_MODEL = 'gpt-5.6-terra';

const TEAM_WARMUP_TOOL = {
  name: 'build_team_warmup',
  description: 'Командная S&C-разминка перед вечерней волейбольной тренировкой.',
  input_schema: {
    type: 'object',
    required: ['date', 'phase', 'morningFocus', 'sections'],
    properties: {
      date: { type: 'string' },
      phase: { type: 'string' },
      morningFocus: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'label', 'color', 'exercises'],
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            color: { type: 'string' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'nameEn', 'reps', 'note'],
                properties: {
                  name: { type: 'string' },
                  nameEn: { type: 'string' },
                  reps: { type: 'string' },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};

function toolForOpenAI(tool) {
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

// Pull exercise names from blocks A/B/C of a saved session record for prompt context.
function extractMorningContext(record) {
  try {
    const session = record?.session;
    if (!session) return '';
    const names = [];
    const collect = (val) => {
      if (!val) return;
      if (Array.isArray(val)) { val.forEach(collect); return; }
      if (typeof val === 'object') {
        if (typeof val.name === 'string') names.push(val.name);
        else Object.values(val).forEach(collect);
      }
    };
    // Look for blocks A/B/C regardless of exact shape.
    const blocks = session.blocks || session;
    ['A', 'B', 'C', 'a', 'b', 'c'].forEach((k) => {
      if (blocks && blocks[k]) collect(blocks[k]);
    });
    if (!names.length) collect(session);
    return [...new Set(names)].slice(0, 12).join(', ');
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, workspace = 'zarechie' } = req.body || {};
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }
  // Try to find a saved session of any player for this date, for prompt context.
  let morningExercisesContext = 'данные о конкретных упражнениях недоступны';
  let savedFocus = 'inseason_strength';
  let savedTrainingType = 'full_body';
  try {
    const keys = await redis('keys', `${pfx(workspace)}:session:*:${date}`);
    if (Array.isArray(keys) && keys.length) {
      const raw = await redis('get', keys[0]);
      if (raw) {
        const record = JSON.parse(raw);
        const ctx = extractMorningContext(record);
        if (ctx) morningExercisesContext = ctx;
        savedFocus = record.focus || savedFocus;
        savedTrainingType = record.trainingType || savedTrainingType;
      }
    }
  } catch {
    // Non-fatal — proceed without context.
  }

  const rawSchedule = await redis('get', scheduleKey(workspace)).catch(() => null);
  let events = [];
  try { events = rawSchedule ? JSON.parse(rawSchedule) : []; } catch { events = []; }
  const decision = resolveSeasonSession({
    events,
    targetDate: date,
    requestedFocus: savedFocus,
    requestedTrainingType: savedTrainingType,
    previousMatchLoad: { status: 'unknown' },
  });
  const morningFocus = savedTrainingType === 'posterior_chain' ? 'posterior'
    : savedTrainingType === 'anterior_chain' ? 'anterior'
      : savedTrainingType === 'full_body' ? 'fullbody' : 'general';
  const morningFocusLabel = FOCUS_LABELS[morningFocus] || FOCUS_LABELS.general;
  const protectedDay = ['md_plus_1', 'travel_day'].includes(decision.key);

  const prompt = `Ты — элитный S&C тренер. Составь командную разминку перед вечерней волейбольной тренировкой.

КОНТЕКСТ:
- Силовая сессия в этот день: ${morningFocusLabel} (${morningExercisesContext})
- Решение сезонного микроцикла: ${decision.label}. ${decision.reason}
- Длительность: ${protectedDay ? '12-18' : '15-22'} минут
- Формат: только работа с телом / S&C, БЕЗ волейбольной технической работы

${formatSeasonDecisionForPrompt(decision)}

СТРУКТУРА (строго 4 блока):
1. RAISE / ТЕМПЕРАТУРА — 2-3 динамичных движения. Foam rolling только точечно, 0-2 зоны, если есть дефицит.
2. МОБИЛЬНОСТЬ — 3-4 движения по реальным ограничениям, без длительной пассивной растяжки.
3. АКТИВАЦИЯ — 3-5 движений: стопа/колено/таз, кор, лопатка/ротаторы.
4. PRIMER — ${protectedDay ? 'без прыжков: лёгкая координация, кровоток и дыхание' : 'короткая скоростная подготовка; на MD-1 не более 4-8 прыжковых контактов'}.

ПРАВИЛА:
- Формат повторений, НЕ время (например: "8 повт./ногу", "10 пассов", "3×6")
- Поле "name": РУССКОЕ стандартное название упражнения из библиотеки, чтобы к нему автоматически нашлось видео. Используй короткие точные формулировки, без пояснений через тире. Примеры: "МФР квадрицепса", "90-90 смена (упор руками)", "Ягодичный мост – марши", "Ротация грудного на четвереньках", "Боковые шаги с мини-лентой", "А-марши на месте".
- Поле "nameEn": профессиональный S&C английский (для поиска видео на YouTube). Примеры: "Quad Roll Foam Roller", "Hip 90/90 Rotation", "Glute Bridge March"
- note к каждому упражнению: краткая подсказка на русском (1-2 предложения)
- Не дублируй утренний S&C-объём. Разминка должна повысить готовность, а не создать вторую тренировку.

ОТВЕТ — только JSON без markdown:
{"date":"${date}","phase":"${decision.key}","morningFocus":"${morningFocus}","sections":[{"id":"raise","label":"Raise / температура","color":"violet","exercises":[{"name":"...","nameEn":"...","reps":"...","note":"..."}]},{"id":"mobility","label":"Мобильность","color":"sky","exercises":[]},{"id":"activation","label":"Активация","color":"amber","exercises":[]},{"id":"primer","label":"Primer","color":"cyan","exercises":[]}]}`;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен' });

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_WARMUP_MODEL,
        input: prompt,
        max_output_tokens: 3000,
        store: false,
        tools: [toolForOpenAI(TEAM_WARMUP_TOOL)],
        tool_choice: { type: 'function', name: 'build_team_warmup' },
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `API error ${r.status}` });
    }

    const data = await r.json();
    const toolCall = findOpenAIFunctionCall(data.output, 'build_team_warmup');
    const plan = sanitizeUnavailableEquipmentExercises(parseFunctionArguments(toolCall?.arguments));
    if (!plan) return res.status(502).json({ error: 'Модель не вернула структуру разминки' });

    // Ensure core fields are consistent with the request.
    plan.date = date;
    plan.phase = decision.key;
    plan.morningFocus = morningFocus;
    if (protectedDay) {
      const jumpPattern = /jump|pogo|hop|bound|прыж|плиом/i;
      plan.sections = (plan.sections || []).map(section => ({
        ...section,
        exercises: (section.exercises || []).filter(exercise => !jumpPattern.test(`${exercise.name || ''} ${exercise.nameEn || ''}`)),
      }));
    }

    await Promise.all([
      redis('set', `${pfx(workspace)}:warmup:${date}`, JSON.stringify(plan)),
      redis('sadd', `${pfx(workspace)}:warmup:index`, date),
    ]);

    return res.status(200).json({ plan });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
