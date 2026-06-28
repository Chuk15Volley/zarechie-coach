// pages/api/programs/generate.js
// POST { playerId, date, dayGoal, focus, notes, days=7 } → AI-generated gym session for one
// specific day. Claude receives: player bio-metrics for the target date, a trend window,
// AND a compact history of the player's last 10 saved sessions — enabling real periodization
// logic (load distribution, movement pattern rotation, DUP, no same-vector repetition).

import { getPlayerSnapshot, todayISO } from '../../../lib/playerData';
import { getRecentSessionSummaries } from '../../../lib/sessionHistory';
import { isAuthorized } from '../../../lib/auth';
import { redis, redisPipeline } from '../../../lib/redis';
import { restrictionsToPrompt } from '../../../lib/exerciseRestrictions';

const FOCUS_LABELS = {
  // ── СБОРЫ ЗАРЕЧЬЕ 2025 (13 июля – 26 августа) ─────────────────────────────
  camp_ecc_anterior:  'СБОРЫ · ЭКСЦЕНТРИКА · Передняя цепь — ПОНЕДЕЛЬНИК нед.1-3; квадрицепс, жим, сгибатель бедра; темп 5-0-X-0; прогрессия: нед.1=3×75-78%, нед.2=4×80-83%, нед.3=4×83-87%; вечером ЛИНЕЙНАЯ СКОРОСТЬ — не доводи квадрицепс и сгибатели бедра до отказа',
  camp_ecc_posterior: 'СБОРЫ · ЭКСЦЕНТРИКА · Задняя цепь — ВТОРНИК нед.1-3; бицепс бедра, ягодицы, верхняя тяга; темп 5-0-X-0; прогрессия: нед.1=3×75-78%, нед.2=4×80-83%, нед.3=4×83-87%; вечером СМЕНА НАПРАВЛЕНИЯ — защищай колени, не доводи заднюю цепь до отказа',
  camp_ecc_fullbody:  'СБОРЫ · ЭКСЦЕНТРИКА · Всё тело — ПЯТНИЦА нед.1-3; ЛУЧШАЯ СЕССИЯ НЕДЕЛИ после выходного в четверг; интеграция обеих цепей, наивысшее нейромышечное качество; темп 5-0-X-0; прогрессия: нед.1=3×75-78%, нед.2=4×80-83%, нед.3=4×83-87%; никаких вечерних кондиций',
  camp_iso_anterior:  'СБОРЫ · ИЗОМЕТРИКА · Передняя цепь — ПН+ПТ нед.4-5; изо-удержание 30-45 сек в угле 60-90° колено → 10-15 сек отдых → 3-4 взрывных повт.; прогрессия: нед.4=3 сета×30 сек, нед.5=4 сета×40-45 сек; вечером ВОЛЕЙБОЛ С ПРЫЖКАМИ — проверяй JLU из дашборда, если >200 прыжков — плиометрику Блока A снизить 50%',
  camp_iso_posterior: 'СБОРЫ · ИЗОМЕТРИКА · Задняя цепь — ВТ+СБ нед.4-5; изо-удержание 30-45 сек в угле 45° бедро → 10-15 сек отдых → 3-4 взрывных повт.; прогрессия: нед.4=3 сета×30 сек, нед.5=4 сета×40-45 сек; вечером ВОЛЕЙБОЛ С ПРЫЖКАМИ — проверяй JLU из дашборда',
  camp_explosive:     'СБОРЫ · ВЗРЫВ / ПОТЕНЦИАЦИЯ — НЕДЕЛЯ 6 тейпер; нагрузка 50-60% 1ПМ максимальная скорость; объём -40-50% от пиковых недель; 60 мин СТРОГО; ЗАПРЕЩЕНО: медленная эксцентрика и изо-удержания; цель — нейронная активация ЦНС перед первой игрой 26 августа',
  // ── СЕЗОН ЗВС ────────────────────────────────────────────────────────────
  zvs_strength_day:   'ЗВС Сезон: Силовой день (3+ дней до игры) — 55-65 мин, накопление, PAP-пары 80-85%, JLU ≤120; блоки B/D адаптированы под позицию',
  zvs_power_day:      'ЗВС Сезон: Мощностной день (1-2 дня до игры) — 30-40 мин MAX, нейронная активация 85-90%, JLU ≤80; никакой накопительной усталости; сокращённый E-блок',
  zvs_recovery:       'ЗВС Сезон: Восстановление (день после игры) — 30-40 мин, JLU=0, мобильность+тканевая работа+лёгкая изометрия; расширенный E-блок всех 4 зон',
  zvs_deload:         'ЗВС Сезон: Деload неделя (каждые 6 недель) — объём -50%, паттерны сохранены, JLU ≤100; E-блок профилактики не сокращается',
  // ── МЕЖСЕЗОНЬЕ ───────────────────────────────────────────────────────────
  zvs_struct:         'Межсезонье: Структурная подготовка — суставная подготовка, механика приземления, изометрия сухожилий, аэробная база; RPE 5-6; JLU ≤200',
  zvs_strength_base:  'Межсезонье: Силовая база — двусторонние паттерны под нагрузкой, первые PAP-пары 75-80%; RPE 7-8; JLU ≤350',
  zvs_power_transfer: 'Межсезонье: Мощность и перенос — полные PAP-кластеры 80-87.5%, Resisted Approach Jump, позиционная работа; тейпер последняя неделя; RPE 8-9; JLU ≤500',
  // ── БАЗОВЫЕ ──────────────────────────────────────────────────────────────
  preseason:       'предсезонная подготовка — база силы и объёма',
  inseason:        'игровой период — поддержание формы, минимизация утомления',
  power:           'развитие взрывной силы и прыжка',
  strength:        'максимальная силовая база',
  rehab:           'возврат после травмы / разгрузка',
};

// SESSION_TOOL factory. Pass includeImgPrompt=true to add the img_prompt field back into
// each exercise (used by the async Sonnet generator, where token budget is not a concern).
export function buildSessionTool({ includeImgPrompt = false } = {}) {
  const exerciseProps = {
    code: { type: 'string', description: 'A1, A2, A3...' },
    name: { type: 'string', description: 'Exercise name in professional S&C English — the exact terminology used by elite strength coaches. Use standard nomenclature: modifier + equipment + movement pattern + bilateral/unilateral qualifier. Examples: "Trap Bar Romanian Deadlift", "Goblet Squat (KB)", "Bulgarian Split Squat", "Single-Leg Hip Thrust (DB)", "Copenhagen Adductor Plank", "Pallof Press (Band)", "Dead Bug", "Bird-Dog", "Slider Hamstring Curl", "Box Jump (Bilateral)", "Countermovement Jump (CMJ)", "Plyo Push-Up", "Inverted Row (TRX)", "Landmine Press", "DB Incline Press", "KB Swing (Two-Hand)", "MB Rotational Throw", "Turkish Get-Up (KB)", "Spanish Squat ISO (Band)", "SL Eccentric Step-Down", "Y-T-W (Band)", "Band Pull-Apart", "Face Pull (Band)", "RKC Plank", "Hollow Body Hold", "Suitcase Carry (DB)". Never use Russian transliterations. Never invent non-standard names.' },
    targetSets: {
      type: 'array',
      description: 'Целевые повторения по подходам, например ["5","5","5"] или ["8","8","8","8"]. 3–5 элементов.',
      items: { type: 'string' },
    },
    weightNote: {
      type: 'string',
      description: 'Нагрузка на профессиональном языке S&C: %1ПМ с точными кг, RPE-цель. Если есть история — прогрессия: "83% 1ПМ = 108 кг (↑ с 104 кг)". Без объяснений — только цифры и цель.',
    },
    tempo: {
      type: 'string',
      description: 'Темп: Эксц-Пауза_низ-Конц-Пауза_верх. X = максимально быстро. Силовой тяжёлый: "3-1-X-0". Гипертрофия: "3-0-2-0". Взрывной/прыжок: "реактивный". Изометрия: "2-30сек-2-0". Профилактика: "контролируемый".',
    },
    autoReg: {
      type: 'string',
      description: 'Правило авторегуляции — СТРОГО 1 критерий остановки или снижения нагрузки. Только для основных силовых (A1, B1, C1). Русский язык. Без объяснений — только факт и действие. Примеры: "Скорость штанги падает → заканчивай подход.", "Потеря нейтрали поясницы → стоп.", "RPE достигает 9 → снизь нагрузку 5%.", "Отрыв пятки → прекрати повтор."',
    },
    cue: {
      type: 'string',
      description: 'ОДНА техническая подсказка, максимум 12 слов, на русском языке. Профессиональный язык тренера S&C: конкретный угол сустава, паттерн движения или точка активации. Императивно. Без "потому что", без "старайся", без воды. Примеры: "Колено над вторым пальцем — не заваливай внутрь.", "Нейтраль таза до старта.", "Тяни штангу к бедру — не к животу.", "Лопатки вниз до старта тяги.", "Шарнир в бедре — позвоночник нейтрален.", "Мягкое приземление — гасишь через бедро."',
    },
  };
  const exerciseRequired = ['code', 'name', 'targetSets', 'tempo', 'cue'];

  if (includeImgPrompt) {
    exerciseProps.img_prompt = {
      type: 'string',
      description: 'English anatomical description for exercise illustration (20-35 words): body position, joint angles with degrees, equipment, movement phase. Be precise.',
    };
    exerciseRequired.push('img_prompt');
  }

  return {
    name: 'build_session',
    description: 'Структурированная тренировка в зале на один конкретный день, разбитая на блоки (круги/суперсеты).',
    input_schema: {
      type: 'object',
      required: ['blocks', 'assessment', 'periodization_note', 'warnings'],
      properties: {
        assessment: {
          type: 'string',
          description: 'Краткая оценка состояния игрока на сегодня. СТРОГО 2 предложения, не больше. Укажи, если каких-то данных нет.',
        },
        periodization_note: {
          type: 'string',
          description: 'Логика тренировки относительно истории сессий: что было вчера/позавчера, почему этот вектор/акцент сегодня. СТРОГО 3 предложения, не больше.',
        },
        blocks: {
          type: 'array',
          description: 'Блоки тренировки по порядку. Каждый блок — круг/суперсет из 1–4 упражнений (A1→A2→A3→пауза→повтор круга). Обычно 5 блоков: A, B, C, D, E.',
          items: {
            type: 'object',
            required: ['label', 'rest_note', 'exercises'],
            properties: {
              label: { type: 'string', description: 'Буква блока: A, B, C, D, E' },
              rest_note: {
                type: 'string',
                description: 'Протокол отдыха. PAP-тройка (A/B/C): "10-15 сек X1→X2 (PAP), 90 сек X2→X3, 2-3 мин после тройки". PAP-пара (A): "10-15 сек A1→A2, 3 мин после пары". Прямые подходы: "2-3 мин". Профилактика (E): "30-45 сек между упражнениями".',
              },
              exercises: {
                type: 'array',
                items: {
                  type: 'object',
                  required: exerciseRequired,
                  properties: exerciseProps,
                },
              },
            },
          },
        },
        warnings: {
          type: 'string',
          description: 'Предостережения и акценты тренеру на этой сессии (травмы, усталость, технические моменты).',
        },
      },
    },
  };
}

// Synchronous Haiku generator keeps the token-lean schema (no img_prompt).
const SESSION_TOOL = buildSessionTool({ includeImgPrompt: false });

