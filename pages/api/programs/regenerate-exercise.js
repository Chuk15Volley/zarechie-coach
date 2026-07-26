// pages/api/programs/regenerate-exercise.js
// POST { playerId, date, blockIndex, exerciseIndex, session? }
// Replaces one exercise with a fresh AI-generated alternative. A current unsaved
// session may be supplied so the coach can use this control before first save.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { sessionKey } from '../../../lib/workspacePrefix';
import { normalizeExerciseLanguage } from './generate';

const BANNED =
  'Присед со штангой на спине (Back Squat) | Жим штанги лёжа (Bench Press barbell) | Nordic Curl | Ab Wheel Rollout / Ab Roller | Broad Jump | DB Floor Press | Incline Push-Up / наклонные отжимания | Band Wrist Stability | Jump Set Drill | KB Press / жим с гирями | Tricep Pushdown с резиновой петлёй / Band Tricep Pushdown';

const OPENAI_MODEL = 'gpt-5.5';

function extractText(data) {
  if (data?.output_text) return data.output_text;
  const chunks = [];
  const stack = Array.isArray(data?.output) ? [...data.output] : [];
  while (stack.length) {
    const item = stack.shift();
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'output_text' && item.text) chunks.push(item.text);
    if (item.type === 'text' && item.text) chunks.push(item.text);
    if (Array.isArray(item.content)) stack.push(...item.content);
    if (Array.isArray(item.output)) stack.push(...item.output);
  }
  return chunks.join('').trim();
}

function parseFunctionArguments(args) {
  if (!args) return null;
  if (typeof args === 'object') return args;
  try { return JSON.parse(args); } catch { return null; }
}