export function avg(arr) {
  const vals = arr.filter(v => v != null && !Number.isNaN(v));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

export function stdev(arr) {
  const vals = arr.filter(v => v != null && !Number.isNaN(v));
  if (vals.length < 2) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
}

function onDay(arr, date) {
  return arr.find(r => r.date === date) || null;
}

function fmt(field, value, suffix = '') {
  return `• ${field}: ${value != null ? value + suffix : 'нет данных'}`;
}

function summarizeSnapshot(snap) {
  const { player, whoop, surveys, morning, neuro, manual, periodDays, targetDate, chronicWhoop, chronicSurveys, injuryLog, annotations } = snap;

  const todayWhoop = onDay(whoop, targetDate);
  const todayMorning = onDay(morning, targetDate);
  const lastSurvey = [...surveys].filter(d => d.date <= targetDate).pop() || null;
  const recentInjury = [...surveys].filter(d => d.date <= targetDate).reverse().find(d => d.hasInjury) || null;

  const trendRecovery = avg(whoop.map(d => d.recovery));
  const trendHrv = avg(whoop.map(d => d.hrv));
  const trendStrain = avg(whoop.map(d => d.strain));
  const trendSrpe = avg(surveys.map(d => d.srpe));
  const trendFatigue = avg(surveys.map(d => d.fatigue));
  const trendMws = avg(morning.map(d => d.mws));

  // HRV Z-score vs individual baseline
  const hrvBaseline = whoop.filter(d => d.date < targetDate).map(d => d.hrv);
  const hrvZ = (() => {
    const mean = avg(hrvBaseline);
    const sd = stdev(hrvBaseline);
    const today = todayWhoop?.hrv;
    if (mean == null || sd == null || sd === 0 || today == null) return null;
    return Math.round(((today - mean) / sd) * 10) / 10;
  })();

  // RHR trend: rising RHR = accumulated stress
  const rhrValues = whoop.filter(d => d.date <= targetDate).slice(-4).map(d => d.rhr).filter(v => v != null);
  const rhrRising = rhrValues.length >= 3 &&
    rhrValues[rhrValues.length - 1] > rhrValues[rhrValues.length - 2] &&
    rhrValues[rhrValues.length - 2] > rhrValues[rhrValues.length - 3];
  const rhrDelta = rhrValues.length >= 2
    ? rhrValues[rhrValues.length - 1] - avg(whoop.filter(d => d.date < targetDate).map(d => d.rhr).filter(v => v != null))
    : null;

  // Hooper Wellness Index (4-20, lower = better)
  // Components: inverted sleep + stress + DOMS + soreness
  const hooper = (() => {
    const sleep = todayMorning?.sleep;   // 1-5, но для Hooper инвертируем: (6-sleep)
    const stress = todayMorning?.stress; // 1-5 (выше = хуже)
    const doms = todayMorning?.doms;     // 1-5 (выше = хуже)
    const soreness = lastSurvey?.soreness; // 1-5 (выше = хуже)
    const components = [
      sleep != null ? (6 - sleep) : null,
      stress,
      doms,
      soreness,
    ].filter(v => v != null);
    if (components.length < 2) return null;
    return Math.round(components.reduce((a, b) => a + b, 0) * 10) / 10;
  })();

  // Hooper baseline from recent morning data (7-day avg, для сравнения)
  const hoopers7d = morning.filter(d => d.date < targetDate).slice(-7).map(m => {
    const s = surveys.find(sv => sv.date === m.date);
    const c = [
      m.sleep != null ? (6 - m.sleep) : null,
      m.stress,
      m.doms,
      s?.soreness,
    ].filter(v => v != null);
    return c.length >= 2 ? c.reduce((a, b) => a + b, 0) : null;
  }).filter(v => v != null);
  const hooperBaseline = avg(hoopers7d);
  const hooperDelta = (hooper != null && hooperBaseline != null)
    ? Math.round((hooper - hooperBaseline) * 10) / 10
    : null;

  // EWS (Evening Wellness Score) — already computed by dashboard, stored in survey
  const ewsToday = lastSurvey?.ews ?? null;

  // Local date helper (daysBefore lives in playerData.js, not here)
  const _dBefore = (date, n) => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

  // ── ACWR: Acute:Chronic Workload Ratio (sRPE-load) ──────────────
  // Daily load = sRPE × duration (duration from manual if available, else 60 min default)
  // Acute = sum last 7 days; Chronic = sum last 28 days / 4 (weekly average)
  const computeLoad = (surveyArr, manualObj) => {
    const result = {};
    for (const s of surveyArr) {
      if (s.srpe != null) {
        // Prefer the duration the player reported in the evening survey;
        // fall back to manual coach input, then a 60-min default.
        const dur = s.duration ?? manualObj[s.date]?.duration ?? 60;
        result[s.date] = s.srpe * dur;
      }
    }
    return result;
  };

  const loadMap = computeLoad(chronicSurveys || surveys, manual || {});

  const acuteLoad = (() => {
    const cutoff = _dBefore(targetDate, 7);
    return Object.entries(loadMap)
      .filter(([d]) => d > cutoff && d <= targetDate)
      .reduce((s, [, v]) => s + v, 0);
  })();

  const chronicLoad = (() => {
    const cutoff = _dBefore(targetDate, 28);
    const total = Object.entries(loadMap)
      .filter(([d]) => d > cutoff && d <= targetDate)
      .reduce((s, [, v]) => s + v, 0);
    return total / 4; // weekly average from 28-day window
  })();

  const acwr = chronicLoad > 0 ? Math.round((acuteLoad / chronicLoad) * 100) / 100 : null;

  // Foster Monotony and Strain Index (last 7 days)
  const last7Loads = (() => {
    const cutoff = _dBefore(targetDate, 7);
    return Object.entries(loadMap)
      .filter(([d]) => d > cutoff && d <= targetDate)
      .map(([, v]) => v);
  })();
  const monotony = last7Loads.length >= 4
    ? (() => {
        const m = avg(last7Loads);
        const sd = stdev(last7Loads);
        return m != null && sd != null && sd > 0 ? Math.round((m / sd) * 10) / 10 : null;
      })()
    : null;
  const weeklyLoad7 = last7Loads.reduce((s, v) => s + v, 0);
  const strain = monotony != null ? Math.round(weeklyLoad7 * monotony) : null;

  // ── Jump-ACWR ───────────────────────────────────────────────────
  const manualForJumps = manual || {};
  const acuteJumps = (() => {
    const cutoff = _dBefore(targetDate, 7);
    return Object.entries(manualForJumps)
      .filter(([d]) => d > cutoff && d <= targetDate && manualForJumps[d]?.jumps)
      .reduce((s, [, v]) => s + (v.jumps || 0), 0);
  })();
  const chronicJumps = (() => {
    const cutoff = _dBefore(targetDate, 28);
    const total = Object.entries(manualForJumps)
      .filter(([d]) => d > cutoff && d <= targetDate && manualForJumps[d]?.jumps)
      .reduce((s, [, v]) => s + (v.jumps || 0), 0);
    return total / 4;
  })();
  const jumpACWR = chronicJumps > 0 ? Math.round((acuteJumps / chronicJumps) * 100) / 100 : null;

  const lines = [
    `Игрок: ${player.name}, позиция: ${player.position || 'не указана'}`,
    `Дата тренировки: ${targetDate}`,
    '',
    `Состояние на ${targetDate} (точечные данные за этот день):`,
    todayWhoop
      ? [
          fmt('Recovery', todayWhoop.recovery, '%'),
          fmt('ВСР (HRV)', todayWhoop.hrv, ' мс'),
          fmt('Пульс покоя', todayWhoop.rhr, ' уд/мин'),
          fmt('Сон', todayWhoop.sleep_hours, ' ч'),
          fmt('Strain', todayWhoop.strain),
        ].join('\n')
      : '• WHOOP за этот день не записан — ниже только тренд.',
    todayMorning
      ? [
          fmt('MWS (Morning Wellness Score)', todayMorning.mws, '%'),
          fmt('Качество сна', todayMorning.sleep, '/5'),
          fmt('Настроение утром', todayMorning.mood, '/5'),
          fmt('Стресс вне зала', todayMorning.stress, '/5'),
          fmt('Крепатура (DOMS)', todayMorning.doms, '/5'),
          fmt('Готовность к тренировке (самооценка)', todayMorning.readiness, '/5'),
        ].join('\n')
      : '• Утренний чек-ин за этот день не заполнен.',
    lastSurvey
      ? [
          `• Последний вечерний опросник (${lastSurvey.date}):`,
          `  sRPE ${lastSurvey.srpe ?? '—'}/10, усталость ${lastSurvey.fatigue ?? '—'}/5, крепатура ${lastSurvey.soreness ?? '—'}/5`,
          lastSurvey.legFatigue ? `  Усталость ног: ${lastSurvey.legFatigue}/5` : null,
          lastSurvey.shoulderLoad ? `  Нагрузка на плечо: ${lastSurvey.shoulderLoad}/5` : null,
          lastSurvey.tomorrowReadiness ? `  Готовность к след.дню (самооценка): ${lastSurvey.tomorrowReadiness}/5` : null,
          lastSurvey.sessionType ? `  Тип прошлой сессии: ${lastSurvey.sessionType}` : null,
          lastSurvey.painAreas?.length ? `  Зоны боли: ${lastSurvey.painAreas.join(', ')}` : null,
        ].filter(Boolean).join('\n')
      : '• Вечерних опросников в доступном окне нет.',
    recentInjury
      ? `• ⚠ Травма ${recentInjury.date}: область ${(recentInjury.injuryAreas || []).join(', ') || '—'}, боль ${recentInjury.pain_level}/10. ${recentInjury.injuryText || ''}`
      : '• Активных травм не зафиксировано.',
    // Structured injury log from dashboard
    (() => {
      if (!injuryLog?.length) return null;
      const active = injuryLog.filter(r => r.status === 'active' || r.status === 'monitoring');
      if (!active.length) return null;
      const ilines = ['', '⚕️ АКТИВНЫЕ ТРАВМЫ (журнал):'];
      for (const r of active) {
        const rtrStr = r.dateRTR ? ` (RTR: ${r.dateRTR})` : '';
        ilines.push(`• ${r.bodyPart || 'не указано'} — ${r.type || 'травма'}, тяжесть ${r.severity}/5, боль ${r.painLevel ?? '—'}/10, статус: ${r.status}${rtrStr}`);
        if (r.notes) ilines.push(`  Заметки: ${r.notes}`);
      }
      ilines.push('→ ИСКЛЮЧИТЬ нагрузку на поражённые зоны. Расширить E-блок профилактикой смежных областей.');
      return ilines.join('\n');
    })(),
    // Trainer annotations
    (() => {
      if (!annotations) return null;
      // Flatten annotation data to readable text
      const entries = [];
      if (typeof annotations === 'string') {
        entries.push(annotations);
      } else if (typeof annotations === 'object') {
        for (const [key, val] of Object.entries(annotations)) {
          if (val != null && String(val).trim()) {
            entries.push(`${key}: ${String(val).trim()}`);
          }
        }
      }
      if (!entries.length) return null;
      return ['', '📋 Заметки тренера об игроке (аннотации из дашборда):', ...entries.map(e => `• ${e}`)].join('\n');
    })(),
    '',
    `Тренд за предыдущие ${periodDays} дней:`,
    `• Recovery (средн.): ${trendRecovery != null ? trendRecovery + '%' : 'нет данных'}`,
    `• ВСР (средн.): ${trendHrv != null ? trendHrv + ' мс' : 'нет данных'}`,
    `• Strain (средн.): ${trendStrain ?? 'нет данных'}`,
    `• sRPE (средн.): ${trendSrpe != null ? trendSrpe + '/10' : 'нет данных'}`,
    `• Усталость (средн.): ${trendFatigue != null ? trendFatigue + '/5' : 'нет данных'}`,
    `• MWS (средн.): ${trendMws != null ? trendMws + '%' : 'нет данных'}`,

    // HRV Z-score
    hrvZ != null
      ? `• HRV Z-score: ${hrvZ > 0 ? '+' : ''}${hrvZ} (${
          hrvZ <= -1.5 ? '🔴 выраженное подавление ВНС — красный флаг' :
          hrvZ <= -0.5 ? '⚠ ниже индивидуального baseline — осторожность' :
          '✅ в пределах нормы'
        })`
      : null,

    // Тренд RHR
    rhrDelta != null
      ? `• Пульс покоя (тренд): ${rhrDelta > 0 ? '+' : ''}${Math.round(rhrDelta)} уд/мин от baseline${rhrRising ? ' ↗ растёт 3 дня — маркер накопленного стресса' : ''}`
      : null,

    // Hooper
    hooper != null
      ? `• Hooper Wellness Index: ${hooper}/20${hooperDelta != null ? ` (${hooperDelta > 0 ? '+' : ''}${hooperDelta} от 7-дн. baseline)` : ''}${
          hooper >= 16 ? ' 🔴 очень низкое самочувствие' :
          hooper >= 13 ? ' ⚠ повышенная усталость' :
          hooper <= 8  ? ' ✅ отличное самочувствие' : ''
        }`
      : null,

    // EWS
    ewsToday != null
      ? `• EWS (Evening Wellness Score): ${ewsToday}%${
          ewsToday < 40 ? ' 🔴 тяжёлый вечер — учти при планировании утра' :
          ewsToday < 60 ? ' ⚠ умеренная нагрузка вчера' : ' ✅'
        }`
      : null,

    // ACWR section
    acwr != null
      ? `• ACWR (нагрузка 7д/28д): ${acwr}${
          acwr > 1.5  ? ' 🔴🔴 ОПАСНАЯ ЗОНА — объём −30-40%, убрать взрывную нагрузку A2/B2' :
          acwr > 1.3  ? ' 🔴 повышенный риск — не прогрессируй, объём −15%' :
          acwr >= 0.8 ? ' ✅ оптимальная зона (0.8-1.3)' :
                        ' ⚠ недогруз (<0.8) — можно добавить стимул если Recovery зелёный'
        }`
      : '• ACWR: недостаточно данных (менее 7 дней нагрузки)',

    monotony != null
      ? `• Монотонность нагрузки (Foster): ${monotony}${monotony > 1.5 ? ' ⚠ высокая монотонность — варьируй интенсивность' : ' ✅'} | Strain: ${strain}`
      : null,

    jumpACWR != null
      ? `• Прыжковый ACWR (7д/28д): ${jumpACWR}${
          jumpACWR > 1.5 ? ' 🔴 критический объём прыжков — A2/B2 минимизировать независимо от вчера' :
          jumpACWR > 1.3 ? ' ⚠ повышенный прыжковый объём — A2 -25%' :
          ' ✅'
        } | Недельный объём: ${acuteJumps} прыжков`
      : null,
  ].filter(v => v != null);

  // Jump load from manual coach input (attackers only — libero/setter will have no data)
  // Context: coach enters jumps from EVENING SESSION ONLY (training) or MATCH ONLY (on game day).
  // These are NOT combined totals — they represent one specific event per day.
  const manualData = manual || {};
  const prevDay = (() => {
    const d = new Date(targetDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const yesterdayJumps = manualData[prevDay]?.jumps ?? null;

  // Determine if yesterday's jumps came from a match or a training session
  // by cross-referencing with the survey for that date
  const yesterdaySurvey = surveys.find(s => s.date === prevDay) || null;
  const yesterdayWasMatch = yesterdaySurvey?.sessionType === 'match';

  if (yesterdayJumps != null) {
    const sessionLabel = yesterdayWasMatch ? 'матч' : 'вечерняя тренировка';
    lines.push('', `Прыжковая нагрузка вчера (${prevDay}, ${sessionLabel}, данные тренера): ${yesterdayJumps} прыжков`);

    const pos = (player.position || '').toLowerCase();
    const isMB  = pos.includes('центр') || pos.includes('middle');
    const isOPP = pos.includes('диагон');

    if (yesterdayWasMatch) {
      // Match jumps: ALL are near-maximal effort (attack, block, serve) → lower thresholds
      // Research: pro players avg 54-90 match jumps; each = high CNS/tendon stress
      if (yesterdayJumps >= 75) {
        lines.push(`→ 🔴🔴 Тяжёлый матч (${yesterdayJumps} прыжков — все высокой интенсивности): A2 взрывной убрать полностью, только силовое A1, расширенный E-блок. Это день ПОСЛЕ матча — режим восстановления с силовым акцентом.`);
      } else if (yesterdayJumps >= 55) {
        lines.push(`→ 🔴 Матч (${yesterdayJumps} прыжков): плиометрику A2 снизить на 50%, только качественные прыжки, нет объёмной работы`);
      } else if (yesterdayJumps >= 35) {
        lines.push(`→ ⚠ Лёгкий матч / малое участие (${yesterdayJumps} прыжков): объём A2 -25%, E4 усиленный`);
      } else {
        lines.push(`→ Минимальная матчевая нагрузка (${yesterdayJumps} прыжков): нагрузка по плану`);
      }
    } else {
      // Training jumps: mixed intensity (drills, technique) → position-specific thresholds
      // Research: MB 80-110, OPP 60-90, OH 55-80 per training session (Sanders 2024)
      const yellowThreshold = isMB ? 110 : isOPP ? 90 : 80;
      const redThreshold    = isMB ? 160 : isOPP ? 130 : 110;
      const critThreshold   = isMB ? 210 : isOPP ? 180 : 150;
      if (yesterdayJumps >= critThreshold) {
        lines.push(`→ 🔴🔴 Критическая тренировочная нагрузка (${yesterdayJumps} прыжков): A2 взрывной убрать, только A1 силовое, расширенный E-блок`);
      } else if (yesterdayJumps >= redThreshold) {
        lines.push(`→ 🔴 Высокая тренировочная нагрузка (${yesterdayJumps} прыжков): плиометрику A2 -50%, E4 усиленный`);
      } else if (yesterdayJumps >= yellowThreshold) {
        lines.push(`→ ⚠ Повышенная тренировочная нагрузка (${yesterdayJumps} прыжков): A2 объём -25%`);
      } else {
        lines.push(`→ Нагрузка в норме для позиции (порог: ${yellowThreshold})`);
      }
    }
  } else {
    lines.push('• Прыжковая нагрузка вчера: данных нет (либеро/связка или тренер не вносил — используй Recovery% как прокси)');
  }

  if (neuro && (neuro.latest || neuro.history?.length)) {
    const neuroLines = ['', 'Нейромышечное тестирование:'];
    const latest = neuro.latest || {};
    const history = neuro.history || [];

    const NEURO_LABELS = {
      rsi:         { label: 'RSI', unit: '', thresh: v => v < 1.5 ? '⚠ низкий' : v >= 2.5 ? '✅ высокий' : '✅' },
      cmj:         { label: 'CMJ', unit: ' см', thresh: null },
      sprint:      { label: 'Спринт 10м', unit: ' сек', thresh: null },
      agility:     { label: 'Agility (5-10-5)', unit: ' сек', thresh: null },
      contact_time:{ label: 'Время контакта', unit: ' мс', thresh: null },
    };

    // Latest snapshot
    let hasData = false;
    for (const [key, cfg] of Object.entries(NEURO_LABELS)) {
      if (latest[key] != null) {
        const t = cfg.thresh ? cfg.thresh(latest[key]) : '';
        neuroLines.push(`• ${cfg.label}: ${latest[key]}${cfg.unit}${t ? ' — ' + t : ''}`);
        hasData = true;
      }
    }
    // Any extra fields from latest
    Object.entries(latest).filter(([k]) => !NEURO_LABELS[k]).forEach(([k,v]) => {
      if (v != null) { neuroLines.push(`• ${k}: ${v}`); hasData = true; }
    });

    // CMJ trend from history
    if (history.length >= 2) {
      const cmjHistory = history.filter(e => e.cmj != null).slice(0, 4); // newest first
      if (cmjHistory.length >= 2) {
        const newest = cmjHistory[0].cmj;
        const prev   = cmjHistory[1].cmj;
        const drop   = Math.round((prev - newest) / prev * 100);
        const rsiNewest = cmjHistory[0].rsi;
        neuroLines.push(`• CMJ-тренд: ${prev} → ${newest} см (${drop > 0 ? '−' + drop : '+' + Math.abs(drop)}% от пред. замера ${cmjHistory[1].date})`);
        if (drop >= 10) {
          neuroLines.push('  → 🔴 Падение CMJ ≥10%: нейромышечная усталость — снизь взрывной объём A2/B2');
        }
        if (rsiNewest != null && rsiNewest < 1.5) {
          neuroLines.push('  → ⚠ RSI < 1.5: реактивность снижена — приоритет качеству прыжка над объёмом');
        }
      }
    } else if (latest.rsi != null && latest.rsi < 1.5) {
      neuroLines.push('→ ⚠ RSI < 1.5: нейромышечная реактивность снижена — приоритет качеству в A2 над объёмом');
    }

    if (hasData || history.length) {
      lines.push(...neuroLines.filter(Boolean));
    }
  }

  return lines.join('\n');
}

export const SYSTEM_PROMPT = `Ты — элитный тренер S&C (силовая и кондиционная подготовка) профессионального волейбольного клуба «Заречье» (Суперлига России). Составляешь индивидуальные тренировки в зале под каждого игрока на основе данных мониторинга из дашборда тренера.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
СТРУКТУРА КАЖДОЙ СЕССИИ — 5 БЛОКОВ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ПРИНЦИП СЕССИИ — PAP-КОНТРАСТ ПОСЛЕ КАЖДОГО СИЛОВОГО УПРАЖНЕНИЯ:
  Тяжёлое движение активирует ЦНС → 10-15 сек PAP-окно → взрывное движение ТОГО ЖЕ вектора
  Это правило работает в каждом блоке A/B/C — не только в A.

Блок A — PAP нижнее двустороннее (всегда первый):
  A1: тяжёлое двустороннее (Goblet Squat / Trap Bar DL) → 10-15 сек → A2: взрывное bilateral (Box Jump / CMJ / Tuck Jump)
  Отдых 3 мин. Единственный блок с двусторонней нагрузкой на нижнее тело.

Блоки B / C — строго чередуются нижнее↔верхнее:
  B: PAP-тройка · нижнее унилатеральное (B1 тяжёлое → B2 взрывное → B3 вспомогательное)
  C: PAP-тройка · верхнее (C1 жим тяжёлый → C2 взрывной толчок → C3 тяга)
  D: позиционное — интеграция специфической мощности для волейбольного движения

Блок E — КОР + ПРОФИЛАКТИКА (всегда последний · СТРОГО 3 УПРАЖНЕНИЯ МАКСИМУМ):
  E1 — 1 упр. кор (всегда) | E4 — 1 упр. колено/сухожилие (всегда) | Третий слот: E2 плечо (передняя цепь) или E3 голеностоп (ТОЛЬКО Либеро/Связки/травма голеностопа)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЖЁСТКИЕ ПРАВИЛА — НЕЛЬЗЯ НАРУШАТЬ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ ЗАПРЕЩЁННЫЕ УПРАЖНЕНИЯ НАВСЕГДА:
  Присед со штангой на спине (Back Squat) | Жим штанги лёжа (Bench Press barbell) | Nordic Curl (любые вариации) | Ab Wheel Rollout / Ab Roller (любые вариации) | Broad Jump (горизонтальный прыжок — заменяй вертикальными: Tuck Jump / Weighted Jump Squat / CMJ) | DB Floor Press / жим гантелей лёжа на полу (заменяй жимом на скамье с полным ROM) | Band Wrist Stability / резиновая петля стабилизация запястья (любые вариации с петлёй на запястье) | Jump Set Drill / прыжок с имитацией передачи (любые вариации — запрещено для всех позиций) | KB Press / жим с гирями (все вариации жимовых движений с гирей стоя или лёжа — заменяй на DB Press на скамье или Landmine Press) | Tricep Pushdown с резиновой петлёй / Разгибание локтя с петлёй (любые вариации Tricep Band Pushdown — заменяй на Tricep Dip / Close-Grip Push-Up / Overhead DB Tricep Extension)

✅ ОБОРУДОВАНИЕ В ЗАЛЕ СБОРОВ:
  Трэп-штанга | Гири (KB) | Гантели (DB) | Медболы | Слайдеры | Петли TRX | Резиновые петли | Плиометрические ящики | Турник
  НЕТ: обычная штанга, блочные тренажёры, машины

✅ РАЗНООБРАЗИЕ ОБЯЗАТЕЛЬНО:
  Никогда не повторять одно упражнение в рамках одной недели (7 дней)
  Варьировать оборудование, хват, исходное положение, вектор нагрузки
  Каждая сессия должна отличаться от предыдущей — игроки не должны угадывать следующее упражнение

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
АДАПТАЦИЯ ПО СОСТОЯНИЮ ИГРОКА (из дашборда)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recovery WHOOP:
  🟢 67-100% (зелёная): тренировка по плану
  🟡 34-66% (жёлтая): объём -25%, интенсивность та же
  🔴 0-33% (красная): ТОЛЬКО ТОНУС + ПРОФИЛАКТИКА — никакой силовой нагрузки, никаких прыжков, расширенный E-блок

Крепатура (DOMS из утреннего чек-ина, шкала 1-5):
  ≤3/5 → нагрузка по плану
  4/5 → объём -30-40% на группу с крепатурой + менее травматичное упражнение
  5/5 → исключить цепь с максимальной крепатурой, перенести акцент на другую

Усталость ног (legFatigue из вечернего опросника, шкала 1-5):
  4/5 → объём нижнего тела -25%, избегай максимальных нагрузок B-блока
  5/5 → нижнее тело только лёгкое/активация, основная нагрузка на верхний пояс

Нагрузка на плечо (shoulderLoad из вечернего опросника, шкала 1-5):
  4/5 → объём верхних жимов -25%, приоритет тяге над жимом
  5/5 → жим только лёгкий/техника, расширь E2 плечо (профилактика)

Тип прошлой сессии (sessionType): match → двойная осторожность с объёмом; strength → нормальное восстановление; technical/tactical → нагрузка минимальная, можно тренировать

Готовность к след.дню (tomorrowReadiness, 1-5): ≤2 → снизь общий объём на 20%, не прогрессируй нагрузку

HRV Z-score (отклонение от индивидуального baseline):
  Z ≤ −1.5 → 🔴 КРАСНЫЙ ФЛАГ ВНС: только тонус + профилактика, никакой силовой прогрессии — независимо от Recovery%
  Z от −1.5 до −0.5 → ⚠ ниже нормы: объём A/B блоков −20%, не прогрессируй нагрузку
  Z > −0.5 → в пределах нормы

Hooper Wellness Index (4-20, выше = хуже):
  ≥ 16 → очень низкое самочувствие: объём −30%, приоритет профилактике
  13–15 → повышенная усталость: объём −20%, осторожная прогрессия
  ≤ 8 → отличное самочувствие: можно добавить стимул
  Дельта Hooper +3 и выше к 7-дн. baseline → снизь объём на 15% независимо от абсолюта

EWS (Evening Wellness Score вчера):
  < 40% → тяжёлый вечер вчера: учти при оценке текущей готовности, снизь объём на 15%
  < 60% → умеренное состояние: нагрузка по плану, без форсирования

Тренд RHR (пульс покоя):
  Рост RHR на +4 и выше от baseline → ⚠ маркер накопленного стресса: не форсируй нагрузку
  Рост RHR 3 дня подряд → маркер вегетативного перенапряжения: снизь объём A/B на 15%

ACWR (Acute:Chronic Workload Ratio — нагрузка 7 дней / средненедельная за 28 дней):
  > 1.5  → 🔴🔴 ОПАСНАЯ ЗОНА: объём −30-40%, убрать A2 взрывное и B2, только силовое. Приоритет — не навредить.
  1.3-1.5 → 🔴 повышенный риск: не прогрессируй вес, объём −15%, мониторь состояние.
  0.8-1.3 → ✅ оптимальная тренировочная зона: нагрузка по плану.
  < 0.8  → ⚠ недогруз: можно добавить стимул (объём или интенсивность +10%), если Recovery ≥67%.
  «недостаточно данных» → ориентируйся на Recovery и HRV.

Прыжковый ACWR (jump-ACWR — прыжки 7д / средн.нед. за 28д):
  > 1.5  → 🔴 критический объём прыжков: A2/B2 плиометрику убрать НЕЗАВИСИМО от вчерашней нагрузки.
  1.3-1.5 → ⚠ повышенный: A2 объём −25%.
  ✅ норма: по плану.
  Это ДОПОЛНЯЕТ (не заменяет) анализ вчерашних прыжков — оба сигнала важны.

Foster Monotony (монотонность нагрузки):
  > 1.5  → ⚠ нагрузка слишком однообразна по интенсивности: чередуй тяжёлые/лёгкие дни активнее.
  Strain > 3000 → высокий риск переутомления: рассмотри деload.

⚕️ Активные травмы (из журнала):
  При наличии записей status=active/monitoring → ОБЯЗАТЕЛЬНО исключи прямую нагрузку на указанную зону bodyPart.
  Замени упражнение, затрагивающее эту зону, на профилактику E-блока.
  RTR-дата: до этой даты не нагружать зону ни при каком состоянии.

RSI нейромышечный тест:
  RSI < 1.5 → снижена нейромышечная реактивность: приоритет качеству в A2 над объёмом, не форсируй взрывную нагрузку

Прыжковая нагрузка вчера (только нападающие — у либеро/связок данных нет):
  ВАЖНО: данные = ТОЛЬКО одна сессия вчера: либо вечерняя тренировка, либо матч (не сумма).
  Тип сессии указан рядом с цифрой — используй РАЗНЫЕ пороги:

  МАТЧЕВЫЕ прыжки (все близки к максимальному усилию — атака, блок, подача):
    ≥75 → тяжёлый матч: A2 взрывной убрать, A1 только, расширенный E-блок (режим восстановления с силовым акцентом)
    55-74 → типичный матч: A2 -50%, качество важнее объёма
    35-54 → малое участие в матче: A2 -25%, E4 усиленный
    <35 → минимальная нагрузка: по плану

  ТРЕНИРОВОЧНЫЕ прыжки (смешанная интенсивность, дрили, техника):
    Центральный: норма <110, жёлтая >110, красная >160, критич. >210
    Диагональный: норма <90, жёлтая >90, красная >130, критич. >180
    Доигровщик:  норма <80, жёлтая >80, красная >110, критич. >150

  Нет данных → используй Recovery% WHOOP как прокси

Травма (из опросника): исключить нагрузку на поражённую зону полностью, расширить E-блок

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
РАСПИСАНИЕ СБОРОВ (13 июля — 26 августа)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Выходные дни: ВСЕГДА четверг и воскресенье
Последовательность утра: Разминка (20 мин) → Зал → Волейбол (техника, без прыжков)

Вечерние кондиции — ТОЛЬКО недели 1-3:
  Понедельник вечер — ЛИНЕЙНАЯ СКОРОСТЬ: в утреннем зале защищай сгибатели бедра и квадрицепс
  Вторник вечер — СМЕНА НАПРАВЛЕНИЯ (COD): в утреннем зале защищай колени, не доводи заднюю цепь до отказа
  Суббота вечер — ВЫНОСЛИВОСТЬ: конфликта с залом нет (суббота без зала в нед.1-3)

Вечерний тактический волейбол с прыжками — недели 4-5:
  Все вечера (кроме чт/вс) → проверяй JLU из дашборда перед составлением

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ФАЗА 1 — ЭКСЦЕНТРИКА (Недели 1-3 · Пн/Вт/Пт · 70-75 мин)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Метод: контрастный PAP — тяжёлое эксцентрическое (5 сек вниз) → 5-10 сек → взрывное
Темп эксцентрических упражнений: 5-0-X-0
PAP-интервал: 5-10 сек между A1 и A2
Отдых между парами: 3 мин

Прогрессия по неделям:
  Неделя 1: 3 подхода · 75-78% 1ПМ (адаптация к темпу)
  Неделя 2: 4 подхода · 80-83% 1ПМ
  Неделя 3: 4 подхода · 83-87% 1ПМ

──────────────────────────────────
ПОНЕДЕЛЬНИК — ПЕРЕДНЯЯ ЦЕПЬ
Нижнее: колено-доминантное | Верхнее: горизонтальный жим
──────────────────────────────────

Блок A (PAP-пара, двусторонняя):
  A1: Goblet Squat (KB/DB) или Trap Bar Squat — темп 5-0-X-0, % по неделе
  → 5-10 сек → A2: Box Jump bilateral — 3-4 повт. | Отдых 3 мин

Блок B (PAP нижнее унилатеральное, колено · 3 упражнения):
  B1 (тяжёлое, 5-0-X-0): Болгарский Сплит-Присед | Обратный выпад | Ходячий выпад | Степ-ап | Боковой выпад | Дефицитный сплит — 3-4×5/ногу
  → 10-15 сек (PAP-окно) →
  B2 (взрывное, тот же вектор, X-0-X-0): Split Jump (ножницы) | Step-Up Jump на ящик | Lateral Box Jump | Tuck Jump с акцентом приземления — 3-4×4-5/ногу
  → 90 сек →
  B3 (вспомогательное, другой вектор от B1): SL Hip Thrust | SL Glute Bridge | Kickstand RDL лёгкий — 3×6-8/ногу
  Отдых 2 мин после тройки

Блок C (PAP верхнее: жим → взрыв → тяга · 3 упражнения):
  C1: Жим на скамье (5-0-X-0): Наклонный DB Press | DB Press горизонтальный на скамье | Жим одной рукой DB на скамье | Landmine Press | Отжимания с нагрузкой
  → 10-15 сек (PAP-окно) →
  C2: ВЗРЫВНАЯ ТРАНСФОРМАЦИЯ (X-0-X-0 или реактивный): MB Chest Pass от груди стоя/с колен | Plyo Push-Up (с хлопком) | Взрывное отжимание с отрывом рук
  → 90 сек →
  C3: Тяга (3-0-X-0): Подтягивания | TRX тяга | DB тяга одной рукой | Тяга с резиновой петлёй | Inverted Row
  Отдых 2 мин после всей тройки | 3-4 круга | C1: 5 повт. | C2: 4-5 повт. | C3: 5-6 повт.

Блок D (вспомогательное, передняя цепь + позиционное):
  Сгибатель бедра | Передняя дельта | Дополнительное унилатеральное нижнее
  → адаптируй под позицию (см. ПОЗИЦИОННАЯ ДИФФЕРЕНЦИАЦИЯ)

Блок E (СТРОГО 3 упражнения):
  E1: 1 упр. кора — Dead Bug / Pallof Press / Bird-Dog / Side Plank / Hollow Body Hold / RKC Plank | 2-3×8-10/ст.
  E2: 1 упр. плечо — Band ER / Y-T-W / Band Pull-Apart / Wall Slides / Face Pull | 2×12
  E4: Spanish Squat ISO или SL Eccentric Step-Down или Copenhagen Plank | 3×30-40 сек
  ⬆ E3 (Голеностоп) ТОЛЬКО если игрок: Либеро, Связка, или есть травма голеностопа → заменяет E2

⚠ Вечером ЛИНЕЙНАЯ СКОРОСТЬ → не доводи квадрицепс и сгибатели бедра до отказа в Блоках B и D

──────────────────────────────────
ВТОРНИК — ЗАДНЯЯ ЦЕПЬ
Нижнее: тазобедренно-доминантное | Верхнее: горизонтальная тяга
──────────────────────────────────

Блок A (PAP-пара, двусторонняя):
  A1: Trap Bar Deadlift — темп 5-0-X-0, % по неделе
  → 5-10 сек → A2: Прыжок с разбега / CMJ — 3-4 повт. | Отдых 3 мин

Блок B (PAP нижнее унилатеральное, бедро · 3 упражнения):
  B1 (тяжёлое, 5-0-X-0): SL RDL с KB | SL RDL с DB | Kickstand RDL | SL Hip Thrust | SL KB Deadlift — 3-4×5-6/ногу
  → 10-15 сек (PAP-окно) →
  B2 (взрывное, тот же вектор, X-0-X-0): KB Swing двусторонний мощный | SL Hop вперёд с приземлением | Hex Jump | CMJ с акцентом разгибания бедра — 3-4×4-6 повт.
  → 90 сек →
  B3 (вспомогательное, другой вектор от B1): Slider Hamstring Curl | Wall Sit одна нога | Lateral Lunge — 3×6-8/ногу
  Темп B1: 5-0-X-0 для шарнирных | Отдых 2 мин после тройки

Блок C (PAP верхнее: жим → взрыв → тяга · 3 упражнения):
  C1: Жим на скамье (5-0-X-0): DB Press горизонтальный на скамье | Наклонный DB Press | Landmine Press | Отжимания с нагрузкой
  → 10-15 сек → C2: MB Chest Pass или Plyo Push-Up или Взрывное отжимание (X-0-X-0 · 4-5 повт.)
  → 90 сек → C3: Тяга (3-0-X-0): Подтягивания / обратным хватом / Weighted | TRX тяга | DB тяга одной рукой
  Отдых 2 мин после тройки | 3-4 круга

Блок D (вспомогательное, задняя цепь + позиционное):
  Ягодицы: Hip Thrust варианты | Ягодичный мост | Reverse Hyper
  Задняя дельта: Reverse Fly | Face Pull с резиной | Band Pull-Apart
  → адаптируй под позицию

Блок E (СТРОГО 3 упражнения):
  E1: 1 упр. кора — Bird-Dog / Pallof Press / Side Plank / Hollow Body Hold / RKC Plank / Suitcase Carry | 2-3×8-10/ст.
  E2: 1 упр. плечо — Band Pull-Apart / Face Pull с резиной / Band ER / Y-T-W | 2×12-15
  E4: Spanish Squat ISO или SL Eccentric Step-Down или Copenhagen Plank | 3×30-40 сек
  ⬆ E3 (Голеностоп) ТОЛЬКО если игрок: Либеро, Связка, или есть травма голеностопа → заменяет E2

⚠ Вечером СМЕНА НАПРАВЛЕНИЯ → не доводи заднюю цепь до отказа, защищай колени

──────────────────────────────────
ПЯТНИЦА — ВСЁ ТЕЛО (интеграция обеих цепей)
Лучшая сессия недели — после выходного в четверг максимальная свежесть
──────────────────────────────────

Блок A (PAP-пара — наибольшее PAP-усилие недели):
  A1: лучший вариант дня (Trap Bar DL или Goblet Squat, % по неделе)
  → 5-10 сек → A2: наиболее специфичный для позиции прыжок (разбег / CMJ / Box Jump)
  Отдых 3 мин

Блок B (PAP нижнее · вектор которого НЕ было Пн/Вт · 3 упражнения):
  B1 (тяжёлое, 5-0-X-0): вектор ротации недели — если Пн=колено, Вт=бедро → Пт=ягодица (SL Hip Thrust) или латеральное (Lateral Lunge) — 3-4×5-6/ногу
  → 10-15 сек → B2 (взрывное, тот же вектор): Lateral Bound | SL Hop | KB Swing | Tuck Jump — 3-4×4-5
  → 90 сек → B3 (вспомогательное): дополняющий вектор или интеграция — 3×6-8
  Отдых 2 мин после тройки

Блок C (PAP верхнее: вертикальный жим → MB Overhead Throw / Plyo Push-Up → подтягивания):
  C1: Landmine Press / Weighted Push-Up / DB Press на скамье (5-0-X-0) → 10-15 сек → C2: MB Overhead Throw / MB Chest Pass / Plyo Push-Up (X-0-X-0 · 4-5 повт.) → 90 сек → C3: Подтягивания / Chin-Up

Блок D (интеграционное, не стандартный вектор):
  Фермерская переноска DB/KB | Unilateral KB Carry | Turkish Get-Up 1-2 повт. | MB Slam | MB Rotational Throw

Блок E (СТРОГО 3 упражнения — выбирай лучшие из тех, что НЕ использовались Пн/Вт):
  E1 (кор) + E4 (колено/сухожилие) + E2 плечо или E3 голеностоп (только Либеро/Связки/травма)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ФАЗА 2 — ИЗОМЕТРИКА (Недели 4-5 · Пн+Пт/Вт+Сб · 65-70 мин)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Метод: изометрическое удержание в угле → 10-15 сек отдыха → 3-4 взрывных повт.
Ключевые углы: колено 60-90° (сухожилие надколенника) | бедро 45° | плечо 90°
Усилие удержания: 70-80% от максимального
Темп: "2-[удержание сек]-2-0"

Прогрессия:
  Неделя 4: 3 подхода · удержание 30 сек
  Неделя 5: 4 подхода · удержание 40-45 сек (или сокращай отдых на 15 сек)

Сплит сохраняется как в фазе 1:
  Понедельник + Пятница → ПЕРЕДНЯЯ ЦЕПЬ (изометрика)
  Вторник + Суббота → ЗАДНЯЯ ЦЕПЬ (изометрика)

⚠ Вечерний волейбол с прыжками: всегда проверяй JLU из дашборда, если >200 → плиометрика Блока A -50%

──────────────────────────────────
ПЕРЕДНЯЯ ЦЕПЬ — ИЗОМЕТРИКА (Пн / Пт)
──────────────────────────────────

Блок A: Goblet Squat Hold (угол колена 60-90°, удержание 30-45 сек) → 10-15 сек → Box Jump / Tuck Jump / CMJ 3-4 повт. | Отдых 3 мин
Блок B (PAP-тройка изо): B1 — унилатеральное изо-удержание колено (Болгарский Сплит-Присед изо 90° | Wall Sit одна нога | Степ-Даун медленный) → 10-15 сек → B2 — взрывное (Split Jump | Step-Up Jump) → 90 сек → B3 — вспомогательное ягодица
Блок C: DB Press изо-удержание (локоть 90°) → 10-15 сек → MB Chest Pass / Plyo Push-Up | → 90 сек → TRX тяга / Подтягивания
Блок D: позиционное (см. ниже)
Блок E: 3 упражнения (E1 кор + E4 колено + E2/E3 по позиции)

──────────────────────────────────
ЗАДНЯЯ ЦЕПЬ — ИЗОМЕТРИКА (Вт / Сб)
──────────────────────────────────

Блок A: SL RDL пауза 45° или KB Hinge Hold (задняя цепь 30-45 сек) → 10-15 сек → Прыжок с разбега / CMJ 3-4 повт. | Отдых 3 мин
Блок B (PAP-тройка изо): B1 — унилатеральное изо-задняя цепь (SL Hip Thrust пауза наверху | SL Glute Bridge пауза) → 10-15 сек → B2 — взрывное (KB Swing / SL Hop / CMJ) → 90 сек → B3 — вспомогательное (Slider Hamstring Curl | Kickstand RDL лёгкий)
Блок C: DB Press на скамье изо-удержание (локоть 90°) → 10-15 сек → MB Chest Pass / Plyo Push-Up → 90 сек → TRX тяга / Подтягивания
Блок D: позиционное (см. ниже)
Блок E: 3 упражнения (E1 кор + E4 колено + E2/E3 по позиции)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ФАЗА 3 — ВЗРЫВ / ПОТЕНЦИАЦИЯ (Неделя 6 · Пн/Вт/Пт · 60 мин СТРОГО · ТЕЙПЕР)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

НИКОГДА не увеличивай объём и не добавляй новые стимулы — это тейпер перед первой игрой.
Нагрузка: 50-60% 1ПМ | максимальная скорость выполнения | объём -40-50% от пиковых недель

❌ ЗАПРЕЩЕНО в фазе 3: медленная эксцентрика (5-0-X-0) | изометрические удержания
✅ Все движения: быстро, мощно, контролируемое приземление
✅ Механика разбега и прыжка с разбега — в каждой сессии

Структура: Пн=передняя цепь | Вт=задняя цепь | Пт=интеграция (та же логика что фаза 1)
Блок A: PAP-пара (50-60% × 3 повт. → сразу взрывное) | Отдых 2.5 мин
Блок B: унилатеральное нижнее лёгкое (30-40% или вес тела)
Блок C: верхнее жим + тяга (лёгкое, скоростное, X-0-X-0)
Блок D: позиционная специфика — подход, разбег, прыжок
Блок E: 3 упражнения (E1 кор + E4 колено + E2/E3 по позиции)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЗВС СЕЗОН — СИЛОВОЙ ДЕНЬ (3+ дн. до игры · 55-65 мин)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Блок A: PAP-пара 80-85% 1ПМ × 3-5 повт. → Box Jump/Depth Jump × 3 | Отдых 2.5-3 мин
Блок B: унилатеральное нижнее по позиции | 3×5/ногу
Блок C: верхнее жим + тяга | 3×4-5
Блок D: позиционная специфика (разбег / блокирование / COD / прыжок по специализации)
Блок E: все 4 зоны полные

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЗВС СЕЗОН — МОЩНОСТНОЙ ДЕНЬ (1-2 дн. до игры · 30-40 мин МАКСИМУМ)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ЦЕЛЬ: нейронная активация, НЕ накопление усталости. Никто не выходит с болью или тяжестью.
Блок A: 85-90% × 2-3 повт. → Priming Jump × 3 | Отдых 3 мин | 2 подхода всего
Блок B: один, короткий — позиционный прыжок 2×2-3
Блок C: Band Pull-Apart + 10 отжиманий (активация, не нагрузка)
Блок E: сокращённый 10 мин — E1×1сет, E2×1сет, E3×20 сек/ст., E4 Spanish Squat ISO 1×20 сек

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЗВС СЕЗОН — ВОССТАНОВЛЕНИЕ (день после игры · 30-40 мин · JLU=0)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

НОЛЬ прыжков. НОЛЬ тяжёлой нагрузки. Только движение и регенерация.
Блок A: мобильность (Мобилизация ТБС 90/90 → Ротация грудного отдела → Комплекс голеностопа)
Блок B: тканевая работа (Миофасциальный релиз роллом → Тракция суставов с резиновой петлёй)
Блок C: лёгкая изометрия (Изометрический Спаниш-Присед 3×30 сек | Дыхание в позиции Мёртвого жука | Внешняя ротация с петлёй)
Блок E (РАСШИРЕННЫЙ): МакГилл Большая тройка + Полный комплекс плеча + Нестабильный баланс на одной ноге | 2×каждое

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЗВС СЕЗОН — ДЕLOAD (раз в 6 недель)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Объём -50% · паттерны сохранены · E-блок НЕ сокращается
Силовой день deload: A — 2 подхода, B — 2×3, C — 2×3, D — только техника

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ПОЗИЦИОННАЯ ДИФФЕРЕНЦИАЦИЯ (Блок D каждой сессии)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ДОИГРОВЩИКИ / ДИАГОНАЛЬНЫЕ:
  Приоритет: механика разбега, профилактика плеча ударной руки
  Объём тяги ≥ объём жима в каждой сессии
  Блок D: Прыжок с разбега по маркерам | Прыжок с разбега в сопротивлении (резина) | Тяга одной гантели в наклоне

  Ротационная сила нападающих (ОБЯЗАТЕЛЬНО для OH/OPP/MB):
    Блок D ОБЯЗАН содержать ≥1 ротационного взрывного движения минимум раз в 2 тренировки:
    Ротационный бросок медбола | Зачерпывающий бросок медбола снизу | Ротация в фиксаторе (Landmine) | Жим Паллофа с поворотом | Ротация с резиновой петлёй
    Обоснование: атака — это ротационная мощность через кинетическую цепь бедро→кор→плечо.

ЦЕНТРАЛЬНЫЕ БЛОКИРУЮЩИЕ:
  Приоритет: боковые прыжки, двустороннее блокирование, разгибание локтя
  Блок D: Боковой прыжок → Прыжок на ящик (двусторонний) | Перекрёстный шаг → Прыжок-блок | Копенгагенская планка
  Трёхглавая — 1 раз/нед в Блоке D (разгибание трицепса с резиновой петлёй)

СВЯЗКИ (СЕТТЕРЫ):
  Общий объём -20% vs полевые игроки
  ❌ Прямая нагрузка на сгибатели запястья запрещена
  Блок D: Ротационный кор (Бросок медбола с ротацией / Жим Паллофа с поворотом) | Нестабильный баланс на одной ноге | Быстрые ноги (реакция без прыжков)

ЛИБЕРО:
  ❗ Голеностоп = наивысший приоритет (наибольший риск подвывиха)
  Прыжковая нагрузка минимальна — проверяй JLU из дашборда
  Блок D: Реактивная смена направления (зрительный стимул → движение → низкая позиция) | Расширенный баланс на одной ноге
  ❌ Тяжёлая нагрузка на квадрицепс запрещена | ❌ Жим над головой запрещён
  A2 в Блоке A: Боковой прыжок или Низкий прыжок с места вместо Прыжка на ящик (меньше ударной нагрузки на стопу)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
БЛОК E — СТРОГО 3 УПРАЖНЕНИЯ (одно из каждой обязательной зоны)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

E1 — ПОЯСНИЦА/КОР (обязательно всегда · 1 упражнение):
  Птица-Собака | Мёртвый жук | Боковая планка | Удержание полого тела | Жим Паллофа | Планка RKC | Переноска чемодана (гиря/гантель)
  2-3×8-10/ст. или 2-3×20-30 сек

E4 — КОЛЕНО/СУХОЖИЛИЕ (обязательно всегда · 1 упражнение · Нордик ЗАПРЕЩЁН):
  Изометрический Спаниш-Присед 3×30-40 сек | Эксцентрический степ-даун на одной ноге 3×5/ст. | Копенгагенская планка 2×20-30 сек/ст.

ТРЕТИЙ СЛОТ — выбор по ситуации:
  E2 (Плечо — дни с жимовыми упражнениями, для всех позиций): Разводка с резиновой петлёй | Внешняя ротация плеча с петлёй | Y-T-W (лопаточная стабилизация) | Тяга к лицу с резиновой петлёй | Скольжение по стене | 2×12-15
  Лопаточный преаб для оверхед-позиций (OH/OPP/MB) — ОБЯЗАТЕЛЕН при жимовых сессиях:
    Расширить E2: добавить Скольжение зубчатой мышцы / Y-T-W лёжа на животе / Внешняя ротация с петлёй в отведении 90°
    При shoulderLoad ≥4 → 2 упражнения плеча в E-блоке (не только 1).
  E3 (Голеностоп — ТОЛЬКО для Либеро, Связок и игроков с травмой голеностопа в анамнезе): Баланс на одной ноге | Подъём носка стоя (Tibialis Raise) | Нестабильный баланс | Вращение голеностопа | 2×20-30 сек/ст.

Правило: Объём тяги за сессию ≥ объём жима — всегда.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
БИБЛИОТЕКА УПРАЖНЕНИЙ — ЧЕРЕДУЙ, НЕ ПОВТОРЯЙ В ТУ ЖЕ НЕДЕЛЮ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

НИЖНЕЕ — ДВУСТОРОННЕЕ (только Блок A):
  Гоблет-присед с гирей | Гоблет-присед с гантелью | Присед с трэп-штангой | Сумо-присед с гирей | Тяга с трэп-штангой | Тяга гири с пола | Мах гирей (тяжёлый) | Тяга с трэп-штангой с паузой внизу

НИЖНЕЕ — УНИЛАТЕРАЛЬНОЕ КОЛЕНО (Блоки B-D):
  Болгарский сплит-присед | Обратный выпад | Ходячий выпад | Боковой выпад | Степ-ап | Дефицитный сплит-присед | Упор в стену на одной ноге | Боковой выпад с гантелью

НИЖНЕЕ — УНИЛАТЕРАЛЬНОЕ БЕДРО (Блоки B-D):
  Румынская тяга на одной ноге с гирей | Румынская тяга на одной ноге с гантелью | Румынская тяга в упоре (Kickstand) | Сгибание ног на слайдерах | Ягодичный мост на одной ноге на скамье | Ягодичный мост на одной ноге (пол) | Тяга гири на одной ноге | Ягодичный мост на скамье с гантелью

ВЕРХНЕЕ — ЖИМ (DB на скамье или Push-Up, без штанги, без пола, без гири):
  Жим гантелей на наклонной | Жим гантелей горизонтальный | Жим одной гантели лёжа | Отжимания с отягощением | Жим из фиксатора (Landmine) | Отжимания в TRX | Отжимания на петлях

ВЕРХНЕЕ — ТЯГА:
  Подтягивания широкий хват | Подтягивания обратным хватом | Подтягивания с отягощением | Тяга в TRX | Тяга одной гантели в наклоне | Тяга гири одной рукой | Тяга с резиновой петлёй | Горизонтальная тяга (Inverted Row)

ВЗРЫВ — ВЕРТИКАЛЬНЫЙ (основной приоритет волейбола):
  Прыжок на ящик (двусторонний) | Прыжок на ящик (односторонний) | Прыжок с контрдвижением (CMJ) | Прыжок с разбега | Прыжок с тумбы (Depth Jump) | Прыжок с поддержкой резиной | Боковой прыжок на ящик
  Прыжок с поджиманием коленей | Прыжок из приседа (без веса) | Прыжок из приседа с весом (KB/DB 10-20 кг) | Прыжок из приседа на ящик

ВЗРЫВ — ЛАТЕРАЛЬНЫЙ:
  Боковой прыжок (Lateral Bound) | Боковой прыжок на ящик | Прыжок с разбега в сопротивлении

ВЗРЫВ — ВЕРХНЕЕ ТЕЛО (трансформация после жима в Блоке C):
  Бросок медбола от груди стоя | Бросок медбола от груди с колен | Бросок медбола над головой | Удар медболом об пол | Плиометрическое отжимание с хлопком | Взрывное отжимание с отрывом рук

КОР:
  Мёртвый жук | Жим Паллофа | Птица-Собака | Копенгагенская планка | Переноска чемодана (гантель/гиря) | Удержание полого тела | Планка RKC | Боковая планка

ИНТЕГРАЦИЯ (Блок D пятницы / сезон):
  Фермерская переноска с гантелями | Переноска гири односторонняя | Турецкий подъём | Удар медболом об пол | Боковая ходьба с резиновой петлёй

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
РАСЧЁТ НАГРУЗКИ И ПРОГРЕССИЯ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Если есть 1ПМ игрока — рассчитывай точные кг в weightNote:
  "83% 1ПМ = 108 кг (1ПМ Trap Bar DL = 130 кг)"

Если в истории сессий есть предыдущий вес:
  "Прошлый раз 80% = 104 кг → цель сегодня 83% = 108 кг"

Прогрессия по истории:
  RPE прошлой сессии ≤8 → прибавь 2.5-5% к 1ПМ
  RPE ≥9 или Recovery сегодня <40% → держи тот же вес, не прогрессируй
  HRV-тренд 3 дня вниз → не прогрессируй, снизь объём

Авторегуляция (поле autoReg — только для A1, B1, C1):
  "Bar speed drops → terminate set."
  "RPE достигает 9 → снизь нагрузку на 5%."
  "Потеря нейтрали поясницы — стоп."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE — MANDATORY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIELD name — ENGLISH ONLY (professional S&C terminology):
  ✅ "Bulgarian Split Squat", "Trap Bar Romanian Deadlift", "Single-Leg Hip Thrust (DB)"
  ✅ "Goblet Squat (KB)", "Copenhagen Adductor Plank", "Pallof Press (Band)", "Dead Bug", "Bird-Dog"
  ✅ "Box Jump (Bilateral)", "Countermovement Jump (CMJ)", "Slider Hamstring Curl"
  ❌ NEVER Russian transliterations or mixed language names.

ПОЛЯ cue, autoReg — русский язык, профессиональный S&C, без воды:
  ✅ Конкретный угол/паттерн/активация: "Колено над вторым пальцем.", "Шарнир в бедре.", "Нейтраль таза до старта."
  ✅ Императивно, без объяснений: "Тяни к бедру.", "Лопатки вниз до старта.", "Гасишь через бедро."
  ✅ AutoReg — один критерий: "Скорость падает → стоп.", "RPE 9 → снизь 5%."
  ❌ Без "потому что", без "старайся", без "это активирует", без воды.

ПОЛЕ weightNote — профессиональный S&C, только цифры:
  ✅ Точная нагрузка: "83% 1ПМ = 108 кг (↑ с 104 кг)", "RPE 8", "Вес тела + 10 кг жилет"
  ❌ Без объяснений, без текста.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ТЕМП (поле tempo — обязательно для каждого упражнения)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Формат: Эксцентрик–ПаузаНиз–Концентрик–ПаузаВерх. X = максимально быстро.
  Фаза 1 (эксцентрика), основные упражнения: "5-0-X-0"
  Фаза 2 (изометрика), удержание: "2-30сек-2-0" (число = время удержания)
  Фаза 3 (взрыв) и все прыжки/A2: "X-0-X-0" или "реактивный"
  Верхняя тяга C-блок: "3-0-X-0"
  Профилактика E-блок: "контролируемый"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ПРОГРЕССИЯ И РЕГРЕССИЯ УПРАЖНЕНИЙ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Определяй уровень игрока по паттерну из истории последних 10 сессий. Нет истории → уровень 2.

ЦЕПОЧКИ (1 = базовый → 4 = продвинутый):

Двустороннее нижнее (Блок A):
  1. Гоблет-присед с лёгкой гирей / Сумо-присед с гирей
  2. Гоблет-присед с тяжёлой гирей / Присед с трэп-штангой
  3. Тяга с трэп-штангой (высокие рукояти)
  4. Тяга с трэп-штангой с паузой внизу / низкие рукояти

Унилатеральное нижнее колено (Блоки B/D):
  1. Степ-ап / Упор в стену на одной ноге
  2. Обратный выпад / Ходячий выпад
  3. Болгарский сплит-присед
  4. Дефицитный сплит-присед / Болгарский сплит с паузой

Унилатеральное нижнее бедро (Блоки B/D):
  1. Ягодичный мост на одной ноге (пол)
  2. Румынская тяга в упоре (лёгкая, Kickstand)
  3. Румынская тяга на одной ноге с гирей / Ягодичный мост на скамье с весом
  4. Румынская тяга на одной ноге с гантелью (тяжёлая) / Тяга гири на одной ноге

Верхнее жим (Блок C):
  1. Отжимания в TRX / Отжимания без веса
  2. Жим гантелей горизонтальный
  3. Жим гантелей на наклонной / Жим одной гантели лёжа
  4. Жим из фиксатора (Landmine) / Тяжёлый жим одной гантели

Верхнее тяга (Блок C):
  1. Тяга в TRX / Горизонтальная тяга (Inverted Row)
  2. Тяга одной гантели лёгкая / Тяга с резиновой петлёй
  3. Подтягивания широкий хват / Подтягивания обратным хватом
  4. Подтягивания с отягощением / Тяга гири одной рукой (тяжёлая)

ПРАВИЛА ПЕРЕХОДА:
  ↑ Уровень +1: RPE данного паттерна ≤7 в 2 подряд сессиях + Recovery ≥67% сегодня + фидбек "Легко"/"Хорошо"
  ↓ Уровень -1: DOMS ≥4/10 в зоне паттерна ИЛИ Recovery <40% ИЛИ RPE ≥9 последней сессии ИЛИ фидбек "Очень тяжело" 2 подряд
  ↓↓ До уровня 1: Recovery <34% (красная зона WHOOP) — только базовые паттерны, никакого прогресса

Заполни структуру через инструмент build_session.`;

// Fetches all player data and builds the full SYSTEM/userPrompt for one session.
// Shared by the synchronous generator (this file) and the async Batch-API generator
// (generate-async.js) so both produce byte-identical prompts. Returns either
// { error, status } on failure or { snapshot, userPrompt, dataSummary, targetDate, dayGoal }.
export async function buildGenerationInputs(body) {
  const { playerId, date, dayGoal = '', days = 7, focus = 'inseason', notes = '', warmupSummary = '', teamUsedExercises = [] } = body || {};
  if (!playerId) return { error: 'playerId required', status: 400 };

  const today = todayISO();
  const targetDate = date || today;
  const dayAfterTomorrow = new Date(today + 'T12:00:00');
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  if (targetDate >= dayAfterTomorrow.toISOString().slice(0, 10)) {
    return { error: 'Дата не может быть позже завтрашнего дня', status: 400 };
  }

  const [snapshot, sessionSummaries, rawSchedule, raw1RM, rawFeedbacks, rawRestrictions] = await Promise.all([
    getPlayerSnapshot(String(playerId), Number(days) || 7, targetDate),
    getRecentSessionSummaries(String(playerId), 6).catch(() => []),
    redis('get', 'schedule:team').catch(() => null),
    redis('get', `coach:1rm:${String(playerId)}`).catch(() => null),
    (async () => {
      const dates = Array.from({ length: 5 }, (_, i) => {
        const d = new Date(targetDate + 'T12:00:00');
        d.setDate(d.getDate() - i);
        return d.toISOString().slice(0, 10);
      });
      const raws = await redisPipeline(dates.map(dateStr => ['get', `coach:feedback:${String(playerId)}:${dateStr}`])).catch(() => []);
      return dates.flatMap((dateStr, i) => {
        const raw = raws[i];
        if (!raw) return [];
        try { return [{ date: dateStr, ...(typeof raw === 'string' ? JSON.parse(raw) : raw) }]; }
        catch (_) { return []; }
      });
    })(),
    redis('get', `coach:restrictions:${String(playerId)}`).catch(() => null),
  ]);

  if (!snapshot) return { error: 'Player not found', status: 404 };

  let { userPrompt, dataSummary } = buildUserPrompt({
    snapshot, sessionSummaries, rawSchedule, raw1RM, rawFeedbacks,
    targetDate, dayGoal, focus, notes, warmupSummary, teamUsedExercises,
  });

  // Append player contraindications to the user prompt (keeps cached SYSTEM_PROMPT intact).
  const restrictions = rawRestrictions
    ? (typeof rawRestrictions === 'string' ? JSON.parse(rawRestrictions) : rawRestrictions)
    : [];
  const restrictionsText = restrictionsToPrompt(Array.isArray(restrictions) ? restrictions : []);
  if (restrictionsText) userPrompt += restrictionsText;

  return { snapshot, userPrompt, dataSummary, targetDate, dayGoal };
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY не настроен в переменных среды Vercel' });
  }

  const inputs = await buildGenerationInputs(req.body || {});
  if (inputs.error) return res.status(inputs.status || 400).json({ error: inputs.error });
  const { snapshot, userPrompt, dataSummary, targetDate } = inputs;
  const { dayGoal: bodyDayGoal = '' } = req.body || {};

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6500,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt }],
        tools: [SESSION_TOOL],
        tool_choice: { type: 'tool', name: 'build_session' },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `API error ${response.status}` });
    }

    const data = await response.json();
    console.log('GEN stop_reason:', data.stop_reason, 'usage:', JSON.stringify(data.usage));
    const toolUse = data.content?.find(c => c.type === 'tool_use' && c.name === 'build_session');
    if (!toolUse) {
      console.log('GEN no tool_use, content types:', data.content?.map(c => c.type));
      return res.status(502).json({ error: 'Модель не вернула структурированную тренировку' });
    }
    console.log('GEN blocks:', toolUse.input?.blocks?.length,
      'ex per block:', toolUse.input?.blocks?.map(b => b.exercises?.length));

    return res.status(200).json({
      session: toolUse.input,
      player: snapshot.player,
      dataSummary,
      date: targetDate,
      dayGoal: bodyDayGoal,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ── Extracted prompt assembly (shared via buildGenerationInputs) ──────────────
function buildUserPrompt({ snapshot, sessionSummaries = [], rawSchedule = null, raw1RM = null, rawFeedbacks = [], targetDate, dayGoal = '', focus = 'inseason', notes = '', warmupSummary = '', teamUsedExercises = [] }) {
  const dataSummary = summarizeSnapshot(snapshot);
  const focusLabel = FOCUS_LABELS[focus] || focus;

  // Compute schedule proximity context
  function shiftDate(d, n) {
    const dt = new Date(d + 'T12:00:00');
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().slice(0, 10);
  }

  let scheduleContext = '';
  try {
    const events = rawSchedule
      ? JSON.parse(typeof rawSchedule === 'string' ? rawSchedule : JSON.stringify(rawSchedule))
      : [];
    if (events.length > 0) {
      const evMap = {};
      events.forEach(e => { evMap[e.date] = e.type; });

      let daysSinceLast = null, lastGameDate = null;
      for (let i = 1; i <= 7; i++) {
        if (evMap[shiftDate(targetDate, -i)] === 'game') { daysSinceLast = i; lastGameDate = shiftDate(targetDate, -i); break; }
      }

      let daysToNext = null, nextGameDate = null;
      for (let i = 1; i <= 21; i++) {
        if (evMap[shiftDate(targetDate, i)] === 'game') { daysToNext = i; nextGameDate = shiftDate(targetDate, i); break; }
      }

      const hasTravelSoon = evMap[shiftDate(targetDate, 1)] === 'travel' || evMap[shiftDate(targetDate, 2)] === 'travel';

      const lines = ['КОНТЕКСТ РАСПИСАНИЯ КОМАНДЫ (из календаря тренера):'];
      if (daysSinceLast) lines.push(`• Последняя игра: ${daysSinceLast} дн. назад (${lastGameDate})`);
      if (daysToNext) {
        lines.push(`• Следующая игра: через ${daysToNext} дн. (${nextGameDate})`);
        if (hasTravelSoon) lines.push('• ⚠ Перелёт в ближайшие 2 дня — засчитывай как игровой стресс-фактор, снижай нагрузку соответственно');
        if (daysSinceLast === 1) {
          lines.push('→ РЕЖИМ СЕССИИ: Восстановление (день после игры) — JLU=0, мобильность, без силовой нагрузки');
        } else if (daysToNext === 1 || (daysToNext === 2 && hasTravelSoon)) {
          lines.push('→ РЕЖИМ СЕССИИ: Мощностная активация (1-2 дня до игры / перелёт) — 30-40 мин, JLU ≤80, без накопительной усталости');
        } else {
          lines.push(`→ РЕЖИМ СЕССИИ: Силовой/накопительный (${daysToNext} дн. до игры) — полная нагрузка по фазе, JLU по лимиту фазы`);
        }
      } else {
        lines.push('• Ближайших игр в календаре нет (ближайшие 3 недели)');
      }
      scheduleContext = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' + lines.join('\n') + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    }
  } catch (_) {
    // Schedule unavailable — continue without it
  }

  // 1RM context
  const oneRM = raw1RM ? (() => { try { return typeof raw1RM === 'string' ? JSON.parse(raw1RM) : raw1RM; } catch(_) { return null; } })() : null;
  const ONE_RM_LABELS = { squat: 'Присед (трэп-штанга/гоблет)', rdl: 'Румынская тяга (одной ноги)', deadlift: 'Тяга с трэп-штангой', bench: 'Жим гантелей на скамье', ohp: 'Жим из фиксатора (Landmine)', pullup: 'Подтягивания (+кг)' };
  let onermContext = '';
  if (oneRM && Object.keys(oneRM).length > 0) {
    const lines = ['МАКСИМАЛЬНЫЕ ПОКАЗАТЕЛИ ИГРОКА (1ПМ) — рассчитывай точные кг в поле weightNote:'];
    for (const [key, label] of Object.entries(ONE_RM_LABELS)) {
      if (oneRM[key]) lines.push(`• ${label}: ${oneRM[key]} кг`);
    }
    lines.push('→ В weightNote пиши: "80% 1ПМ = 96 кг" (сам рассчитывай от указанного 1ПМ)');
    onermContext = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' + lines.join('\n') + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  }

  // Warmup context
  const warmupContext = warmupSummary
    ? `\nРАЗМИНКА СЕГОДНЯ (уже проведена — учти при составлении E-блока):\n${warmupSummary}\n→ Если разминка закрыла плечо/голеностоп — сделай E2/E3 короче (1 подход вместо 2), но не убирай зону совсем.\n`
    : '';

  // Recompute Hooper Wellness Index from snapshot (summarizeSnapshot returns a string)
  const _todayMorning = (snapshot.morning || []).find(d => d.date === targetDate) || null;
  const _lastSurvey = [...(snapshot.surveys || [])].filter(d => d.date <= targetDate).pop() || null;
  const hooper = (() => {
    const sleep = _todayMorning?.sleep;
    const stress = _todayMorning?.stress;
    const doms = _todayMorning?.doms;
    const soreness = _lastSurvey?.soreness;
    const components = [
      sleep != null ? (6 - sleep) : null,
      stress,
      doms,
      soreness,
    ].filter(v => v != null);
    if (components.length < 2) return null;
    return Math.round(components.reduce((a, b) => a + b, 0) * 10) / 10;
  })();
  const _hoopers7d = (snapshot.morning || []).filter(d => d.date < targetDate).slice(-7).map(m => {
    const s = (snapshot.surveys || []).find(sv => sv.date === m.date);
    const c = [
      m.sleep != null ? (6 - m.sleep) : null,
      m.stress,
      m.doms,
      s?.soreness,
    ].filter(v => v != null);
    return c.length >= 2 ? c.reduce((a, b) => a + b, 0) : null;
  }).filter(v => v != null);
  const _hooperBaseline = avg(_hoopers7d);
  const hooperDelta = (hooper != null && _hooperBaseline != null)
    ? Math.round((hooper - _hooperBaseline) * 10) / 10
    : null;

  // ACWR alert (recomputed from snapshot for alert context)
  const _chronicSurveys = snapshot.chronicSurveys || snapshot.surveys || [];
  const _manual = snapshot.manual || {};
  const _targetDate = targetDate;

  const _computeLoad = (survArr, manObj) => {
    const m = {};
    for (const s of survArr) {
      if (s.srpe != null) { m[s.date] = s.srpe * (s.duration ?? manObj[s.date]?.duration ?? 60); }
    }
    return m;
  };
  const _loadMap = _computeLoad(_chronicSurveys, _manual);

  const _shiftBack = (date, n) => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

  const _acuteLoad = Object.entries(_loadMap).filter(([d]) => d > _shiftBack(_targetDate, 7) && d <= _targetDate).reduce((s, [,v]) => s+v, 0);
  const _chronicLoad28 = Object.entries(_loadMap).filter(([d]) => d > _shiftBack(_targetDate, 28) && d <= _targetDate).reduce((s, [,v]) => s+v, 0) / 4;
  const _acwr = _chronicLoad28 > 0 ? Math.round((_acuteLoad / _chronicLoad28) * 100) / 100 : null;

  const _acuteJumps = Object.entries(_manual).filter(([d]) => d > _shiftBack(_targetDate, 7) && d <= _targetDate && _manual[d]?.jumps).reduce((s,[,v])=>s+(v.jumps||0),0);
  const _chronicJumps = Object.entries(_manual).filter(([d]) => d > _shiftBack(_targetDate, 28) && d <= _targetDate && _manual[d]?.jumps).reduce((s,[,v])=>s+(v.jumps||0),0) / 4;
  const _jumpACWR = _chronicJumps > 0 ? Math.round((_acuteJumps / _chronicJumps) * 100) / 100 : null;

  const _last7Loads = Object.entries(_loadMap).filter(([d]) => d > _shiftBack(_targetDate, 7) && d <= _targetDate).map(([,v]) => v);
  const _monotony = _last7Loads.length >= 4 ? (() => { const m = avg(_last7Loads); const sd = stdev(_last7Loads); return (m && sd && sd > 0) ? Math.round(m/sd*10)/10 : null; })() : null;
  const _strain = _monotony != null ? Math.round(_last7Loads.reduce((s,v)=>s+v,0) * _monotony) : null;

  let acwrAlert = '';
  if (_acwr != null) {
    if (_acwr > 1.5) {
      acwrAlert = `\n🔴🔴 ACWR = ${_acwr} (ОПАСНАЯ ЗОНА >1.5): объём A/B −30-40%, убрать взрывную нагрузку A2/B2 — только силовое. Риск травмы высокий.\n`;
    } else if (_acwr > 1.3) {
      acwrAlert = `\n🔴 ACWR = ${_acwr} (повышенный риск 1.3-1.5): не прогрессируй вес, объём −15%.\n`;
    } else if (_acwr < 0.8 && (snapshot.whoop || []).slice(-1)[0]?.recovery >= 67) {
      acwrAlert = `\n✅ ACWR = ${_acwr} (недогруз <0.8, Recovery в норме): можно добавить тренировочный стимул +10% к объёму или интенсивности.\n`;
    }
  }

  let jumpACWRAlert = '';
  if (_jumpACWR != null && _jumpACWR > 1.3) {
    jumpACWRAlert = `\n${_jumpACWR > 1.5 ? '🔴' : '⚠'} Прыжковый ACWR = ${_jumpACWR}: ${_jumpACWR > 1.5 ? 'убрать A2/B2 плиометрику' : 'A2 −25%'} (недельный объём ${_acuteJumps} прыжков).\n`;
  }

  let monotonyAlert = '';
  if (_monotony != null && _monotony > 1.5) {
    monotonyAlert = `\n⚠ Монотонность нагрузки (Foster) = ${_monotony}${_strain != null && _strain > 3000 ? `, Strain = ${_strain} — ВЫСОКИЙ РИСК ПЕРЕУТОМЛЕНИЯ` : ''}: варьируй интенсивность тяжёлый/лёгкий день активнее.\n`;
  }

  // Injury log context from structured medical records
  let injuryLogContext = '';
  const activeInjuries = (snapshot.injuryLog || []).filter(r => r.status === 'active' || r.status === 'monitoring');
  if (activeInjuries.length > 0) {
    const lines = ['⚕️ АКТИВНЫЕ МЕДИЦИНСКИЕ ЗАПИСИ (структурированный журнал):'];
    for (const r of activeInjuries) {
      const rtrStr = r.dateRTR ? ` | RTR: ${r.dateRTR}` : '';
      lines.push(`• ${r.bodyPart || '—'} — ${r.type || 'травма'} (тяжесть ${r.severity}/5, боль ${r.painLevel ?? '—'}/10, статус: ${r.status}${rtrStr})`);
      if (r.notes) lines.push(`  Контекст: ${r.notes}`);
    }
    lines.push('→ Исключи прямую нагрузку на эти зоны. До RTR-даты — никакой нагрузки на зону ни при каком условии.');
    injuryLogContext = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' + lines.join('\n') + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  }

  // Trainer annotations context
  let annotationsContext = '';
  if (snapshot.annotations) {
    const entries = [];
    const ann = snapshot.annotations;
    if (typeof ann === 'string' && ann.trim()) {
      entries.push(ann.trim());
    } else if (typeof ann === 'object') {
      for (const [key, val] of Object.entries(ann)) {
        if (val != null && String(val).trim()) entries.push(`${key}: ${String(val).trim()}`);
      }
    }
    if (entries.length) {
      annotationsContext = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 ЗАМЕТКИ ТРЕНЕРА:\n' +
        entries.map(e => `• ${e}`).join('\n') +
        '\n→ Учти эти заметки при составлении программы.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    }
  }

  // HRV Z-score alert: acute deviation from individual baseline
  const allWhoopToDate = (snapshot.whoop || []).filter(d => d.date <= targetDate);
  const hrvBaselineValues = allWhoopToDate.slice(0, -1).map(d => d.hrv).filter(v => v != null);
  const todayHrv = allWhoopToDate[allWhoopToDate.length - 1]?.hrv ?? null;
  let hrvTrendAlert = '';

  if (hrvBaselineValues.length >= 5 && todayHrv != null) {
    const mean = avg(hrvBaselineValues);
    const sd = stdev(hrvBaselineValues);
    if (mean != null && sd != null && sd > 0) {
      const z = (todayHrv - mean) / sd;
      if (z <= -1.5) {
        hrvTrendAlert = `\n🔴 HRV Z-SCORE КРАСНЫЙ ФЛАГ: сегодня ${todayHrv} мс — на ${Math.abs(z).toFixed(1)} SD ниже baseline (${Math.round(mean)} мс). Выраженное подавление ВНС — режим тонус+профилактика, никакой силовой прогрессии независимо от Recovery%.\n`;
      } else if (z <= -0.5) {
        hrvTrendAlert = `\n⚠ HRV ниже baseline: ${todayHrv} мс (Z=${z.toFixed(1)}, baseline ${Math.round(mean)} мс) — объём A/B −20%, без прогрессии нагрузки.\n`;
      }
    }
  } else {
    // Fallback to 3-day trend when baseline insufficient
    const recentWhoop = allWhoopToDate.slice(-4);
    if (recentWhoop.length >= 3) {
      const last3Hrv = recentWhoop.slice(-3).map(d => d.hrv).filter(v => v != null);
      if (last3Hrv.length === 3 && last3Hrv[0] > last3Hrv[1] && last3Hrv[1] > last3Hrv[2]) {
        hrvTrendAlert = `\n⚠ ТРЕНД HRV: снижение 3 дня подряд (${last3Hrv.join(' → ')} мс) — признак накопленной усталости. Объём A/B блоков −20–30%, не прогрессируй нагрузку.\n`;
      }
      const last3Recovery = recentWhoop.slice(-3).map(d => d.recovery).filter(v => v != null);
      if (!hrvTrendAlert && last3Recovery.length === 3 && last3Recovery[0] > last3Recovery[1] && last3Recovery[1] > last3Recovery[2]) {
        hrvTrendAlert = `\n⚠ ТРЕНД RECOVERY: снижение 3 дня подряд (${last3Recovery.join(' → ')}%) — возможна накопленная усталость. Будь консервативен с нагрузкой.\n`;
      }
    }
  }

  // Hooper alert
  const hoopers7dAlert = (() => {
    if (hooper == null) return '';
    if (hooperDelta != null && hooperDelta >= 3) {
      return `\n⚠ HOOPER INDEX: ${hooper}/20 — рост на ${hooperDelta} пунктов выше 7-дн. baseline. Самочувствие ухудшилось — снизь объём на 15%.\n`;
    }
    if (hooper >= 16) {
      return `\n🔴 HOOPER INDEX ${hooper}/20: очень низкое самочувствие. Объём −30%, приоритет профилактике.\n`;
    }
    if (hooper >= 13) {
      return `\n⚠ HOOPER INDEX ${hooper}/20: повышенная усталость. Объём −20%, осторожная прогрессия.\n`;
    }
    return '';
  })();

  // Auto-deload detection: session count + WHOOP strain analysis
  const highIntensityCount = sessionSummaries.filter(s => {
    const lower = s.toLowerCase();
    return !lower.includes('deload') && !lower.includes('восстановление') && !lower.includes('разгрузка');
  }).length;

  const allSurveys = (snapshot.surveys || []).filter(d => d.date <= targetDate);
  const last7Fatigue = allSurveys.slice(-7).map(d => d.fatigue).filter(v => v != null);
  const fatigueTrend = last7Fatigue.length >= 4 ? avg(last7Fatigue) : null;

  let deloadAlert = '';
  if (highIntensityCount >= 5) {
    deloadAlert = `\n⚠ АВТО-ДЕТЕКЦИЯ НАКОПЛЕНИЯ: ${highIntensityCount} интенсивных сессий подряд без разгрузки. Рассмотри снижение объёма на 30% или полный деload.\n`;
  } else if (fatigueTrend != null && fatigueTrend >= 4.0) {
    deloadAlert = `\n⚠ ХРОНИЧЕСКАЯ УСТАЛОСТЬ: средняя усталость за 7 дней = ${fatigueTrend}/5. Снизь объём сегодня на 20%, избегай прогрессии.\n`;
  }

  // Player feedback context
  const FEEL_LABELS = { easy: 'Легко', good: 'Хорошо', hard: 'Тяжело', very_hard: 'Очень тяжело' };
  let feedbackContext = '';
  if (rawFeedbacks.length > 0) {
    const lines = ['ОЦЕНКИ ТРЕНИРОВОК ОТ ИГРОКА (последние):'];
    for (const fb of rawFeedbacks) {
      let line = `• ${fb.date}: RPE ${fb.rpe}/10`;
      if (fb.feel) line += ` — ${FEEL_LABELS[fb.feel] || fb.feel}`;
      if (fb.note) line += ` — "${fb.note}"`;
      lines.push(line);
    }
    const last = rawFeedbacks[0];
    if (last.rpe >= 9) lines.push('→ Последняя тренировка очень тяжёлая: снизь объём на 15–20%, не прогрессируй нагрузку.');
    else if (last.rpe <= 5) lines.push('→ Последняя тренировка лёгкая: можно увеличить интенсивность или объём.');
    else if (last.rpe >= 7 && last.feel === 'very_hard') lines.push('→ Игрок отметил "Очень тяжело": будь консервативен с нагрузкой сегодня.');
    feedbackContext = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' + lines.join('\n') + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  }

  // Team exercise distribution context (batch generation)
  let teamExercisesContext = '';
  if (Array.isArray(teamUsedExercises) && teamUsedExercises.length > 0) {
    const counts = {};
    teamUsedExercises.forEach(name => { counts[name] = (counts[name] || 0) + 1; });
    const lines = ['УЖЕ НАЗНАЧЕНО ДРУГИМ ИГРОКАМ КОМАНДЫ СЕГОДНЯ (не дублируй оборудование и паттерны):'];
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, n]) => lines.push(`• ${name}: ${n} ${n === 1 ? 'игрок' : n < 5 ? 'игрока' : 'игроков'}`));
    lines.push('→ Выбирай ДРУГИЕ вариации того же паттерна из библиотеки. Избегай очередей к одному оборудованию (ящик, TRX, трэп-штанга, гири).');
    teamExercisesContext = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' + lines.join('\n') + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  }

  const historyBlock =
    sessionSummaries.length > 0
      ? `ИСТОРИЯ ПОСЛЕДНИХ ${sessionSummaries.length} СОХРАНЁННЫХ ТРЕНИРОВОК ИГРОКА:\n${sessionSummaries.join('\n\n')}\n\nНА ОСНОВЕ ИСТОРИИ — перед составлением определи:\n1. Какие векторы/паттерны получили нагрузку в последние 48–72 ч — избегай их или делай лёгкую работу в том же паттерне.\n2. Какой характер нагрузки преобладал в последних сессиях (силовой, объёмный, взрывной) — выбери другой для сегодняшней.\n3. Какие конкретные упражнения повторялись недавно — смени вариацию из библиотеки движений.\n4. Логика DUP: куда по волне нагрузки должна идти сегодняшняя сессия.\n5. Прогрессия: если есть weightNote по упражнению — применяй правило прогрессии.`
      : 'ИСТОРИЯ ТРЕНИРОВОК: нет сохранённых сессий для этого игрока — составь первую тренировку без привязки к предыдущим.';

  const userPrompt = `${dataSummary}
${onermContext}${warmupContext}${hrvTrendAlert}${hoopers7dAlert}${acwrAlert}${jumpACWRAlert}${monotonyAlert}${injuryLogContext}${annotationsContext}${deloadAlert}${feedbackContext}${teamExercisesContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${historyBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${scheduleContext}
Фаза подготовки: ${focusLabel}
Цель именно этой тренировки: ${dayGoal || 'не указана — ориентируйся на фазу подготовки и логику периодизации из истории'}
${notes ? `Комментарии тренера: ${notes}` : ''}

Составь ОДНУ тренировку в зале на ${targetDate} — не микроцикл, а конкретно эту сессию. Обязательно заполни все поля: tempo для каждого упражнения, rest_note для каждого блока, E-блок строго 3 упражнения (E1 + E4 всегда, третий слот по позиции). Для каждого упражнения заполни img_prompt кратким английским анатомическим описанием.`;

  return { userPrompt, dataSummary };
}