function findFunctionCall(output, name) {
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

const REPLACE_EXERCISE_TOOL = {
  type: 'function',
  name: 'replace_exercise',
  description: 'Возвращает одну безопасную и профессиональную замену упражнения в волейбольной S&C программе.',
  strict: false,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'targetSets', 'weightNote', 'weightKg', 'loadUnits', 'tempo', 'cue', 'autoReg'],
    properties: {
      name: {
        type: 'string',
        description: 'Название упражнения на профессиональном английском языке S&C.',
      },
      targetSets: {
        type: 'array',
        description: 'Повторения по каждому подходу, например ["5", "5", "5"].',
        items: { type: 'string' },
      },
      weightNote: {
        type: 'string',
        description: 'Короткое назначение рабочего веса или веса тела на русском языке.',
      },
      weightKg: {
        anyOf: [{ type: 'number' }, { type: 'null' }],
        description: 'Рабочий вес. Для DB/KB это вес одного снаряда.',
      },
      loadUnits: {
        type: 'integer',
        enum: [1, 2],
        description: 'Количество одинаковых гантелей или гирь: 1 или 2.',
      },
      tempo: {
        type: 'string',
        description: 'Сохрани исходный темп упражнения.',
      },
      cue: {
        type: 'string',
        description: 'Одна короткая техническая подсказка на русском языке, начиная с описания темпа.',
      },
      autoReg: {
        type: 'string',
        description: 'Один критерий снижения нагрузки или остановки на русском языке. Пустая строка, если не нужен.',
      },
    },
  },
};

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { playerId, date, blockIndex, exerciseIndex, session: requestedSession, workspace = 'zarechie' } = req.body || {};
  if (!playerId || !date || blockIndex == null || exerciseIndex == null) {
    return res.status(400).json({ error: 'playerId, date, blockIndex, exerciseIndex required' });
  }

  // Load saved session
  const raw = await redis('get', sessionKey(workspace, playerId, date)).catch(() => null);
  if (!raw && !requestedSession?.blocks) return res.status(404).json({ error: 'Программа не найдена' });

  let record = null;
  if (raw) {
    try { record = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { return res.status(500).json({ error: 'Ошибка чтения сессии' }); }
  }

  // Prefer the current coach-edited draft. If it has already been saved, the same
  // edited session is persisted below after the replacement is ready.
  const session = requestedSession?.blocks ? requestedSession : (record?.session ?? record);

  const block = session.blocks?.[blockIndex];
  if (!block) return res.status(400).json({ error: 'Блок не найден' });

  const exercise = block.exercises?.[exerciseIndex];
  if (!exercise) return res.status(400).json({ error: 'Упражнение не найдено' });

  // All other exercises (for dedup)
  const others = (session.blocks || [])
    .flatMap((b, bi) =>
      (b.exercises || []).map((ex, ei) => ({ name: ex.name, skip: bi === blockIndex && ei === exerciseIndex }))
    )
    .filter(e => !e.skip)
    .map(e => e.name)
    .join(', ');

  const blockLabel = block.label || block.code || `Блок ${blockIndex + 1}`;
  const dayGoal = record.dayGoal || session.dayGoal || '—';

  const prompt = `Ты — элитный тренер по силовой подготовке волейболистов. Замени одно упражнение в тренировочной программе на другой вариант.

ПРОГРАММА:
Цель дня: ${dayGoal}
${(session.blocks || []).map((b, i) => `Блок ${i + 1} (${b.label || b.code || ''}): ${(b.exercises || []).map(e => e.name).join(', ')}`).join('\n')}

ЗАМЕНИТЬ:
Блок "${blockLabel}", позиция ${exerciseIndex + 1}: "${exercise.name}"
Тренер хочет другой вариант этого упражнения.

ПРАВИЛА:
• Новое упражнение должно быть из той же категории и вектора нагрузки (блок: ${blockLabel})
• НЕЛЬЗЯ вернуть исходное упражнение "${exercise.name}" даже в другой записи названия
• Сохрани: code="${exercise.code}", tempo="${exercise.tempo || ''}"
• НЕ используй упражнения, уже стоящие в программе: ${others}
• ЗАПРЕЩЕНО навсегда: ${BANNED}
• ЯЗЫК: поле name — профессиональный английский S&C ("Bulgarian Split Squat", "Trap Bar Deadlift", "Box Jump (Bilateral)"). Поле cue — короткое описание для игрока на русском языке: СНАЧАЛА описание темпа, ПОТОМ одна профессиональная подсказка S&C. Если tempo="5-0-X-0", начни cue так: "Темп: опускаемся 5 секунд медленно вниз, вверх максимально резко." Если tempo="0-5сек-X-0", начни cue так: "Темп: пауза в напряжении 5 секунд, вверх максимально резко." Поле autoReg — один критерий остановки, РУССКИЙ язык ("Скорость падает → стоп.", "RPE 9 → снизь 5%.").

Сохрани targetSets, если замена не требует более безопасного объёма. Для DB/KB weightKg всегда означает вес ОДНОЙ гантели/гири; loadUnits: 1 для одного снаряда, 2 для пары. Для упражнения с внешним весом укажи практичный weightKg и weightNote. Для веса тела оставь weightKg=null и укажи понятный weightNote.

Верни замену только через инструмент replace_exercise. Не добавляй текстовый ответ.`;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен' });

  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: 'Ты точно следуешь требованиям тренера. Возвращай результат только через вызов указанного инструмента.',
        input: prompt,
        max_output_tokens: 700,
        store: false,
        tools: [REPLACE_EXERCISE_TOOL],
        tool_choice: { type: 'function', name: 'replace_exercise' },
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.error('Exercise replacement OpenAI error', r.status, err.error?.message || err);
      return res.status(502).json({ error: 'Сервис генерации временно недоступен. Повторите замену через несколько секунд.' });
    }

    const msg = await r.json();
    const functionCall = findFunctionCall(msg.output, 'replace_exercise');
    let parsedExercise = parseFunctionArguments(functionCall?.arguments);

    // Older OpenAI responses may still contain JSON text. Keep this fallback so a
    // transient provider format change never makes the coach's control unusable.
    if (!parsedExercise) {
      const text = extractText(msg);
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsedExercise = JSON.parse(match[0]); } catch (_) {}
      }
    }
    if (!parsedExercise || typeof parsedExercise !== 'object') {
      console.error('Exercise replacement returned no usable tool result', { responseId: msg?.id });
      return res.status(502).json({ error: 'Сервис не вернул корректную замену. Нажмите «Заменить» ещё раз.' });
    }
    const normalized = normalizeExerciseLanguage({ blocks: [{ exercises: [parsedExercise] }] }, '');
    const newExercise = normalized.blocks?.[0]?.exercises?.[0] || parsedExercise;
    if (!newExercise?.name || String(newExercise.name).trim().toLowerCase() === String(exercise.name || '').trim().toLowerCase()) {
      return res.status(502).json({ error: 'Сервис вернул исходное упражнение. Нажмите «Заменить» ещё раз.' });
    }
    newExercise.code = exercise.code;
    newExercise.tempo = newExercise.tempo || exercise.tempo || '';
    newExercise.targetSets = Array.isArray(newExercise.targetSets) && newExercise.targetSets.length
      ? newExercise.targetSets
      : (exercise.targetSets || []);

    // Persist only when a saved session exists. Draft programs are updated in the UI
    // and will be stored by the normal Save command.
    session.blocks[blockIndex].exercises[exerciseIndex] = newExercise;
    if (record) {
      const toSave = record.session ? { ...record, session } : session;
      await redis('set', sessionKey(workspace, playerId, date), JSON.stringify(toSave));
    }

    return res.status(200).json({ exercise: newExercise });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
