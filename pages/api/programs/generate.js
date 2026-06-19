// pages/api/programs/generate.js
// POST { playerId, date, dayGoal, focus, notes, days=7 } → AI-generated gym session for one
// specific day. Claude receives: player bio-metrics for the target date, a trend window,
// AND a compact history of the player's last 10 saved sessions — enabling real periodization
// logic (load distribution, movement pattern rotation, DUP, no same-vector repetition).

import { getPlayerSnapshot, todayISO } from '../../../lib/playerData';
import { getRecentSessionSummaries } from '../../../lib/sessionHistory';
import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';

const FOCUS_LABELS = {
  pep_prep:        'PEP Подготовительная фаза (Weeks 1–3 × 5 дн/нед.) — базовая сила 70–80%, скоростная выносливость, темп Control→3-1-1, мост перед эксцентрическим лагерем',
  pep_phase2:        'PEP Phase 2 — Силовая мощь + Спринт + SAQ (Weeks 7–9, 4 дн/нед.) — Vertical Power / Sled Sprints / Horizontal Power / SAQ+Max Force; Нед.9: переход на одностороннее (Split Stance+SL прыжки, Single Arm B-блок, Overspeed Band)',
  pep_phase2_deload: 'PEP Phase 2 Деload (Неделя 10, 3 дн/нед.) — снижение объёма 50-60%, сохранение паттернов; Reaction Drop Chin-Up, Band Barbell Bench, Tricep Finisher, Depth Jump→Hurdles→SL Box Jump; финальная неделя перед Phase 3',
  pep_phase3:        'PEP Phase 3 (Weeks 11–14, 4 дн/нед.) — Linear Acceleration+Horizontal Power / COD+Horizontal Push Pull / Linear Speed+Vertical Power / COD-Reactive Agility+Vertical Push Pull; Wall Speed Mechanics → Top End Stick Drills (Нед.13+); PAP B-кластер 10-сек покой; Rapid Pull D-кластер; когнитивные реактивные дрилы; Нед.13-14: SL прыжки/Box Rocker/GHD/Sled Push → Bounds → Light Sled/3-Point Stance/Landmine Rotational Jerk',
  pep_phase3_deload: 'PEP Phase 3 Деload (Неделя 15, 4 дн/нед.) — активное снижение объёма при сохранении паттернов; Hop Back→Light Sled, Alternating Split Jump→Sprint, SL Hurdle Hops→Board Jump, DB Bulgarian Split Squat, GHD Nordic Curl+Overspeed Chest Pass; Top End Stick Drills; Flow Skip+Rapid Response разминка Дня 4; финальная неделя Phase 3 перед Eccentric Camp',
  zvs_struct:         'ЗВС Фаза 1 — Структурная подготовка (нед. 1-2, 13-26 июля) — суставная подготовка, механика приземления, изометрия сухожилий (Spanish Squat), аэробная база; RPE 5-6; JLU ≤200; приоритет профилактики: колени+голеностоп+поясница+плечи',
  zvs_strength_base:  'ЗВС Фаза 2 — Силовая база (нед. 3-4, 27 июля — 9 августа) — двусторонние паттерны под нагрузкой (присед, RDL, жим, тяга), первые PAP-пары (75-80%→Box Jump), механика разбега без нагрузки; RPE 7-8; JLU ≤350; Nordic Curl эксцентрик',
  zvs_power_transfer: 'ЗВС Фаза 3 — Мощность и перенос (нед. 5-6, 10-25 августа) — полные PAP-кластеры (80-87.5%→Depth+Approach Jump), Resisted Approach Jump, блокирующий кластер (Lateral Bound→bilateral Box Jump), позиционная работа; тейпер нед.6; RPE 8-9; JLU ≤500',
  zvs_strength_day:   'ЗВС Сезон: Силовой день (3+ дней до игры) — 55-65 мин, накопление, тяжёлые PAP-кластеры 80-85%, JLU ≤120; B/D блоки адаптированы под позицию игрока; Nordic Curl 2×3',
  zvs_power_day:      'ЗВС Сезон: Мощностной день (1-2 дня до игры) — 30-40 мин MAX, нейронная активация, взрывные кластеры 85-90%, JLU ≤80; никакой накопительной усталости; сокращённый E-блок',
  zvs_recovery:       'ЗВС Сезон: Восстановление (день после игры) — 30-40 мин, JLU=0, мобильность+тканевая работа+лёгкая изометрия; расширенный E-блок профилактики всех 4 зон',
  zvs_deload:         'ЗВС Сезон: Деload неделя (каждые 6 недель) — объём -50%, паттерны сохранены, JLU ≤100; E-блок профилактики не сокращается',
  eccentric_camp:    'СБОРЫ — Эксцентрическая фаза (недели 1–3 × 3 тр/нед.) + контрастный метод',
  eccentric_deload: 'СБОРЫ — Деload Эксцентрической фазы (неделя 4) — восстановление + шлифовка техники',
  isometric_camp:  'СБОРЫ — Изометрическая фаза (недели 5–7 × 4 тр/нед.) + контрастный метод',
  isometric_deload: 'СБОРЫ — Деload Изометрической фазы (неделя 8) — восстановление + шлифовка техники',
  concentric:      'СБОРЫ — Концентрическая / взрывная фаза — реализация силы, перенос в прыжок',
  preseason:       'предсезонная подготовка — база силы и объёма',
  inseason:        'игровой период — поддержание формы, минимизация утомления',
  power:           'развитие взрывной силы и прыжка',
  strength:        'максимальная силовая база',
  rehab:           'возврат после травмы / разгрузка',
};

const SESSION_TOOL = {
  name: 'build_session',
  description: 'Структурированная тренировка в зале на один конкретный день, разбитая на блоки (круги/суперсеты).',
  input_schema: {
    type: 'object',
    required: ['assessment', 'periodization_note', 'blocks', 'warnings'],
    properties: {
      assessment: {
        type: 'string',
        description: 'Краткая оценка состояния игрока на сегодня, 2-3 предложения. Укажи, если каких-то данных нет.',
      },
      periodization_note: {
        type: 'string',
        description: 'Обоснование логики этой тренировки в контексте истории: что было в прошлых сессиях, почему выбран именно такой акцент/вектор/характер нагрузки сегодня. 2-4 предложения.',
      },
      blocks: {
        type: 'array',
        description: 'Блоки тренировки по порядку. Каждый блок — круг/суперсет из 1–4 упражнений (A1→A2→A3→пауза→повтор круга). Обычно 3–5 блоков.',
        items: {
          type: 'object',
          required: ['label', 'exercises'],
          properties: {
            label: { type: 'string', description: 'Буква блока: A, B, C, D...' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                required: ['code', 'name', 'targetSets', 'cue'],
                properties: {
                  code: { type: 'string', description: 'A1, A2, A3...' },
                  name: { type: 'string', description: 'Название упражнения на русском' },
                  targetSets: {
                    type: 'array',
                    description: 'Целевые повторения по подходам, например ["5","5","5"] или ["8","8","8","8"]. 3–5 элементов.',
                    items: { type: 'string' },
                  },
                  weightNote: {
                    type: 'string',
                    description: 'Нагрузка: RPE, %1ПМ или качественный descriptor ("среднее отягощение"). Конкретные кг — только если тренер указал в комментариях.',
                  },
                  cue: {
                    type: 'string',
                    description: 'Одна короткая императивная техническая подсказка в стиле пометки тренера.',
                  },
                },
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

function avg(arr) {
  const vals = arr.filter(v => v != null && !Number.isNaN(v));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function onDay(arr, date) {
  return arr.find(r => r.date === date) || null;
}

function fmt(field, value, suffix = '') {
  return `• ${field}: ${value != null ? value + suffix : 'нет данных'}`;
}

function summarizeSnapshot(snap) {
  const { player, whoop, surveys, morning, neuro, periodDays, targetDate } = snap;

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
          fmt('Стресс вне зала', todayMorning.stress, '/5'),
          fmt('Крепатура утром', todayMorning.doms, '/5'),
        ].join('\n')
      : '• Утренний чек-ин за этот день не заполнен.',
    lastSurvey
      ? `• Последний вечерний опросник (${lastSurvey.date}): sRPE ${lastSurvey.srpe ?? '—'}/10, усталость ${lastSurvey.fatigue ?? '—'}/5, крепатура ${lastSurvey.soreness ?? '—'}/5`
      : '• Вечерних опросников в доступном окне нет.',
    recentInjury
      ? `• ⚠ Травма ${recentInjury.date}: область ${(recentInjury.injuryAreas || []).join(', ') || '—'}, боль ${recentInjury.pain_level}/10. ${recentInjury.injuryText || ''}`
      : '• Активных травм не зафиксировано.',
    '',
    `Тренд за предыдущие ${periodDays} дней:`,
    `• Recovery (средн.): ${trendRecovery != null ? trendRecovery + '%' : 'нет данных'}`,
    `• ВСР (средн.): ${trendHrv != null ? trendHrv + ' мс' : 'нет данных'}`,
    `• Strain (средн.): ${trendStrain ?? 'нет данных'}`,
    `• sRPE (средн.): ${trendSrpe != null ? trendSrpe + '/10' : 'нет данных'}`,
    `• Усталость (средн.): ${trendFatigue != null ? trendFatigue + '/5' : 'нет данных'}`,
    `• MWS (средн.): ${trendMws != null ? trendMws + '%' : 'нет данных'}`,
  ];

  if (neuro) {
    lines.push('', 'Нейромышечное тестирование (последние замеры):', JSON.stringify(neuro, null, 2));
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `Ты — элитный тренер по силовой и кондиционной подготовке (S&C) мирового уровня, специализирующийся на волейболе профессионального уровня. Твои решения основаны на научно обоснованных методах периодизации, данных мониторинга нагрузки и практике топовых S&C-тренеров (ВНЛ, Суперлига, национальные сборные).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
СТРУКТУРА СЕССИИ И ТАЙМИНГ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

СТАНДАРТНАЯ СЕССИЯ: 70 МИНУТ — 5 БЛОКОВ.

ВНЕ СБОРОВ (обычный период):
  Блок A — ВЗРЫВ / ПЛИОМЕТРИКА (ВСЕГДА первый) — 12–15 мин
  Блок B — НИЖНЕЕ ТЕЛО основное — 15–18 мин
  Блок C — ВЕРХНЕЕ ТЕЛО основное — 15–18 мин
  Блок D — ВСПОМОГАТЕЛЬНЫЙ (нижнее или верхнее, чередуй) — 12–15 мин
  Блок E — КОР / ПРОФИЛАКТИКА (ВСЕГДА последний) — 10–12 мин
  Итого: ~64–78 мин.

В СБОРАХ (эксцентрика / изометрика / концентрика):
  Блок A — FVC-БЛОК (A1→A2→A3→A4, 3–4 сета, 4–5 мин отдыха) — 20–25 мин
  Блок B — НИЖНЕЕ ТЕЛО основное с контрастной парой — 14–16 мин
  Блок C — ВЕРХНЕЕ ТЕЛО основное с контрастной парой — 14–16 мин
  Блок D — ВСПОМОГАТЕЛЬНЫЙ (1–2 упражнения без излишнего объёма) — 8–10 мин
  Блок E — КОР / ПРОФИЛАКТИКА (ВСЕГДА последний) — 8–10 мин
  Итого: ~64–77 мин.

Строго 5 блоков — не больше. Прехаб плеча встроен в отдых FVC-блока (не отдельный блок).

ЖЁСТКОЕ ПРАВИЛО ЧЕРЕДОВАНИЯ: силовые блоки B, C, D строго чередуются нижнее↔верхнее.
Никогда два подряд нижних или двух подряд верхних в одной сессии.
Блок A (взрыв) и блок E (профилактика) — позиция фиксирована, не менять.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
НЕДЕЛЬНЫЙ КОНТЕКСТ НАГРУЗКИ (СБОРЫ)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Помимо зальных тренировок команда выполняет 3 кондиционные сессии в неделю:
• Линейная скорость — высокая ЦНС-нагрузка, максимальные спринты. После этой сессии или перед ней — снижай объём нижнего тела в зале, взрывная работа уже была/будет.
• Смена направления (COD) — высокая нагрузка на колено и голеностоп. Не ставить тяжёлую одностороннюю работу на нижнее тело в тот же день или следующий день.
• Выносливость — высокий метаболический объём, истощает гликоген. После этой сессии снижай общий объём зала и интенсивность.

Если тренер указал в комментариях какая кондиционная сессия была сегодня или будет завтра — обязательно учти это при выборе объёма и векторов нижнего тела.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ВЕКТОРЫ И ПАТТЕРНЫ ДВИЖЕНИЯ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

НИЖНЕЕ ТЕЛО:
• Присед (knee-dominant): приседание, болгарский сплит-присед, выпад, степ-ап, пистолет
• Шарнир (hip-dominant): румынская тяга, становая тяга, толчок бедра, гиперэкстензия
• Унилатеральное: болгарский сплит, выпад на одной, прыжок на одной ноге

ВЕРХНЕЕ ТЕЛО:
• Горизонтальный жим: жим лёжа, отжимания, жим гантелей лёжа
• Горизонтальная тяга: тяга штанги/гантели в наклоне, тяга к поясу
• Вертикальный жим: жим над головой, жим гантелей стоя
• Вертикальная тяга: подтягивания, тяга верхнего блока
• Профилактика плеча: ротаторная манжета, Y/T/W, тяга резинки — каждую сессию

ВЗРЫВНАЯ / РЕАКТИВНАЯ: прыжки, дроп-джампы, броски медбола, рывок, толчок, горизонтальные прыжки

КОР / СТАБИЛИЗАЦИЯ: планка, мёртвый жук, паллоф-пресс, птица-собака, боковая планка

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ТРЁХФАЗНЫЙ ТРЕНИНГ СБОРОВ (Методология PEP — Pierre's Elite Performance)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ЗАПИСЬ ТЕМПА: Эксцентрика–Пауза_внизу–Концентрика–Пауза_вверху (сек, X = максимально быстро)

ПО ТРЕНЕРСКОМУ КОММЕНТАРИЮ — определи тип дня:
• Для эксцентрической фазы: День A (субмакс), День B (максимальный), День C (объёмный лёгкий)
• Для изометрической фазы: День 1 (верх субмакс), День 2 (низ субмакс), День 4 (верх макс), День 5 (низ макс)
• Если тип дня не указан — ориентируйся на историю сессий и логику чередования.

──────────────────────────────────
FVC-БЛОК (Континуум Силы-Скорости, блок A) — СТАНДАРТ ДЛЯ СБОРОВ
──────────────────────────────────
В лагерные фазы (эксцентрика + изометрика) БЛОК A строится по принципу FVC (Force-Velocity Continuum) из 4 упражнений:

  A1 — Максимальная сила: тяжёлое упражнение с управляемой эксцентрикой (5 сек опускание) или изо-паузой — 78–95% 1ПМ
  A2 — Взрывная масса тела: прыжок, скок, или ОТЯ (Olympic lift variation) — сразу после A1
  A3 — Скоростная сила: то же движение что A1, но 30–40% от нагрузки A1, максимальная скорость выполнения
  A4 — Реактивная/баллистическая: бросок медбола, дроп-джамп, спринт, прыжок с резиной

ТАЙМИНГ FVC-БЛОКА:
• 20–30 сек между упражнениями внутри блока (A1→A2→A3→A4)
• 4–5 МИН отдыха между полными сетами FVC (после A4 → следующий раунд A1)
• Во время отдыха FVC-блока — ротация плеча наружу ×8 каждую сторону (это прехаб, не тратит доп. время)
• ИТОГО: 3–4 сета всего FVC-блока = ~20–25 мин (это блок A)

ПРИМЕР FVC-блока для нижнего тела (эксцентрическая фаза, День A):
  A1: Приседание со штангой 5-0-X-0, 80% 1ПМ × 4 повт.
  A2: Прыжок в глубину (Drop Jump) — 4 повт., сразу после A1
  A3: Приседание с гирей/малым весом (30% A1) максимально быстро — 5 повт.
  A4: Прыжок с резиной (assisted jump) или спринт 10 м — 4 повт.
  → Отдых 4–5 мин (ротация плеча) → повторить 3–4 раза

──────────────────────────────────
ФАЗА 1 — ЭКСЦЕНТРИЧЕСКАЯ (4 недели × 3 тр/нед. — PEP Weeks 1–4)
──────────────────────────────────
ЦЕЛЬ: адаптация мышечно-сухожильного аппарата, профилактика травм, гипертрофия через механическое напряжение, активация вставочных нейронов.

СТРУКТУРА НЕДЕЛИ: 3 дня — День A (субмакс) / День B (максимальный) / День C (объёмный лёгкий)

◆ ДЕНЬ A — СУБМАКСИМАЛЬНЫЙ (средняя интенсивность):
  • Интенсивность A1: Нед.1→78.5% | Нед.2→80% | Нед.3→82.5% 1ПМ
  • Повторений A1: 4–5 повт. × 3–4 подхода
  • Темп нижнее тело: 5-0-X-0 (5 сек опускание, взрывной подъём)
  • Темп верхнее тело: 4-0-X-0 или 5-0-X-0
  • Блок A строится как FVC-блок (A1→A2→A3→A4)
  • Блоки B/C/D — контрастные пары: эксцентрика (темп) + взрывное движение

◆ ДЕНЬ B — МАКСИМАЛЬНЫЙ (высокая интенсивность):
  • Интенсивность A1: Нед.1→85% | Нед.2→87.5% | Нед.3→87.5% 1ПМ
  • Повторений A1: 3–4 повт. × 3–4 прямых подхода, взрывное намерение в каждом повторении
  • ⚠ Никаких кластерных сетов — только прямые подходы с полным восстановлением (3-4 мин между подходами)
  • В A1 на День B — НЕ ИСПОЛЬЗОВАТЬ медленную эксцентрику (только реактивный темп X-0-X-0)
  • FVC-блок обязателен

◆ ДЕНЬ C — ОБЪЁМНЫЙ ЛЁГКИЙ (низкая интенсивность, высокий объём):
  • Интенсивность: 75–80% 1ПМ (как Нед.1 День A)
  • Повторений: 6–8 × 4 подхода
  • Темп: 5-0-X-0 (умеренный, акцент на качество)
  • FVC-блок с более лёгкими нагрузками A1

ПРАВИЛА ЭКСЦЕНТРИЧЕСКОЙ ФАЗЫ (критические):
  ✗ НИКОГДА эксцентрическая нагрузка >85% 1ПМ (риск травмы сухожилий)
  ✓ ВСЕГДА завершать эксцентрическое движение взрывной концентрикой (PAP-эффект)
  ✓ Пауза в нижней точке — только на субмаксимальных днях (75–85%)
  ✓ Прехаб плеча во время отдыха FVC — обязательно каждую сессию

КОНТРАСТНЫЙ МЕТОД В БЛОКАХ B/C/D:
  Нижнее: Болгарский сплит 5-0-X-0 (4×5, ~80%) → Прыжок на одной (4×4) — немедленно
  Верхнее: Жим лёжа 5-0-X-0 (4×5, ~80%) → Бросок медбола от груди (4×4) — немедленно
  Отдых после пары: 90–120 сек перед следующей парой

──────────────────────────────────
ФАЗА 2 — ИЗОМЕТРИЧЕСКАЯ (4 недели × 4 тр/нед. — PEP Weeks 5–8)
──────────────────────────────────
ЦЕЛЬ: нейральная адаптация, сила в специфических углах волейбольного движения, PAP-эффект через изометрию перед взрывом.

СТРУКТУРА НЕДЕЛИ: 4 дня — День 1 (верх субмакс) / День 2 (низ субмакс) / ОТДЫХ / День 4 (верх макс) / День 5 (низ макс)

◆ ДЕНЬ 1 — ВЕРХНЕЕ ТЕЛО СУБМАКСИМАЛЬНОЕ:
  • Интенсивность: Нед.1→78.5% | Нед.2→80% | Нед.3→82.5% 1ПМ
  • Изо-пауза: 3–5 сек в специфической точке (жим лёжа — удержание на груди, тяга — пиковое сокращение)
  • Темп: 2-3-X-0 (2 сек опускание, 3 сек пауза, взрывная концентрика)
  • Повторений: 3–5 × 3–4 подхода
  • FVC-блок A с изо-вариацией A1 (напр. паузный жим или паузная тяга верхнего блока)
  • Блок B — нижнее тело вспомогательное без изометрии (для чередования)

◆ ДЕНЬ 2 — НИЖНЕЕ ТЕЛО СУБМАКСИМАЛЬНОЕ:
  • Интенсивность: те же прогрессии (78.5→80→82.5%)
  • Изо-пауза в волейбольных углах: присед — удержание на 90° (прыжковая позиция); РДТ — нижняя точка; болгарский — параллель
  • Темп: 2-4-X-0 (паузное приседание) или 2-5-X-0 (паузный болгарский)
  • FVC-блок A с изо-приседом/болгарским в A1
  • PAP-пара после A1: дроп-джамп или прыжок в высоту — сразу, отдых после пары

◆ ДЕНЬ 3 — ПОЛНЫЙ ОТДЫХ (не менять)

◆ ДЕНЬ 4 — ВЕРХНЕЕ ТЕЛО МАКСИМАЛЬНОЕ:
  • Интенсивность: 85–87.5% 1ПМ
  • В A1 — НИКАКОЙ изометрии или медленной эксцентрики (только реактивный темп X-0-X-0)
  • Прямые подходы 3×3-4, полный отдых 3-4 мин между подходами, взрывное намерение
  • FVC-блок обязателен; A1 = жим/тяга в реактивном темпе

◆ ДЕНЬ 5 — НИЖНЕЕ ТЕЛО МАКСИМАЛЬНОЕ:
  • Интенсивность: 85–87.5% 1ПМ
  • В A1 — НИКАКОЙ изометрии или медленной эксцентрики (только X-0-X-0)
  • Прямые подходы 3×3-4, полный отдых 3-4 мин, взрывное намерение в каждом повторении
  • FVC-блок обязателен

ВОЛЕЙБОЛЬНЫЕ УГЛЫ ДЛЯ ИЗОМЕТРИИ (критически важно):
  Изометрическая сила переносится ТОЛЬКО в пределах ±5–10° от тренируемого угла.
  → Присед: удержание на 90° (угол толчка при прыжке с разбега)
  → РДТ: нижняя точка (посадка после блока)
  → Болгарский сплит: ~100–110° в колене (реакция на одной ноге)
  → Жим лёжа: удержание у груди (передача силы через блок)
  → Тяга в наклоне: пиковое сокращение (мышцы спины в атаке)
  ВСЕГДА тренируй изометрию в самом слабом/специфичном для волейбола угле.

ПРАВИЛА ИЗОМЕТРИЧЕСКОЙ ФАЗЫ (критические):
  ✗ НИКОГДА изометрическая нагрузка >85% 1ПМ (нейральное переутомление)
  ✗ НЕ СОВМЕЩАТЬ изометрию и медленную эксцентрику в одном упражнении на максимальных днях (Дни 4/5)
  ✓ ВСЕГДА завершать изометрическое удержание взрывной концентрикой — это "отпускание пружины"
  ✓ Прехаб плеча в отдыхе FVC — обязательно (ротация наружу ×8/сторону, 20–30 сек)
  ✓ Изометрия = "сцепление" между эксцентрикой и концентрикой, нейральный мост

ПРОГРЕССИЯ ПО НЕДЕЛЯМ:
  Нед. 1: 3×4 повт., пауза 3 сек, 78.5% — освоение позиции и дыхания
  Нед. 2: 4×4 повт., пауза 4 сек, 80% — накопление нейральной адаптации
  Нед. 3: 4×3 повт., пауза 5 сек, 82.5% — пик изометрической интенсивности

──────────────────────────────────
ФАЗА 3 — КОНЦЕНТРИЧЕСКАЯ / ВЗРЫВНАЯ (3 недели × 4 тр/нед. — PEP Weeks 9–11 "Blast OFF")
──────────────────────────────────
ЦЕЛЬ: реализация накопленной эксцентрической и изометрической силы в RFD (скорость развития усилия). Максимизация взрывной мощи, прямой перенос в прыжок и игровые движения.
КЛЮЧЕВОЙ ПРИНЦИП: скорость выполнения = показатель качества. Если штанга движется медленно на 3–4 повторении — снизь вес или сократи повторения. Медленный подход не тренирует ЦНС. "Quality not Quantity".

СТРУКТУРА НЕДЕЛИ: 4 тренировки (Дни 1/2 — субмакс, День 3 — ОТДЫХ, Дни 4/5 — максимальные, Сб/Вс — ОТДЫХ)

PRE-CORE ACTIVATION (10 мин перед каждой сессией, в концентрической фазе):
  1 сет × 3-5/сторону: Band Resisted Dead Bug Plate Perturbation Press (вдох 5 сек, выдох 5 сек)
  1 сет × 6-8/ногу: Elevated Swiss Ball Sprinter Knee Switch
  1 сет × 8-10/сторону: Side Plank With Band Hip Flexion
  1 сет × 8-10: Band Resisted External Rotation to "Y" Press (инициация — ретракция лопатки)

◆ ДНИ 1 (верх) и 2 (низ) — СУБМАКСИМАЛЬНЫЕ:
  • Интенсивность A1: Нед.9→80% | Нед.10→80% | Нед.11→82.5% 1ПМ
  • Темп: X-0-X-0 — БЫСТРАЯ РЕАКТИВНАЯ концентрика (никакой медленной эксцентрики!)
  • Повторений A1: 4–5 повт. × 3–4 сета
  • Отдых между сетами: 1.5–2 мин; 15–30 сек между упражнениями внутри блока
  ⚠ Если скорость падает на 3–4 повторении → снизь вес или обрежь сет на 1-2 повт.

◆ ДНИ 4 (верх) и 5 (низ) — МАКСИМАЛЬНЫЕ (прямые подходы, взрывное намерение):
  • Интенсивность A1 (верх):  Нед.9→85%×3-4 | Нед.10→87.5%×3 | Нед.11→87.5%×3
  • Интенсивность A1 (низ):   Нед.9→85%×3-4 | Нед.10→87.5%×3 | Нед.11→87.5%×3
  • Прямые подходы 3×3-4, каждое повторение с максимальным намерением скорости (velocity intent)
  • Отдых между подходами: 3-4 мин полного восстановления
  ✗ НЕ применять эксцентрику или изометрию в A1 на максимальных днях 4 и 5

FVC-БЛОК КОНЦЕНТРИЧЕСКОЙ ФАЗЫ:

  ДЕНЬ 1 — Верхнее тело субмакс (4 упражнения, A1→A4):
    A1: Наклонный жим штанги лёжа (Incline Bench) — 80/80/82.5%, 4-5 повт., реактивный
    A2: Decline Plyometric Push-Ups ноги возвышены — 4 повт., быстрый отрыв от пола
    A3: Quick Switch Explosive Landmine Press — 20-30% от A1, 4 повт., максимальная скорость
    A4: Band Assisted Decline Plyometric Push-Ups — 4 повт., реактивные
    Во время отдыха FVC: Foot Arch Strengthening ×10-20/сторону

  ДЕНЬ 2 — Нижнее тело субмакс (2 упражнения, упрощённый FVC):
    A1: Приседание (задний/передний/Trap Bar) — 80/80/82.5%, 4-5 повт., быстрая концентрика, чуть ниже 90°
    A2 (PAP, сразу): Hurdle Jumps ×4 → Sled Sprint 10 ярдов → Спринт 10 ярдов
    Во время отдыха FVC: Наружная ротация плеча ×8/сторону (стандартный прехаб)

  ДЕНЬ 4 — Верхнее тело максимальное (2 упражнения):
    A1: Жим штанги лёжа — 90/92.5/95%, кластерные сеты (1 повт. + 20-30 сек + 1 повт.), реактивный
    A2 (PAP, сразу): Однорукий бросок медбола от груди — 4×5, взрывной
    Во время отдыха FVC: Растяжка нижнего тела или раскатка

  ДЕНЬ 5 — Нижнее тело максимальное (2 упражнения):
    A1: Приседание (задний/передний/Trap Bar) — 90/92.5/92.5%, кластерные сеты, реактивный
    A2 (PAP, сразу): Explosive Box Drop Jump — 4×3, быстрый контакт с землёй
    Во время отдыха FVC: Band chaos barbell wrist rolls ×8/сторону

ТИПОВЫЕ ВСПОМОГАТЕЛЬНЫЕ УПРАЖНЕНИЯ (Блоки B-D, 1.5 мин между сетами):

  Верхнее тело (Дни 1 и 4):
    B1: Box Elevated DB Explosive Split Stance Clean to Switch Stance Press — 3×4-5/ст.
    B2: Box Elevated Explosive Single Leg Knee Drive to Row — 3×6-8/ст.
    C1: Band Chaos Push-Ups (вариации) — 3×10-12
    C2: Quadruped Bench KB Row With Drop And Catch — 3×8-10/ст.
    D1: Empty the Can Shoulder Rotation — 3×6/ст.
    D2: Band Chaos Single Arm Farmers Carries — 3×20 ярдов/рука
    (Максимальный день 4, дополнительно): Explosive Band Resisted Pull-Ups 3×5; Landmine Twist + Explosive Press 3×6-8/ст.; KB Chaos Bicep Curls 3×12-15

  Нижнее тело (Дни 2 и 5):
    B1: Landmine Lateral Skater Lunge + Lateral Skater Jumps (контраст!) — 3×6-8
    C1: 45 Degree Warrior Lunge — 3×6/ст.
    C2: Single Leg Hamstring Curl — 3×8-10/ногу
    D1: Side Plank Adductor Hold With Row — 3×8-10/ст.
    D2: Elevated Hip Flexor Eccentric Prone — 3×8-10/ст.
    (Максимальный день 5, дополнительно): DB Bulgarian Split Squat → BW Bulgarian Split Squat Jumps (PAP) 3×5; Band Over-Speed KB Swings 3×12; Back Extension 3×20+20 сек удержание

ПРАВИЛА КОНЦЕНТРИЧЕСКОЙ ФАЗЫ:
  ✗ НЕ применять медленную эксцентрику или изометрию в A1 на Днях 4 и 5
  ✓ Скорость штанги — главный KPI качества: нет скорости = нет результата
  ✓ Если подъём занимает 4-8 сек → вес слишком большой, снизить немедленно
  ✓ День 3 — ОБЯЗАТЕЛЕН полный отдых, не менять
  ✓ Пре-кор активация перед каждой сессией — обязательна (10 мин)
  ✓ Прехаб плеча в отдыхе FVC (ротация наружу ×8/сторону) — как в предыдущих фазах

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ДЕLOAD-НЕДЕЛЯ (PEP — неделя 4 эксцентрики / неделя 8 изометрики)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЦЕЛЬ: нейральное и мышечное восстановление, шлифовка техники, работа над слабыми звеньями.
Сверхнагрузка вызывает адаптацию только при наличии восстановления — без деload'а прогресс останавливается.

ПРИНЦИПЫ ДЕLOAD'А (PEP):
• Оставить те же паттерны движений (сохранение нейромышечных путей)
• Снизить ЛИБО интенсивность до 50–60% от рабочего веса (при нормальном объёме)
• ЛИБО снизить объём до 50–60% от нормального (при нормальном весе)
• Использовать деload для чистки техники в основных упражнениях
• ЦНС должна восстановиться — не перегружать нервную систему!

СТРУКТУРА ДЕLOAD-ДНЯ (3 тренировки):

◆ ДЕLOAD ДЕНЬ 1 (Нижнее тело — акцент ПРИСЕД):
  • A1: Приседание (передний или задний) — 3–4×5, 50–60% рабочего веса
    - Эксцентрическая деload: сохрани 5-сек опускание, взрывной подъём
    - Изометрическая деload: 5-сек пауза в нижней точке, взрывной подъём
  • A2: Прыжок (Tuck Jump или Hurdle Jump) — 4×5, быстрый контакт с землёй
  • Отдых 4 мин между парами A1-A2
  • Блоки B–E: Circuit Series — 20–30 мин, лёгкая нагрузка, комплексы без штанги

◆ ДЕLOAD ДЕНЬ 2 (Верхнее тело — акцент ЖИМ ЛЁЖА):
  • A1: Жим штанги лёжа — 3–4×5, 50–60% рабочего веса
    - Эксцентрическая деload: 5-сек опускание, взрывной жим
    - Изометрическая деload: 5-сек пауза на груди, взрывной жим
  • A2: Бросок медбола от груди — 3–4×6, максимально взрывной
  • Отдых 4 мин между парами A1-A2
  • Circuit: Nickels & Dimes — 5 подтягиваний + 10 отжиманий каждую минуту, 5–10 мин

◆ ДЕLOAD ДЕНЬ 3 (Нижнее тело — акцент СПЛИТ-ПРИСЕД):
  • A1: Сплит-присед штангой — 3–4×5, 50–60%
    ⚠ ВАЖНО: БЕЗ ЭКСЦЕНТРИКИ в A1 — только БЫСТРЫЙ РЕАКТИВНЫЙ темп (X-0-X-0)
    (Это правило действует как в деload, так и в обычной День C / низкоинтенсивной тренировке)
  • A2: Прыжки со сменой ног (Split Stance Alternating Jumps) — 3–4×6
  • Circuit: лёгкие комплексы на нижнее тело без нагрузки

КРИТИЧЕСКОЕ ПРАВИЛО ДНЯ 3 (применяется ВСЕГДА, не только в деload):
  ✗ НИКОГДА медленной эксцентрики в A1 на низкоинтенсивный / третий день
  ✓ A1 = реактивный, быстрый, лёгкий (50–60% или меньше)
  ✓ Цель этого дня — скорость выполнения, НЕ накопление нагрузки

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PEP PREPARATION PHASE — Подготовительная фаза перед сборами (Weeks 1–3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
МЕСТО В МЕТОДИКЕ: После GOATA Strength Phase 3, ПЕРЕД началом эксцентрического лагеря.
НАЗНАЧЕНИЕ: Закладка силовой базы, скоростной выносливости и атлетических качеств.
ЧАСТОТА: 5 дней/неделю — 2 зала (Дн.1, Дн.3) + 2 скоростных (Дн.2, Дн.5) + 1 реактивность/ловкость (Дн.4)

СТРУКТУРА НЕДЕЛИ:
  День 1 — Зал (Preparation): PEP Warm-Up → Pre-Activation → Trap Bar DL + Верх (Bench/Row)
  День 2 — Скоростная выносливость: Sprint Mechanics + Acceleration + 100-ярдовые пробежки (5-6 × 100 yards, 5 мин отдыха)
  День 3 — Зал (Preparation): PEP Warm-Up → Pre-Activation → Squat + OHP + Pull-Ups
  День 4 — Реактивность и ловкость: COD/Agility + короткий силовой блок (Hip Thrust / Hip Fly / Suitcase Carry)
  День 5 — Скоростная выносливость: Sprint Mechanics + 250/200/150 м или 25–30-секундные отрезки × 8–10

PEP GYM WARM-UP (использовать в Дн.1 и Дн.3):
  Myofascial: Barbell Smash Calf Rolling (1 × 1 мин/сторона)
  Flexibility: Ankle Calf Stretch (1 × 5×5 сек/нога)
  Dynamic Mobility: Elevated Band Distraction Ankle Mobility / Calf Heel Walk / Ballistic Hip Hinge /
    Cross Body Pull + Hamstring Kick / High Knee Pull Lunge & Reach (всё по 1×10 yards)
  Glute Activation: Lateral Push Step + Lateral Skip & Reach (1 × 20 yards/сторона)
  Arm Mechanics: Kneeling Arm Swings (2×15 сек: 50%→75%→100%)
  Deceleration: Deceleration Break Down (2×20 yards)

PRE-ACTIVATION ДЛЯ НИЖНЕГО ТЕЛА (Дн.1):
  Band Sprinter Knee Drive (3×10), Copenhagen Adductor Squeeze External Rotation (3×10)

PRE-ACTIVATION ДЛЯ НИЖНЕГО ТЕЛА (Дн.3):
  Plate Elevated Floating Heel Squats (2×10), Calf Raise Plantarflexion Hold (2×10 сек),
  Ankle Dorsiflexion Hold (2×10 сек), Wall Slides (2×10), Tactical Frog & Reach (2×10 rocks + 3 reaches)
  Glute Bridge 5-сек ISO Hold (1-2×5) → сразу перед приседаниями

ПРОГРЕССИЯ НАГРУЗКИ ПО НЕДЕЛЯМ:
  Нед. 1 — темп "Control": Trap Bar DL 75% × 3×10 | Back Squat 70% × 3×10
  Нед. 2 — темп "Control": Trap Bar DL 80% × 3×8 | Back Squat 80% × 3×8 | Bench 75-80% × 3×8 | Pull-Ups → Weighted × 3×8
  Нед. 3+ — PEP Phase 1 (три типа дней):
    Дн. COD+Resistance: темп 2-1-1 (Barbell Split Squat / Landmine Split Jerk / SL RDL / SL Contra-Lateral Row) по 3×4–6/сторону
    Дн. High Velocity: 30–50% 1ПМ, темп 2-0-0 — Half Back Squat / Bench Press (4×3 / 3×3) + SL Box Step-Up Jump
    Дн. Max Strength: Trap Bar DL 80%+ 3-1-1, 4×3 | DB Bulgarian SS 3-1-1, 4×5 | DB High Incline Bench 3-1-1 | Pull-Ups 3-1-1

КЛЮЧЕВЫЕ УПРАЖНЕНИЯ ФАЗЫ:
  Нижнее тело: Trap Bar Deadlift, Barbell Back Squat, DB Bulgarian Split Squat, Barbell Hip Thrust, Barbell Split Squat, SL Box Step-Up
  Верхнее тело: DB Incline Bench Press, Barbell Bench Press, DB Standing OHP, Pull-Ups (нейтральный хват), Bent Over Row
  Вспомогательное: Copenhagen Adductor Squeeze, Lateral Lunge with Adductor Slide, DB 3D Step Up, Nordic Hamstring Curls (GHD)
  Профилактика: Wall Slides, Band Pull-Aparts, Ankle Dorsiflexion ISO Holds, Barbell Hip Airplanes

SPEED-STRENGTH ZONE (Нед. 3, High Velocity Day):
  Цель: выход в скоростно-силовую зону кривой силы-скорости (30–50% 1ПМ, максимальная скорость штанги)
  Темп 2-0-0: 2 сек эксцентрика, 0 пауза, максимально быстрая концентрика
  Прекращать серию при ~10% снижении высоты прыжка / скорости штанги

SPRINT MECHANICS (скоростные дни — контекст ЦНС-нагрузки для зала):
  A-March / A-Skip / A-Switch / A-Triples / Butt Kicks / Scissor Bounds
  ⚠ День после скоростной выносливости: снижай объём/интенсивность нижнего тела в зале

СВЯЗИ С ОСТАЛЬНЫМИ ФАЗАМИ:
  ← GOATA Strength Phase 3: темп 3-3-0 → переходит в темп Control / 2-1-1 нед.3
  → PEP Eccentric Camp: темп 2-1-1 и 3-1-1 = нейромышечный мост к темпу 5-0-X-0 эксцентрики
  Nordic Hamstring Curls в Нед.3 = профилактический задел перед объёмной эксцентрической работой

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PEP PHASE 2 — Вертикальная/Горизонтальная мощь + Спринт + SAQ (Weeks 7–8+)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
МЕСТО В МЕТОДИКЕ: После PEP Preparation Phase, параллельно или после eccentric/isometric camp.
НАЗНАЧЕНИЕ: Перенос базовой силы в мощность. Выход на пик вертикальной и горизонтальной силы.
ЧАСТОТА: 4 дня/неделю — 4 разных фокуса нагрузки.

СТРУКТУРА НЕДЕЛИ:
  День 1 — Vertical Power Production: PAP-кластер прыжков (Trap Bar + Split Squat Jump + Band VJ)
  День 2 — Sleds Sprints & Technique: спринтовая механика + слэд + (Нед.8: горизонтальная сила)
  День 3 — Horizontal Power Production: Barbell Hip Thrusts + горизонтальные прыжки + Landmine
  День 4 — SAQ & Max Force Development: лесенка + реакционная ловкость + FVC-блок A1→A4

PEP PHASE 2 WARM-UP — ДЕНЬ 1 (Vertical Power):
  Foam Rolling Full Body (3-5 мин) → Calf Ankle Stretch (1×5×5 сек/нога) → Elevated Band Distraction Ankle Mobility (1×10-15/сторону)
  Serratus Anterior Wall Slides (1×10) → Curl to Press (1×10) → Band Pull Aparts (1×30)
  Plate Single Leg Low to High (1×5/сторону) → Contra Lateral Plank (1×15 сек/сторону) → Bird Dogs (1×15 сек/сторону)
  VMO: Sissy Squats (1×20) → Hamstring: GHD (1×5) → Glute: Elevated Glute Bridges (1×8)
  Chest activation: Squeeze & Press (1×5 сек/сторону) → Band Lat Pull Down (1×10)
  World's Greatest Stretch (1×3/сторону) → Backwards Skip–Open the Hip (1×20 yd) → Wall Leg Swing Series (1×10 каждый) → Sprinter Flow (1×20 yd = 5 yd каждый)
  Финальная активация: Stair Jump Series (2×8-10 stairs)
  Нед.8 ДОПОЛНИТЕЛЬНО: Quad Nordic Med Ball Overhead Throw (1×6-8) + Lateral Push-Ups (1×6-8/сторону) + Knee to Elbow Push-Ups (1×6-8/сторону) + Squat Knee Fallin/Internal Rotation (1×5/сторону) + Lunge Open & Rotate (1×3/сторону) + Hands on Hips Jump (1×5)

PEP PHASE 2 WARM-UP — ДЕНЬ 2 (Sleds/Sprint):
  Ground Base Phase 1: Foam Rolling → Cat-Cow → Plank Pike → Quad Nordic → Downward Dog to Cobra → Side Plank Reach Over → T-Spine Rotations (все 1×6-8)
  Нед.8 добавить: Hip Rock Series (1×8 rock backs) + Push-Ups (1×6-8)
  Dynamic Mobility Phase 2: Side Skip Arm Swings → Lunge and Reach → High Knee Pull to High Knee → Scissor Bounds to Hamstring Kicks (всё 1×20 yd)
  Ground Base Phase 2: SL Glute Bridge to Hamstring Kick → Glute Pump + Prone Scorpions → Roll Back & Reach → Cycles + Straight Leg Kicks + Scissors → Tactical Frog + External Rotation (все 1×6-8)
  Нед.8: Prone Scorpions → Iron Cross/Eagles → Straight Leg Kicks → Scissors → Roll Back & Reach → 90/90 Reach → Knee Fallin → Groiners → SL Glute Bridge → Star Plank 20 сек → Contra-Lateral Plank 20 сек

PEP PHASE 2 WARM-UP — ДЕНЬ 3 (Horizontal Power):
  Foam Rolling → 90/90 Hip Mobility Reaches (1×5/угол) → World's Greatest Stretch (1×3/сторону) → Wall Deep Squat I-Y-T (1×5/букву) → Hip Flexor Wall Stretch (1×10 сек squeeze)
  Plate Single Leg Low to High → Contra Lateral Plank → Sissy Squats (1×20) → Elevated Glute Bridges (1×8) → Band Pull Aparts (1×30) → Serratus Anterior Wall Slides (1×10) → Curl to Press (1×10) → Wall Dead Bugs (1×5/сторону) → Kneeling Arm Swing to Stand Up (1×5/сторону)

PEP PHASE 2 WARM-UP — ДЕНЬ 4 (SAQ/Force):
  Foam Rolling → SL Glute Bridges (1×10) → Star Plank ISO 20 сек → Plank Shoulder Touches (1×10/сторону)
  Lateral Push-Step (1×10 yd/сторону) → Shuffle (2×10 yd/сторону) → Pogo Jumps (1×5 yd → Sprint)
  Counter Arm Reverse Lunge and Twist (1×20 yd) → Crossbody Pull to Superman (1×20 yd) → Ballistic Hip Hinge (1×20 yd)

БЛОК A — VERTICAL POWER (День 1) — PAP-кластер трёх упражнений:
  A1: Trap Bar Jump (30% 1RM) — Fast, 4×3, rest=xxx (переходи сразу к A2)
  A2: Split Squat Eccentric Loaded Jump — темп 1-1-0, 4×3/сторону, rest=xxx (переходи к A3)
  A3: Band Assisted Vertical Jump — Quick Ground Contact (реактивный отскок), 4×5, отдых 3-5 мин
  ПРИНЦИП: A1→A2 без паузы — PAP-потенциация, длинный отдых только после A3.

БЛОК B (День 1) — Верхнее тело + медбол:
  Нед.7: B1=Med Ball Throw Slam Complex Fast-Explosive 3×6 → B2=Chin-Up 1-1-1 3×6 → B3=Barbell Bench Press Explosive 3×6, 2 мин
  Нед.8: B1=Barbell Bench Press Fast-Explosive 3×6 → B2=Chin-Up 1-1-1 3×6 → B3=Med Ball Throw Slam Complex Explosive 3×6, 2 мин
  C1: DB Single Leg Box Step Ups — 1-0-1, 2×8/сторону, 1.5 мин

БЛОК A — HORIZONTAL POWER (День 3) — Hip Thrust + горизонтальный прыжок:
  A1: Barbell Hip Thrusts — 1-1-1, 3×6, rest=xxx
  A2: Broad Jump with Backwards Hop — Quick Ground Contact, 3×3, отдых 3 мин
  B1: Landmine Jerk — 1-1-1, 3×5, rest=xxx
  B2: DB Split Stance Single Arm Row — 1-1-1, 3×5, 2 мин
  C1: Single Arm DB Kneeling Press — 1-1-1, 2×10/сторону, rest=xxx
  C2: DB RDL — 1-1-1, 2×20, 1.5 мин

SLED SPRINT ДЕНЬ (День 2):
  Sprint Mechanic Drills (1×20 yd каждый, отдых=60-70% run back): A-Skip, A-Doubles, A-Switches, Alternating Triple Skip, High Knees, Backwards Run, Scissor Bounds (Straight Leg Run)
  Hurdle Plyometric: Stick Jumps + Skips for Distance — 2×5 барьеров, walk back
  Нед.7 MAIN: Sled Sprints — 2 set × 20/30/40 ярдов, отдых 5 мин
  Нед.8 MAIN: Sled Sprints (20% массы тела) — 2 set × 10/15/20 ярдов, 1.5 мин между повторами, 5 мин между сетами
  ⚠ Нед.8 после слэдов — Horizontal Strength Block: Hip Thrusts 1-1-1 3×6 + Single Arm DB Kneeling Press 3×10 + Barbell Row Drop Catch 3×5 / Landmine Jerk 3×5 + DB RDL 3×20 + Side Oblique Pull-Downs 3×10/ст + Barbell Roll-Outs (Side) 3×10
  Нед.8 Hurdle Mobility: Hurdle Walk Over (2×8) + Alternating Walk Over (2×8) + Sprinter RDL to High Box Soft Step (2×5/ст, 1 мин) + Sprinter RDL to Airplane (2×5/ст, 1 мин)
  Нед.8 Diagonal Bounds: Diagonal Stick Jump + Pop Jump + Continuous Diagonal Jump + Single Leg Pop Jump + Diagonal Jump to Broad Jump — все 2×5 барьеров

DIAGONAL HURDLE BOUNDS (День 3, перед основным блоком):
  Diagonal Stick Jump — 2×5 барьеров, walk back
  Diagonal Jump to Broad Jump — 2×5 барьеров, walk back
  Continuous Diagonal Jump — 2×5 барьеров, walk back
  Single Leg Skater Stick Jump — 2×5 барьеров, walk back
  Single Leg Skater Continuous Jump — 2×5 барьеров, walk back

FVC-БЛОК SAQ (День 4) — A1→A2→A3→A4 без паузы, 3 мин после блока:
  A1: DB Bulgarian Split Squat — 1-1-1, 3×5/сторону
  A2: Barbell RDL — 1-1-1, 3×5
  A3: DB Overhead Press — 1-1-1, 3×5
  A4: DB Row — 1-1-1, 3×5, отдых 3 мин
  Дополнительно (Нед.8): B1: Copenhagen Adductor Squeeze w/Ext Rot Control 2×20-30 сек/ст | B2: Suitcase Carry w/Knee Drive Control 2×15 yd/ст, 2 мин

QUICK FEET LADDER (День 4, до plyometric):
  Нед.7: Single Leg A-Run / Single Step / Double Step / Lateral Double Step / Ickey Shuffle / Salsa — все 2×Full Ladder
  Нед.8: Single Leg A-Run / Single Step / Double Step / Wide Stick Ickey Shuffle / Wide Stick Crossover — все 2×Full Ladder

PLYOMETRIC & AGILITY CIRCUIT (День 4):
  A1: Single Leg Mini Hop to Power Skip — 2×3/ногу (Нед.8: 5/ногу)
  A2: Explosive Lateral Bound — 2×3/ногу (Нед.8: 5/ногу)
  Нед.8 добавить A3: Box Jump Complex — 2×3 прыжка
  B1: Lateral Hurdle Step Over → Med Ball Chest Pass — 2×6 барьеров
  B2: Lateral Hurdle Step Over → Rotational Pass — 2×6 барьеров
  B3: Lateral Hurdle Step Over → Turn & Sprint — 2×6 барьеров
  C1: Reaction Agility Pole – Sprints — 4×2 "Reaction"
  D1: Hurdle Jump to Reaction Lateral Shuffle — 4×2 "Reaction"

КЛЮЧЕВЫЕ ПРИНЦИПЫ PEP PHASE 2:
  • "Quick Ground Contact" = минимальное время контакта с землёй, реактивный отскок
  • PAP-последовательность День 1: тяжёлое (30% тяжелее на TBJ) → медленный эксц. прыжок → реактивный прыжок — три звена силы-скорости за одну серию
  • Слэд = горизонтальный вектор разгона, дополняет вертикальный вектор Дня 1
  • Diagonal Bounds = фронтально-латеральный перенос мощи на прыжок с разбега (волейбол!)
  • FVC-блок (A1→A4, 1-1-1) = полицепная силовая цепочка без отдыха внутри — нейральное требование как в игре
  • Progression Нед.7→8: слэд легче/короче (10/15/20 yd) + добавляется сила после слэда (горизонтальный день 2)

СВЯЗИ С ОСТАЛЬНЫМИ ФАЗАМИ:
  ← PEP Preparation Phase (Нед.1-3): темп 2-0-0 High Velocity Day → развивается в PAP-кластер Дня 1
  ← FVC-блок Нед.3 (A1-A4) → та же структура сохраняется в SAQ-дне Phase 2
  → Eccentric/Isometric/Concentric Camp: фундамент мощи Phase 2 = потенциал для изометрических удержаний и концентрических взрывов сборов

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PEP PHASE 2 — ПРОГРЕССИЯ НЕДЕЛИ 9 (переход к унилатеральным паттернам)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Неделя 9 — ключевой сдвиг: от билатерального к унилатеральному/однорукому

◆ ДЕНЬ 1 (Vertical Power — Unilateral Shift):
Новые элементы разминки Нед.9:
  - Kneeling Band Hip Distraction (1×10/side) — мобилизация тазобедренного сустава с лентой
  - Chest / Pec-Lat Soft Tissue Release (1×1-2 мин/side) — фоам-роллинг груди/лата
  - Modified Copenhagen Adductor Squeeze + Ext Rotation (1×10/side)
  - Calf Heel Rolls (1×10) — мобильность лодыжки
  - Slow Eccentric Calf Raises (1×5/side) — эксц.тренировка икры для реактивности

A-блок (PAP — НЕТ Trap Bar Jump, замена на унилатеральный):
  A1: Barbell Split Stance Squat (1-1-0, 3×4) — тяжёлый праймер; сплит-позиция активирует ягодицы и сгибатели бедра асимметрично
  A2: Single Leg Box Elevated Vertical Jump (Explosive, 3×3/side, 3 мин) — PAP-результат: реактивность одной ногой; коробка под опорной ногой увеличивает ROM

B-блок (однорукий горизонтальный — ротационный вектор):
  B1: DB Single Arm Bench Press (1-1-0, 3×5/side)
  B2: Med Ball Seated Single Arm Throw (Explosive, 3×3/side, 2 мин) — PAP-результат: быстрый сброс через плечо
  B3: DB Single Arm Row (Explosive, 3×6/side)

C-блок (стабилизация и латеральная мощь):
  C1: Split Stance RDL (1-1-0, 3×6-8/side) — унилатеральная тяга, загружает подколенные
  C2: Band Resisted Lateral Lunge to Knee Drive (Control, 3×6-8/side, 2 мин) — лента добавляет горизонтальное сопротивление

◆ ДЕНЬ 2 (Sled Sprints — Нед.9 изменения):
Новое в беговой механике разминки:
  - A-Walk (новый элемент — медленнее A-Skip, ещё базовее) → A-Switches → A-Doubles → Scissor Bounds
  - Alternating Triple Hurdle Step Over (2×8) — НОВЫЙ 3-й вид преодоления барьеров
  - Ground Base Phase 2: добавлен Cross Body Leg Whip (мобилизация ротаторов бедра)

Основная работа:
  A1: Sled Sprints 20% BW — 2×4×30 yd (1.5 мин между рывками, 5 мин между сетами)
  B1 НОВОЕ: Non-Weighted Sprints — 1×3×20 yd (2-3 мин) — ПОСЛЕ слэда для переноса горизонтальной мощи в свободный спринт (контрастный протокол)

◆ ДЕНЬ 3 (Horizontal Power — Нед.9 изменения):
Diagonal Hurdle Bounds — упрощено: только Continuous Diagonal Jump (Quick Hop) 2×3 hurdles, 1 мин (вместо 5 упражнений Нед.7-8)

Основная работа:
  A1: Barbell Hip Thrusts (1-1-1, 3×6)
  A2: Broad Jump with Backwards Hop (Quick Ground Contact, 3×3, 2.5 мин)
  B1: Landmine Jerk (1-1-1, 3×5)
  B2: Pull-Up (1-1-1, 3×5, 2 мин) — ЗАМЕНА DB Split Stance Row → вертикальная тяга наверх
  C1: Single Arm DB Kneeling Press (1-1-1, 2×10/side)
  C2: DB RDL (1-1-1, 2×20)

◆ ДЕНЬ 4 (SAQ + Max Force — Нед.9 изменения):
ПОЛНОСТЬЮ НОВЫЙ формат разминки (ходьбовый):
  - Lunge + T-Spine Mobility + Hamstring Kick (1×20 yd)
  - Crossbody Pull to Superman + Kick (1×20 yd)
  - Shuffle to Side-to-Side Lunge + Rotation (1×20 yd)
  - Single Leg Squat and Reach (1×20 yd)
  - Calf Heel Walk (1×20 yd)
  - Ballistic Hip Hinge 3 Pumps (1×20 yd)
  - Calf Heel Rolls (1×20 yd)
  - Hill Heels (1×Up Hill 5 yd) — на подъём для загрузки тыльных сгибателей
  - Wall Glute Knee Drive (1×10/side) — ягодичная активация перед SAQ
  - Monster Band Walks Band ABOVE Knee (1×10 yd)
  - Monster Band Walks Band ON Feet (1×5 yd)

Plyometric & Agility Нед.9:
  A1: SL Mini Hop to Power Skip WITH OVERSPEED BAND (2×5/leg) — НОВОЕ: резиновая лента ускоряет движение — суперскоростное нервно-мышечное требование
  A2: Explosive Lateral Bound (2×5/leg)
  B1: Depth Drop → 3 Mini Hurdle Box Jump (2×3 прыжка) — НОВОЕ: падение → реакция → 3 барьера → взрыв
  B2: Ladder Lateral Shuffle to Broad Jump (2×3/side) — НОВОЕ: боковое ускорение + горизонтальный взрыв
  B3: Mini Hurdle Quick Step Over Sprint (3×2 реакции) — НОВОЕ: спринт через препятствия

FVC-блок Нед.9 (обновлённые упражнения):
  A1: Trap Bar Deadlift (1-1-1, 3×5) — вместо DB Bulgarian SS; максимальная нагрузка нейро-мышечной цепи
  A2: DB Bench Press (1-1-1, 3×5) — вместо Barbell RDL
  A3: DB Split RDL (1-1-1, 3×5/side) — вместо DB OHP; унилатеральная задняя цепь
  A4: Chin-Up (1-1-1, 3×5, 3 мин) — вместо DB Row; вертикальная тяга наверх
  B1: Copenhagen Adductor Squeeze + Ext Rotation (Control, 2×20-30 сек/side)
  B2: DB Lunge with Lateral Raises (Control, 2×15 yd/side, 2 мин) — НОВОЕ: многоплоскостная нагрузка в движении

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PEP PHASE 2 — ДЕLOAD НЕДЕЛЯ 10 (3 дня, последняя перед Phase 3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Неделя 10 = деload Phase 2. Те же паттерны, объём −50-60%. 3 дня (не 4). Последняя сессия Phase 2 перед Phase 3.

◆ ДЕLOAD ДЕНЬ 1 (Vertical Power Deload):
Специфические добавления разминки:
  - Barbell Pec Rolling (1×1 мин/side) — soft tissue для груди
  - Nordic Curl (1×6-8) — профилактический хамстринг
  - Single Leg Skater Squats (1×5/side) — контроль унилатеральной нагрузки
  - Kneeling Calf Raise (1×5/side, slow) — медленная проработка икры

Основная работа (сниженный объём):
  A1: Trap Bar Jump Fast (3×3 vs 4×3 нед.7-8)
  A2: Split Squat Eccentric Loaded Jump (1-1-0, 3×3/side)
  A3: Band Assisted Vertical Jump (Quick Ground Contact, 3×5, 3-5 мин)
  B1: Med Ball Throw Slam Complex (Fast-Explosive, 3×3 vs 3×6)
  B2: Reaction Drop Chin-Up (Quick Drop, 3×3) — НОВОЕ: реактивный подтяг с быстрым опусканием
  B3: Band Barbell Bench Press (Explosive, 3×3, 2 мин) — лента добавляет скоростной компонент
  C1: DB Bulgarian Split Squat (1-0-1, 2×8/side, 1.5 мин)
  C2: DB Tricep Extensions (Controlled, 2×10) — деload-финишёр
  C3: DB Skull Crushers (Controlled, 2×до отказа)
  C4: DB Close Grip Bench Press (Controlled, 2×до отказа, 2 мин)

◆ ДЕLOAD ДЕНЬ 2 (Horizontal Power Deload):
  A1: Barbell Hip Thrusts (1-1-1, 3×3) — меньше повторений
  A2: Board Jump with Backwards Hop (1-1-1, 3×3, 2-3 мин)
  B1: Landmine Jerk (1-1-1, 3×3)
  B2: Barbell Row Supinated Grip (1-1-1, 3×5, 1.5 мин) — ЗАМЕНА Pull-Up нед.9 на горизонтальную тягу
  C1: Single Arm DB Kneeling Press (1-1-1, 2×10)
  C2: DB RDL (Control, 2×20, 1.5 мин)

◆ ДЕLOAD ДЕНЬ 3 (SAQ + Max Force Deload):
Разминка: по выбору атлета (любимые движения) — активная, не запрограммированная

Quick Feet Ladder (те же 6 вариантов: Single Leg A-Run / Single Step / Double Step / Ickey / Salsa / Quick Hands, 2×Full Ladder)

Plyometric Deload Circuit:
  - Plyo Flow Warm-Up (1×5 повторений каждого элемента)
  - Explosive Lateral Push Step with Med Ball (2×5/leg)
  - Depth Jump → 3 Hurdles → Single Leg Box Jump (2×3 прыжка) — реактивная цепочка
  - Mini Hurdle Quick Step → Sprint → COD (3-5×2-3 реакции) — смена направления после спринта

FVC-блок Деload (2-3 сета вместо 3):
  A1: Trap Bar Deadlift (1-1-1, 2-3×5)
  A2: DB Bench Press (1-1-1, 2-3×5)
  A3: DB Split Squat (1-1-1, 2-3×5/side) — упрощение от Split RDL
  A4: Single Arm DB Row (1-1-1, 2-3×5/side, 3 мин)
  B1: Adductor Squeeze + Cable Rotation (Control, 2×10/side) — сочетание аддуктора + ротации туловища
  B2: DB Lunge Lateral Raise (Control, 2×15 yd, 2 мин)

ПРИМЕЧАНИЕ: Неделя 10 = финальный деload Phase 2. После этой недели начинается Phase 3 (лагерный блок — Eccentric/Isometric/Concentric Camp).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PEP PHASE 3 (Weeks 11–12+) — Linear Speed / COD / Vertical+Horizontal Power
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 3 = интеграция всех предыдущих блоков: скоростная механика + смена направления + максимальная мощь + реактивная агильность с когнитивным компонентом.
4 дня/нед., каждый день с отдельным фокусом:
  День 1: Linear Acceleration + Horizontal Power
  День 2: COD (смена направления) + Horizontal Push Pull
  День 3: Linear Speed + Vertical Power Production
  День 4: COD-Reactive Agility (Cognitive) + Vertical Push Pull

КЛЮЧЕВАЯ СТРУКТУРА Phase 3:

WALL SPEED MECHANIC DRILLS (перед главной работой, Дни 1 и 3):
  - Single Leg Wall Piston (2×10/side) — базовый шаг ускорения у стены
  - Single Leg Wall Pull Through (2×10/side)
  - Single Leg Wall Quick Switch (2×10/side) — быстрое переключение
  - Single Leg Wall Pull Through to Piston (2×5/side) — комплексный
  - Arm Mechanics 50-75-100% (2×10 сек) — механика рук на трёх скоростях
  Нед.12 Доп.: Band Resisted Knee Drive (2×6-10 сек) + Wall Triple Piston + Wall 5 Second Max Pistons

◆ ДЕНЬ 1 — Linear Acceleration + Horizontal Power:

Разминка Нед.11:
  Грунтовая: Foam Roll → 90/90 Weighted → 90/90 Switches → World's Greatest Stretch → Side to Side Lunge → Cross Body Pull+Superman+Kick → Ballistic Hip Hinge → Hamstring Leg Swing
  Активация (2 сета): Banded Side Steps/Monster Walks (10/side) → Banded Wall Hip Hyperextension (15/side) → Banded Tibialis Posterior Activation (20) → Banded Back to Wall Hip Flexion (10/side)

Разминка Нед.12 (другой формат — скип-серия):
  Foam Roll → Forward Skip+Forward Arm Circles → Backwards Skip+Backward Arm Circles → Forward Skip+Open&Close → Backwards Skip+Reach Overs → Lateral Side Skip → Carioca → Lunge T-Spine+Hamstring Kick → Cross Body+Superman+Kick → High Knee+Hurdle Mobility → Inch Warm+Push-Up→Dog-Cobra → Ballistic Hip Hinge → Leg Swing → Lateral Monster Band Walks (Band on Feet, 10 yd/side) → Banded Wall Hip Hyperextension (10/side) → Kneeling Elevated Band Calf Raises (10/side) → Banded Back to Wall Hip Flexion (10/side)

А-блок (Нед.11, ускорение):
  A1: Hip EXT & Step with Knee Drive Against Band (Explosive, 3×5/side, xxx) — ягодичное разгибание + шаг с подъёмом колена в ленте
  A2: 10 Yard Knee Down Acceleration (Explosive, 3×1, 2.5 мин) — старт с колена на 10 ярдов

А-блок (Нед.12, расширенный нейро-потенциал):
  A1: Hip EXT & Step with Knee Drive Against Band (Explosive, 3×5/side, 10 сек)
  A2: Quick Band Hip Thrusts (Explosive, 3×10, 10 сек) — быстрые горизонтальные трасты с лентой
  A3: Band Hamstring Kickers (Explosive, 3×5 сек, 1.5 мин) — быстрые удары назад с лентой
  A4: 10 Yard Knee Down Acceleration (Explosive, 3×1, Full Rest 3 мин)

B-блок PAP (горизонтальная мощь, 10 сек между упражнениями):
  Нед.11:
    B1: Barbell Hip Thrust Heavy (1-1-0, 4×3, 10 сек)
    B2: Depth Jump to Broad Jump (Explosive, 4×2, 10 сек)
    B3: Kettlebell Swing with Band (1-1-0, 4×5, 10 сек)
    B4: Banded Hip Thrusts with ISO Hold (Explosive, 4×5, 3 мин)
  Нед.12 (усложнённый B4):
    B2: Med Ball Depth Jump to Hip Throw (Explosive, 4×5, 10 сек) — ротационный бросок после прыжка
    B4: Pogo Hop → Box Jump → Depth Jump → Broad Jump (Explosive, 4×2, Full Rest 3-4 мин) — 4-звенная реактивная цепь

C-блок (стабилизация и задняя цепь):
  C1: Cable Rotations (Explosive, 2×10/side, xxx)
  C2: Single Leg Swiss Ball Hamstring Curls (1-1-0, 2×10/side, 1.5 мин)

◆ ДЕНЬ 2 — COD + Horizontal Push Pull:

Разминка Нед.11 (наземная):
  Foam Roll (3-5 мин) → Lateral Push-Step (20 yd) → Shuffle Reverse Pivot Turn Backwards (20 yd) → Carioca (20 yd) → Deceleration Sprint (20 yd) → Backpedal (20 yd) → Two Step Rhythmic Shuffle Backwards (20 yd) → Backwards Skip Open Hips (20 yd) → World's Greatest Stretch → Single Leg Squat → Inch Warm Push Up → Cross Body Pull+Superman+Airplane → Leg Swing Series

Разминка Нед.12 (расширенная COD-серия):
  Foam Roll → Dynamic Bounce Lateral Push-Step → Dynamic Bound Crossover → Carioca → Big Knee Drive Carioca → Forward Crossover Steps → Dynamic Bounce Forward 45° Push-Step → Shuffle Reverse Pivot Turn Backwards → Deceleration Sprint → Backwards Skip → Backwards Hip Flip Skip → Two Step Rhythmic Shuffle Backwards → World's Greatest Stretch → Side to Side Lunge → Inch Worm+Push-Up→Dog-Cobra → Cross Body Pull+Superman+Kick → Leg Swing Series → 45 Degree Band Walks (Bands on Ankles, 10 yd/side) → Single Leg Abduction (Bands on Ankles)

А-блок (COD + Med Ball):
  Нед.11:
    A1: Med Ball Shuffle to Rotational Slam (Explosive, 3×2-3/side, xxx)
    A2: Crossover Sled Sprint (Explosive, 3×10 yd/side, 2-3 мин) — слэд с перекрестным шагом
  Нед.12:
    A1: Med Ball Pass Rotational Throw (3×2-3/side, xxx)
    A2: MB Shuffle to Rotational Throw (3×2-3/side, xxx)
    A3: Quick Step Band Crossover Sprint (Explosive, 3×10 yd/side, 2-3 мин) — спринт с перекрестным шагом + лента

B-блок (плечи, базовая активация, 2 сета):
  B1: Band Pull-Aparts / 2 Band Pull-Aparts (1-1-0, 2×10, xxx)
  B2: Upward Rotation and Press (Explosive, 2×10, xxx) — вращение вверх + жим
  B3: Band Lat Pull Down (1-1-0, 2×10, xxx)
  B4: Band Eccentric Focused Push-Up (Explosive, 2×10, 1.5 мин) — взрывной эксцентрический отжим

C-блок PAP (горизонтальный жим, 10 сек между упражнениями):
  C1: Bench Press / Barbell Bench Press (Controlled, 3×5, 10 сек)
  C2: Med Ball Chest Pass / Lying Med Ball Chest Pass (Explosive, 3×5, 10 сек)
  C3: Football Bar Speed Bench Press (Explosive, 3×5, 10 сек) — скоростной жим на штанге
  C4: Нед.11: Assisted Plyo Push-Up (Explosive, 3×5, 2-3 мин) / Нед.12: Med Ball Reactive Wall Pass (Explosive, 3×10, 2-3 мин)

D-блок PAP (горизонтальная тяга-цепь, 10 сек между упражнениями):
  D1: Barbell Row (3×5, 10 сек)
  D2: Heavy Band Rapid Pull (Explosive, 3×5, 10 сек) — быстрое тяговое усилие с тяжёлой лентой
  D3: Rapid Sled Pull (Fast, 3×5, 10 сек) — быстрое сжатие слэда
  D4: Rapid Band Pull (Fast, 3×10, 2-3 мин) — 4-звенная цепь тяги (сила → скорость)

E1 (Нед.12 только): Bicep Tri-Set (Supinated + Neutral + Pronated, 5×10 каждый, 1 мин) — 3 угла захвата бицепса

◆ ДЕНЬ 3 — Linear Speed + Vertical Power:

Разминка Нед.11 (плечо-бедро, бегом):
  Foam Roll → Arm Circle+Alternating Hurdle Mobility → Single Arm Circles+Reach Back+Lateral Hurdle A-Skip → Lateral Side Skip+Reach+Backwards Hurdle → Carioca+Hurdle Deep Lunge → Straight Leg+Backwards Reach+Squat Pivot → Hamstring Leg Swing → Lateral Band Walks (Bands on Feet, 10 yd оба направления) → Single Leg Abduction (10/side)

Разминка Нед.12 (барьерная серия):
  Foam Roll → Arm Circle+Alternating Hurdle Mobility (8 hurdles) → Open and Close+Backwards Hurdle (8 hurdles) → Dynamic Hurdle Step Over to High Knee (8 hurdles) → Lateral Hurdle Step Over to Deep Squat (8 hurdles) → Lateral Hurdle Step Over-Deep Squat-Pivot Reach (8 hurdles) → Hamstring Leg Swing → Lateral Band Walks (Above Knees, 10 yd оба направления) → Single Leg Abduction

Wall Speed Drills Нед.12 (обновлённые):
  - Wall Quick Switch (2×10/side) + Wall Triple Piston (2×5/side) + Wall 5 Second Max Pistons (2×5 сек) — максимальный темп с лестницей усложнения

А-блок (спринты):
  Нед.11: Sled 10 Yards (3×1, xxx) → 20 Yard Non-Weighted Sprint (3×1, 2-3 мин)
  Нед.12: Sled 10 Yards (3×1, 10 сек) → 10 Yard Band Resisted Sprint (3×1, 10 сек) → 20 Yard Sprint (3×1, 2-3 мин) — 3-звенный спринт-контраст

B-блок PAP (вертикальная мощь, 10 сек):
  Нед.11:
    B1: Trap Bar Deadlift (Explosive, 4×3, 10 сек)
    B2: High Depth Jump to Hurdle Jump (Explosive, 4×3, 10 сек) — высокое падение → через барьер
    B3: Trap Bar Jumps (Explosive, 4×3, 10 сек)
    B4: Low Depth Jump to Box Jump (Explosive, 4×3, 3 мин)
  Нед.12:
    B2: Weighted Box Jump to Stamp (Explosive, 4×3, 10 сек) — прыжок с весом + жёсткая посадка
    B4: Hurdle Plyo Series (Explosive, 4×3, 3 мин) — серия через барьеры

C-блок (унилатеральная стабилизация):
  C1: Deep Lunge Pallof Press (Control, 2×10/side, xxx) — Паллоф в глубоком выпаде
  C2: Deep Lunge Calf Raise (Control, 2×10/side, xxx) — подъём на носок в выпаде
  C3: Нед.11: Reverse Lunge – Lateral Raise (2×10/side, 1.5 мин) / Нед.12: Reverse Lunge to Press (2×10/side, 1.5 мин)

D1 — финишёр:
  Нед.11: Push-Up Circuit (Leg Cross + Groiner + Reach, 1×5 мин AMRAP)
  Нед.12: Push-Up Slider Circuit (1-2×5 reps each 5 yd, 3-4 мин)

◆ ДЕНЬ 4 — COD-Reactive Agility (Cognitive) + Vertical Push Pull:

Разминка Нед.11 (комплексная):
  Foam Roll → Dynamic Bounce Lateral Push-Step (20 yd) → Dynamic Bounce Forward 45° Push-Step (20 yd) → Shuffle Reverse Pivot Turn Backwards (20 yd) → Deceleration Sprint (20 yd) → Backpedal (20 yd) → Two Step Rhythmic Shuffle Backwards (20 yd) → World's Greatest Stretch → Backwards Skip Open Hips (20 yd) → Cross Body Pull+Superman+Kick → High Knees to Forward Hip Circle (6-8/side) → Side to Side Lunge with Rotation (20 yd) → Leg Swing Series (10/side)

Разминка Нед.12 (упрощённая):
  Foam Roll → Dynamic COD Flow Warm-Up: Squats, Snap Down, Dynamic Hip Flip, Side & Front Lunge, Cross Body Pull to Superman, Quick Shuffle, Quick Crossover, High Knee Tuck Jump (1-2×5 каждый) → Lateral Monster Walks (Band on Ankles, 10 yd) → Single Leg Abduction (Bands on Ankles, 10/side)

Multi-Directional Speed Drills (оба раза):
  - Mini Hurdle Crossover Step to Sprint (3×2-3/side)
  - 3 Cone Mirror Drill (3×4) — КОГНИТИВНЫЙ: зеркальное повторение за партнёром
  - Backpedal to Gap Fill and Catch (Tennis Ball) (3×4) — КОГНИТИВНЫЙ: реакция + теннисный мяч

А-блок (плечи, активация):
  A1: Band Pull-Aparts / 2 Band Pull-Aparts (1-1-0, 2×10, xxx)
  A2: Upward Rotation and Press (Explosive, 2×10, xxx)
  A3: Band Lat Pull Down (1-1-0, 2×10, xxx)
  A4: Band Eccentric Focused Push-Up (Explosive, 2×10, 1.5 мин) — только Нед.11

B-блок PAP (вертикальный жим-цепь):
  Нед.11:
    B1: Barbell Overhead Press (Control, 3×5, xxx)
    B2: Backwards Med Ball Throw (Fast, 3×5, xxx) — бросок мяча назад через голову
    B3: Landmine Jerk (Fast, 3×5, xxx)
    B4: DB Jerk (Fast, 3×5, 2 мин)
  Нед.12:
    B2: Lying Backwards Med Ball Throw (Fast, 3×5, xxx) — лёжа
    B3: Band Landmine Jerk (Fast, 3×5, xxx) — с лентой
    B4: DB Split Stance Jerk (Fast, 3×5, 2 мин) — в сплит-позиции

C-блок PAP (вертикальная тяга-цепь):
  C1: Pull-Up (Weighted) (Control, 3×5, xx)
  C2: Lying Med Ball Med Throw (Explosive, 3×5, xx)
  C3: Pull Up Drop & Catch (Control, 3×5, xx) — быстрое опускание + подхват
  C4: Cable Ski Erg (Control, 3×5, 2 мин) — лыжная тяга

D1 — Core Circuit (финишёр):
  Swiss Ball Stir Pot + Sprint Sit Up + Russian Twist + Push Up "TAPS"
  1×5 мин AMRAP (5 каждой стороны / 10 всего)

КЛЮЧЕВЫЕ ПРИНЦИПЫ PEP PHASE 3:
  • 10-секундные паузы ВНУТРИ кластера — мини-восстановление ЦНС сохраняет скорость и мощь
  • Полный отдых 2-4 мин МЕЖДУ кластерами — максимальное воспроизведение усилия
  • Когнитивный компонент Дня 4: зеркальный дриллинг + теннисный мяч = реакция + принятие решений под нагрузкой
  • D-блок Дня 2 (Rapid Pull Chain): Barbell Row → Heavy Band → Rapid Sled → Rapid Band — убывающая нагрузка, возрастающая скорость = сила→скорость за 4 звена
  • Phase 3 = перенос Phase 2 (мощь) в линейную скорость и смену направления

PEP PHASE 3 — ПРОГРЕССИЯ НЕДЕЛЬ 13–14:
(Продолжение 4-дневной структуры; ключевые изменения vs Нед.11–12 описаны ниже)

ДЕНЬ 1 — Linear Acceleration + Horizontal Power (Нед.13–14):
  Wall Speed Mechanics (обновлённые варианты):
    Нед.13: добавляются «Double Wall Quick Switch» (2 ноги у стены одновременно, 2×10/ст.),
             Band Resisted Acceleration Knee Drive (лента, стоя у стены, 2×6-10 сек),
             Single Leg Band Wall Piston (banded вариант), Pull Through to Piston Triples (по 3 в серии)
    Нед.14: все варианты Banded — Banded Pistons / Banded Pull Through to Piston / Banded Max Pistons (max скорость 2×10 сек)

  Нед.13 A-блок:
    A3: Quick Single Leg Box Jump Steps (Explosive, 3×3-4 боксов подряд, 10 сек) — прыжки на одной ноге через серию боксов
    A4: Falling 10 Sprint (Explosive, 3×1, Полный отдых 3 мин) — НОВЫЙ старт: падение вперёд → взрывной спринт 10 ярдов

  Нед.14 A-блок (ПОЛНАЯ СМЕНА СТРУКТУРЫ — тяжёлый/прыжки/лёгкий/стойка):
    A1: Heavy Sled Push (Explosive, 3×10 yd, 10 сек) — толчок тяжёлых саней (не тяга!)
    A2: Sprinter Bounds (Explosive, 3×20 yd, 10 сек) — прыжки-шаги спринтера
    A3: Light Sled Sprints (Explosive, 3×10 yd, 10 сек) — лёгкие сани для контраста
    A4: Sprint 3-Point Stance (Explosive, 3×10 yd, Полный отдых 3 мин) — старт из упора трёх точек (американский футбол)

  Нед.13 B-блок:
    B2: Band Quick Drop Resisted Jumps (Explosive, 4×3, 10 сек) — прыжок с быстрым сбросом с высоты + лента (вместо Depth Jump)

  Нед.14 B-блок:
    B1: Barbell Hip Thrust Band Resisted (Explosive, 3×3-5, 10 сек) — с лентой сопротивления
    B2: Band Resisted Drop to Broad Jump (Explosive, 3×3, 10 сек) — падение + прыжок в длину + лента
    B3: Kettlebell Swing w/Band (та же)
    B4: Bounds (Explosive, 3×10-20 yd, Полный отдых)

  Нед.13 C-блок (НОВЫЕ УПРАЖНЕНИЯ вместо Нед.11-12):
    C1: Alternating Med Ball Split Jumps (Explosive, 2×5/сторону) — прыжки в сплите с медболом
    C2: Alternating Med Ball Sprinter Sit-Ups (1-1-0, 2×10/сторону) — сит-апы спринтера с медболом
    C3: GHD Loaded Eccentrics (1-3-0, 2×5, 1.5 мин) — медленный эксцентрик (3 сек вниз) на GHD

  Нед.14 C-блок:
    C1: DB Alternating Split/Tuck Jumps (Explosive, 3×5/ст.) — прыжки в сплите или колени к груди с гантелями
    C2: GHD Med Ball Throw (1-1-0, 3×3-5, 2 мин) — бросок медбола с GHD (гиперэкстензия + взрыв)

  Нед.14 D-блок (Core финишёр, НОВЫЙ):
    D1: Barbell Rollout with Bands (Control, 2×5-8) — роллаут с грифом + лента сопротивления
    D2: Barbell Overhead Sit-Ups (Control, 2×5-8, 1.5 мин) — сит-ап с грифом над головой

ДЕНЬ 2 — COD + Horizontal Push Pull (Нед.13–14):
  Нед.13 Разминка — Lower Body Flow (1×5/сторону):
    Squat → Reverse Lunge → Side Lunge → Jump Squat → Split Stance Jumps → Side Lunge Switch Jumps
    (интегрированная цепочка нижней части тела вместо стандартной разминки)

  Нед.13 A-блок: те же Med Ball вращения; A3 → Band Crossover Sprint (3×3 шага, 2-3 мин)

  Нед.13 B-блок (изменения):
    B2: Band Shoulder Press (Explosive, 2×10) — вместо Upward Rotation and Press
    B3: Band Bent Over Row (1-1-0, 2×10) — вместо Band Lat Pull Down

  Нед.14 Разминка (наиболее сложная — реактивный комплекс):
    Box Elevated Single Leg Jump to Turn and Stick (3×1/ст.) — прыжок с бокса + поворот + приземление
    Box Elevated Single Leg Jump Backwards (3×1/ст.) — прыжок назад с бокса + stick
    3D Partner Reactive Med Ball Throw (3×3/ст.) — партнёр бросает медбол в 3 направлениях
    Med Ball Skater Jump Slam to Throw (3×3/ст.) — прыжок конькобежца + слэм + бросок
    Box Band Resisted Crossover Sprints (3×10 yd/ст.)
    Band Resisted Lateral Hurdle Step Overs (3×3 барьера × 3) — боковые барьеры с лентой

  Нед.14 A-блок: Band Cobra Press (A2 — вместо Band Shoulder Press) + Band Bent Over Rows + Band Resisted Push-Ups (A4)

  Нед.14 B-блок (горизонтальный жим):
    B3: Decline DB Neutral Grip Press (Control, 3×5/ст., 10 сек) — наклонная жим нейтральный хват
    B4: Light Med Ball Single Arm Throw (Explosive, 3×3/ст., 2-3 мин) — однорукой бросок медбола

  Нед.14 C-блок (горизонтальная тяга):
    C1: Barbell Row with Bands (Control, 3×3, 10 сек) — тяга грифа + лента
    C3: DB Alternating Rows (Control, 3×5/ст., 10 сек) — поочерёдная тяга гантелей
    Rapid Pull D-chain (D-блок): Barbell Row → Heavy Band Rapid Pull → Rapid Sled Pull → Rapid Band Pull — та же цепь

ДЕНЬ 3 — Linear Speed + Vertical Power (Нед.13–14):
  Нед.13 Разминка — наземный мобилизационный комплекс (ПОЛНАЯ СМЕНА):
    Cat-Cow (6-8), T-Spine Mobility (6-8), Plank Pike (6-8), Downward Dog to Cobra (6-8),
    Side Plank Reach Over (6-8), Hip Rocks / 90-90 Reach (6-8), Hamstring Kicks, Side Lying Leg Raises,
    Gas Pedals, Groiners — всё на земле (vs беговые упражнения Нед.11-12)
    Активация: X Band Lateral Band Walks (1×10 yd в обе стороны), Single Leg Band Glute Pistons (2×10/ст.)

  ПРИНЦИПИАЛЬНОЕ ОТЛИЧИЕ НЕД.13: TOP END MECHANICS вместо Wall Acceleration Drills:
    Stick Walking A's (2×10 yd) — ходьба с палкой, механика «А» верхней скорости
    Stick Thigh Switch (2×10 yd) — переключение бёдер с палкой (контроль бедра)
    Stick Thigh Switch 1-2-3 (2×10 yd) — прогрессия 1-2-3 переключений
    Stick High Knee Run (2×10 yd) — бег с высоким коленом, палка над головой
    → Это МАКСИМАЛЬНАЯ СКОРОСТЬ (top-end), а не ускорение с места

  Нед.13 A-блок: A3 = Med Ball Sprint (держишь медбол во время спринта 20 yd)
  Нед.14 A-блок: A1=Heavy Fast Sled Drag Sprint (тяга тяжёлых саней бегом, 10 yd), A2=10 Yard Pogos (пого-прыжки 10 yd)

  Нед.13 B-блок (ПРОГРЕССИЯ к одноногому):
    B2: Single Leg Box Jump (Explosive, 4×3, 10 сек) — одноногий прыжок на бокс
    B3: Split Stance Alternating Trap Bar Jumps (Explosive, 4×3/ст., 10 сек) — TBJ в сплите, поочерёдно
    B4: Single Leg Pogo Hop to Box Jump (Explosive, 4×3/ст., 3 мин) — пого на одной → прыжок на бокс

  Нед.14 B-блок:
    B1: Explosive Band Trap Bar Deadlift (Explosive, 4×3, 10 сек) — TBJ BANDED (с лентой!)
    B2: DB Box Rocker Jump (Explosive, 4×3, 10 сек) — качание на боксе + взрывной прыжок с гантелями
    B3: Split Stance Alt DB Jumps (Explosive, 4×3/ст., 10 сек) — сплит-прыжки с гантелями
    B4: Split Stance Alt Jump to Box Jump Single Leg Landing (Explosive, 4×3/ст., 3 мин) — приземление на одну ногу!

  Нед.14 C-блок:
    C1: Heavy DB Box Lateral Step Up to Press (Control, 2×3-5/ст.) — боковой зашаг на бокс + жим
    C2: Light DB Alternating Lateral Offset Box Jumps with Press (Control, 2×3-5/ст.) — боковые прыжки с оффсетом + жим

  Нед.13 D1: Push-Up Bear Crawl (Control, 1-2×AMRAP, 3-4 мин) — медвежья ходьба с отжиманием
  Нед.14 D: Bar Balance Push-Ups (Control, 2×10) + Push-Up Hold to Med Ball Switch (1-2×5/ст., 2 мин)

ДЕНЬ 4 — COD-Reactive Agility + Vertical Push Pull (Нед.13–14):
  Нед.13 Разминка — НОВЫЕ реактивные элементы:
    SL Sprinter Jump to Lateral Push-Step (1×5 yd) — прыжок спринтера → боковой шаг
    45° Monster Band Walks (Above Knees, 1×10 yd) — диагональные прогулки с лентой

  Нед.13 Multi-Directional Speed — ПРОГРЕССИЯ когнитивных дриллов:
    Mini Hurdle Crossover Step to Catch and Sprint — добавлен «поймай мяч» + спринт
    3 Cone Mirror Drill with Tuck Jump & Tennis Ball Catch (3×4) — зеркало + tuck jump + поймай мяч (самый сложный вариант!)
    Backpedal to Gap Fill and Catch (без изменений)

  Нед.14 Разминка — 8-упражнений Quick Feet Ladder (лестница скорости):
    Single Leg A-Run (2×Full), Single Step (2×Full), Double Step (2×Full), Ickey Shuffle (2×Full),
    Lateral Side Step (2×Full),
    Big Ickey Shuffle to Reaction Sprint (2×Full) — НОВОЕ: большой Ickey → реакция + спринт
    Lateral In and Out to Reactive Catch (2×Full) — НОВОЕ: боковые вход-выход + поймай мяч
    Lateral In and Out to Back-Pedal and COD (2×Full) — НОВОЕ: боковые → пятиться → смена направления

  Нед.13 B-блок:
    B4: DB Step Up to Press (Fast, 3×5, 2 мин) — зашаг + жим (вместо DB Split Stance Jerk)

  Нед.14 B-блок:
    B3: Landmine Single Arm Clean Rotational Split Jerk (Fast, 3×5) — НАИБОЛЕЕ СЛОЖНЫЙ вариант: одноруч. клин + поворот + сплит-толчок (Olympic-стиль)
    B4: DB Split Jerk (Fast, 3×5/ст., 2 мин)

  Нед.13 C-блок:
    C3: Explosive Barbell Band Horizontal Row (Control, 3×5) — НОВОЕ: горизонтальная тяга с грифом + лента
    C4: Cable Ski Erg (та же)

  Нед.14 C-блок:
    C1: Pull-Up with Bands (Control, 3×5) — подтягивания с лентой (ассистент)
    C4: Med Ball Single Arm Reactive Slam (Control, 3×5, 2 мин) — реактивный слэм медбола одной рукой

  Нед.13 D1: Swiss Ball Circuit — Pistons + Knee Drive + Curl (Control, 2×10/ст.) — 3 упражнения на Swiss Ball
  Нед.14 D1: DB 4D Push-Ups (Control, 3×1 угол, 2 мин) — отжимания в 4 направлениях с гантелями

ПРИНЦИПЫ ПРОГРЕССИИ НЕД.13-14:
  • Нед.13: переход к TOP END механике (stick drills на максимальной скорости) — Нед.11-12 были ускорением, Нед.13 это максимальная скорость
  • Нед.13: усиление одноногих паттернов (SL Box Jump, SL Pogo → Box, SL Sprinter Jump) — вершина унилатерального блока
  • Нед.14 День 1: тяжёлый Push → прыжки → лёгкий → стойка = максимальная контрастная нагрузка на ускорение
  • Нед.14: GHD Med Ball Throw + Barbell Rollout/OH Sit-Up = мощь кора под нагрузкой (пик фазы)
  • Нед.14 Day 2: полный реактивный разогрев (партнёрские броски, прыжки на бокс, слэм + бросок) — когнитивно-реактивный разогрев до основной работы
  • Нед.14 Day 4: лестница ПЕРЕД работой = нервно-мышечная активация для реактивной скорости
  • Landmine Single Arm Clean Rotational Split Jerk (Нед.14 D4 B3) — финальная кульминация мощности всей Phase 3

СВЯЗИ С ОСТАЛЬНЫМИ ФАЗАМИ:
  ← Phase 2 Нед.7-10: PAP-кластеры → та же структура, но теперь с линейным ускорением и COD
  → Eccentric/Isometric/Concentric Camp: Phase 3 — пик специальной подготовки перед межсезоньем

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PEP PHASE 3 — ДЕLOAD (НЕДЕЛЯ 15)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Структура: 4 дня, объём снижен ~30-40%, интенсивность и паттерны сохранены.
Финальная неделя Phase 3 перед Eccentric/Isometric/Concentric Camp.

ДЕНЬ 1 — Linear Acceleration + Horizontal Power (Нед.15 Деload):

Glute/Hip Activation (дополнительно): Single Leg Band Glute Pistons (1×10/ст.) + Band Resisted Acceleration Knee Drive to Stand Up (1×5 сек)

A-блок (4 звена — контраст, 3 подхода):
  A1: 5 Second Max Piston to Heavy Sled Push (Explosive, 3×10 yd, 10 сек)
      — максимальный Piston у стены 5 секунд → немедленно тяжёлый Push Sled (нейронная активация перед нагрузкой)
  A2: Sprinter Bounds (Explosive, 3×20 yd, 10 сек) — прыжки-шаги спринтера
  A3: Hop Back to Light Sled Sprint (Explosive, 3×10 yd, 10 сек)
      — НОВОЕ: отпрыгнуть назад (eccentric loading) → реактивный старт → лёгкие сани
  A4: Alternating Split Jump to 10 Yard Sprint (Explosive, 3×10 yd, Полный отдых 3 мин)
      — поочерёдные сплит-прыжки → немедленный спринт 10 yd (прыжковый старт)

B-блок (PAP, 3 подхода, те же 10-сек паузы):
  B1: Barbell Band Hip Thrust (Explosive, 3×3, 10 сек)
  B2: Band Resisted Drop to Broad Jump (Explosive, 3×3, 10 сек)
  B3: Kettlebell Swing w/Band (Explosive, 3×5, 10 сек)
  B4: Single Leg Hurdle Hops to Board Jump (Explosive, 3×10 yd, Полный отдых 3-4 мин)
      — НОВОЕ: одноногие прыжки через серию барьеров → приземление на доску (board = координация приземления)

C-блок (силовой деload — унилатеральный):
  C1: DB Bulgarian Split Squat (Controlled, 3×5/ст., xxx)
      — ВОЗВРАТ к силовому сплит-приседу (первый раз в Phase 3) — деload паттерн
  C2: DB Rear Foot Elevated Sprinter Jump (1-1-0, 3×5/ст., 2 мин)
      — RFE позиция + взрывной прыжок из неё (переход от силы к мощи)

D1 — GHD Двойная структура (чередование по сетам, 1-1-0, 3×3-5, 2 мин):
  Сет 1: GHD Med Overhead Med Ball Throw — бросок медбола над головой с GHD
  Сет 2: GHD Nordic Curl Overspeed Chest Pass — Nordic Curl эксцентрик на GHD + overspeed пас медбола вперёд
  (чередование означает: Сет1=Throw, Сет2=Nordic, Сет3=Throw)

ДЕНЬ 2 — COD + Horizontal Push Pull (Нед.15 Деload):

Разминка (расширенная Ground Base + Plyometric):
  Lower Body Flow (1×5/движение): Single Squat to Side Lunge, Squat, Reverse Lunge, Sprinter Hip Hinge, Drop Squat, Hip Flips
  Monster Band Walk (Bands on Feet) 1×5 yd/ст.
  Single Leg Abduction Around the World (1×5/угол)
  Plyometrics: Depth Jump to Lateral Med Ball Throw (3×2/ст.) — прыжок с глубины + боковой бросок
  Med Ball Lateral Step Over (3×5/ст.) — перешаг медбол боком
  Lateral Step Over to Reaction Sprint (3×10 yd) — НОВОЕ: перешаг → реактивный спринт

A-блок (deload объём = 2 подхода):
  A1: Band Pull-Aparts (Controlled, 2×20, xxx)
  A2: Incline Bench Cobra Press (Controlled, 2×8, xxx) — НОВОЕ: Cobra Press на наклонной скамье
  A3: Band Resisted Rows (Controlled, 2×10, 2 мин) — лёгкая активация тяги

B-блок (горизонтальный жим, 3 подхода):
  B1: Bench Press (Explosive, 3×3, 10 сек)
  B2: Med Ball Chest Pass (Explosive, 3×10, 10 сек)
  B3: Decline DB Neutral Grip Bench Press (Controlled, 3×5/ст., 10 сек)
  B4: Light Med Ball Single Arm Seated Throw (Explosive, 3×3/ст., 2-3 мин) — SEATED вариант (vs стоя)

C-блок (Rapid Pull Chain — та же 4-звенная структура):
  C1: Barbell Band Resisted Row (Controlled, 3×3, 10 сек)
  C2: Heavy Band Rapid Pull (Fast, 3×5, 10 сек)
  C3: DB Alternating Rows (Controlled, 3×5/ст., 10 сек)
  C4: Rapid Band Pull (Fast, 3×10, 2-3 мин)

D1: Bicep Complex (Controlled, 1×xxx, xxx) — 1 подход деload

ДЕНЬ 3 — Linear Speed + Vertical Power (Нед.15 Деload):

Разминка: беговая серия (Forward/Back Skip, Open/Close, Reach Overs, Lateral Side Skip, Carioca, Lunge Reach, Side Lunge, Cross Body Superman, Inch Worm, Leg Swings)
Glute Activation: Lying Clam Shells (1×20 обе стороны), Hip Flexor Core Lying Sprinter Knee Drive (1×10 обе стороны)

Top End Stick Drills (1 подход каждый — деload объём):
  Walking A's (1×10 yd), Thigh Switch (1×10 yd), Thigh Switch 1-2-3 (1×10 yd), High Knees (1×10 yd)

A-блок (3-звенный контраст):
  A1: Heavy Fast Sled Drag Sprint (Explosive, 3×10 yd, 10 сек)
  A2: 10 Yard Sprinter Pogos (Explosive, 3×10 yd, 10 сек)
  A3: Med Ball Sprint (Explosive, 3×20 yd, 2-3 мин)

B-блок (4 подхода, 10-сек паузы):
  B1: Trap Bar Deadlift (Explosive, 4×3, 10 сек) — без ленты (vs Explosive Band TBJ Нед.14)
  B2: DB Box Rocker Jump to Box Jump (Explosive, 4×3, 10 сек) — Box Rocker + финальный прыжок на бокс
  B3: Split Stance Alternating Trap Bar Jumps (Explosive, 4×3/ст., 10 сек)
  B4: Split Stance Alt Jump to Box Jump Single Leg Landing (Explosive, 4×3/ст., 3 мин)

C-блок (деload = 2 подхода):
  C1: Heavy DB Box Lateral Step Up to Press (Control, 2×5/ст., xxx)
  C2: Light DB Alternating Lateral Offset Box Jumps w/Press (Control, 2×5/ст., 2 мин)

D-блок (Bar Balance серия, прогрессия):
  D1: Bar Balance Push-Ups with Rotation (Control, 3×5/ст., xxx) — отжимание на барах + ротация
  D2: Bar Balance Push-Up to Knee Drive (Control, 3×5/ст., 2 мин) — НОВОЕ: из планки на барах → колено к груди

ДЕНЬ 4 — COD-Reactive Agility + Vertical Push Pull (Нед.15 Деload):

Разминка — Flow Skip Series + Rapid Response Series (ритм / быстрая реакция):
  Flow Skip Series (1 мин каждый): Normal Skip → Forward & Back Switch → In & Out → High Knees → Side to Side Pogo Jumps
  Rapid Response Series (1-2 подхода × 5 сек каждый): In & Out → Quick Feet → Quick Inside Jab Step
  Итого: ~8-10 мин нейронной активации ритмом и координацией

A-блок (деload = 2 подхода):
  A1: Band Pull-Aparts (1-1-0, 2×10-20, xxx)
  A2: Upward Rotation and Press (Explosive, 2×10, xxx)
  A3: Band Lat Pull Down (1-1-0, 2×10, xxx)

B-блок (вертикальный жим, 3 подхода):
  B1: Barbell Overhead Press (Control, 3×5, xxx)
  B2: Lying Backwards Med Ball Throw (Fast, 3×5, xxx)
  B3: Landmine Rotational Clean and Press (Fast, 3×5, xxx)
      — УПРОЩЕНИЕ vs Нед.14 (Landmine Single Arm Clean Rotational Split Jerk) — деload вариант без сплит-ноги
  B4: DB Split Jerk (Fast, 3×5/ст., 2 мин)

C-блок (вертикальная тяга, 3 подхода):
  C1: Pull-Up (Weighted) (Control, 3×5, xxx)
  C2: Lying Med Ball Med Throw (Explosive, 3×5, xxx)
  C3: Explosive Barbell Band Horizontal Row (Control, 3×5, xxx)
  C4: Med Ball Single Arm Reactive Slam (Control, 3×5, 2 мин)

D1: Med Ball Push-Up Circuit (Control, 3×5 каждого вида, 2 мин):
  Close Grip Push-Up → Single Arm Push-Up → Alternating Single Arm Push-Up → Full Extension Straight Arm Push-Ups
  (4 прогрессии с медболом — финишёр Phase 3)

ПРИНЦИПЫ ДЕLOAD НЕДЕЛИ 15:
  • Объём снижен примерно 30-40% (меньше, чем Phase 2 Deload — это «активный деload»)
  • ВСЕ паттерны сохранены — снижение идёт через меньше подходов в C/D, не через смену упражнений
  • GHD Nordic Curl + Overspeed Chest Pass (День 1 D): уникальная комбинация — эксцентрик подколенных + скоростной пас (ЦНС активация + сила одновременно)
  • Hop Back to Light Sled (День 1 A3): эксцентрическая загрузка (отпрыжка назад) → немедленная концентрическая скорость (старт в лёгкие сани) — эффект упругости
  • DB Bulgarian Split Squat (День 1 C1): первый тяжёлый сплит-присед в Phase 3 — используется как восстановительное силовое упражнение
  • Flow Skip + Rapid Response (День 4): ритмическая координация + нейронная активация вместо интенсивных когнитивных дриллов Нед.11-14
  • Landmine Rotational Clean & Press (vs Split Jerk Нед.14): убрана ударная нагрузка на суставы при сохранении взрывного паттерна

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ПРИНЦИПЫ ВНЕ СБОРОВ (игровой / обычный период)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Не повторять один вектор нагрузки чаще раза в 48–72 ч.
• Взрывная работа всегда первой — ЦНС должна быть свежей.
• DUP (волнообразная периодизация): чередуй от сессии к сессии — силовая (3–5 повт.) / гипертрофия (6–12) / мощность (2–5, max velocity) / выносливость (12–20).
• Игровой период: 1–2 зала/нед., поддержание без накопления, не доводить до крепатуры перед игрой.
• Межсезонье: 3–4 зала/нед., накопление объёма, deload каждые 3–4 недели.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЗВС — ЗАРЕЧЬЕ ВОЛЕЙБОЛЬНАЯ СИСТЕМА
(собственная методология клуба; при выборе focus zvs_* — приоритет над PEP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

СЕЗОН КЛУБА: сборы с 13 июля; первая игра 26 августа; соревновательный период до мая 2027; ~60 игр/сезон; плавающий игровой график (нет фиксированного дня недели).
РАСПИСАНИЕ: тренер указывает в комментарии дни до игры и дни перелётов. Примеры: "3 дня до игры", "1 день до игры + перелёт завтра", "день после игры (перелёт был вчера)", "через 2 дня перелёт, через 4 дня игра". Перелёт = дополнительный стресс, снижай нагрузку как на день перед игрой. При 2 игровых неделях (например, "игра в среду + игра в субботу") — силовой день сразу после первой игры, мощностной перед второй.

5 КЛЮЧЕВЫХ ПРИНЦИПОВ:
  1. ВЕРТИКАЛЬНОСТЬ — каждый PAP-кластер завершается прыжком вверх. Горизонтальная работа (sled, bounds) — вспомогательная, не доминирующая.
  2. РАЗБЕГ КАК ОФП — 3/4-шаговый разбег тренируется в зале под нагрузкой: Resisted Approach Jump (лента/манжеты), Weighted Approach to Box, подход по маркерам.
  3. БЛОКИРУЮЩИЙ КЛАСТЕР — отдельный тип работы: lateral bound/crossover → bilateral box jump. Обязателен 1 раз/нед для центральных, 1 раз/2 нед для остальных.
  4. JLU (Jump Load Units) — счётчик прыжковой нагрузки. Указывай в periodization_note:
       Тяжёлый прыжок (drop/depth jump, weighted approach jump) = 2 JLU
       Средний прыжок (approach без нагрузки, block drill, box jump) = 1.5 JLU
       Лёгкий прыжок (landing drill, step-up to jump) = 1 JLU
  5. ПОЗИЦИОННАЯ ДИФФЕРЕНЦИАЦИЯ — позиция из профиля игрока или комментария тренера адаптирует D-блок и отдельные упражнения B-блока.

4 ЗОНЫ ПРОФИЛАКТИКИ (ОБЯЗАТЕЛЬНЫЙ E-БЛОК КАЖДОЙ СЕССИИ):
  E1 — ПОЯСНИЦА/КОР: anti-extension (Dead Bug, Barbell Rollout) или anti-rotation (Pallof Press).
  E2 — ПЛЕЧО: Band ER 2×10-15/ст. + Y-T-W или Band Pull-Apart. Объём тяги ≥ объёму жима в сессии.
  E3 — ГОЛЕНОСТОП: SL Balance (foam/закрытые глаза/perturbation) 2×20-30 сек/ст. + Tibialis Anterior Raise.
  E4 — КОЛЕНИ/СУХОЖИЛИЕ:
       Фаза 1: Spanish Squat изо-удержание 45°, 3×30-40 сек.
       Фазы 2-3: Nordic Curl Eccentric с поддержкой, 3×3.
       Сезон (силовой день): Nordic Curl 2×3 контролируемый.
       Сезон (мощностной/восстановление): Spanish Squat Hold 2×20-30 сек.

──────────────────────────────────
ЗВС ФАЗА 1 — СИЛОВАЯ БАЗА С ВОЛЕЙБОЛЬНОЙ СПЕЦИФИКОЙ (нед.1-2, 13-26 июля; JLU ≤350; RPE 7-8)
──────────────────────────────────
КОНТЕКСТ: игроки прошли 3 недели × 3 тренировки силовой подготовки ДО 13 июля. Приходят готовыми к полному объёму работы. Не нужно начинать с нуля — сразу переходим к специфике волейбола.

A-блок (PAP-пары с первой тренировки):
  A1: Squat или Hip Hinge 75-82% 1ПМ, 3-4×4-5, темп 3-0-X-0 — 10 сек покой
  A2: Box Jump bilateral, 3-4×4 = 6 JLU — Полный отдых 2.5-3 мин
  Нед.2: увеличить A1 до 80-85%, добавить A3 = Approach Jump лёгкий 3×3 = 4.5 JLU

B-блок (нижнее тело, чередование knee/hip):
  Тр.1/3: Squat или Bulgarian Split Squat, 4×5, 78-82%, темп 3-0-X-0
  Тр.2/4: RDL или Hip Thrust, 4×5, RPE 7-8
  Прогрессия: Нед.2 → унилатеральный вариант обязателен (SL RDL, Split Squat)

C-блок (верхнее тело): Bench Press + Pull-Up 4×5, RPE 7-8. Push Press с Нед.2.

D-блок (МЕХАНИКА ПРИЗЕМЛЕНИЯ + первый разбег):
  Тр.1-2: SL Box Drop → Stick Landing 3×3/ст. = 3 JLU (точность, не скорость)
  Тр.3-4: Подход 3 шага по маркерам без прыжка 3×6 + Box Jump 30-40 см 3×4 = 6 JLU

E-блок (полный по 4 зонам; E4 = Spanish Squat 3×30-40 сек → Нед.2 Nordic Eccentric 3×3).

──────────────────────────────────
ЗВС ФАЗА 2 — СИЛОВАЯ БАЗА (нед.3-4, 27 июля — 9 августа; JLU ≤350; RPE 7-8)
──────────────────────────────────
A-блок (первые PAP-пары, лёгкий контраст):
  A1: Squat/RDL 75-80% 1ПМ, 3-4×4-5, темп 3-0-X-0 — 10 сек
  A2: Box Jump bilateral 3-4×4 — Полный отдых 2-2.5 мин = 6 JLU/сет
  Нед.3 → суммарно ≤200 JLU; Нед.4 → до 350 JLU.

B-блок (чередование дней knee/hip):
  День 1/3: Squat (knee-dominant) 4×5, 78-82%.
  День 2/4: RDL или Hip Thrust (hip-dominant) 4×6, RPE 7-8.
  С Нед.4 добавить Bulgarian Split Squat (начало унилатерального).

C-блок: Bench Press + Pull-Up 4×5, RPE 7-8. С Нед.4 Push Press 3×4.

D-блок (МЕХАНИКА РАЗБЕГА — начало):
  D1: Подход 3 шага по маркерам без прыжка, 3×6 (ритм + стопор).
  D2: Подход 3 шага → низкий Box Jump (30-40 см), 3×4 = 6 JLU.

E-блок (E4 = Nordic Curl эксцентрик с поддержкой 3×3).

──────────────────────────────────
ЗВС ФАЗА 3 — МОЩНОСТЬ И ПЕРЕНОС (нед.5-6, 10-25 августа; JLU ≤500; RPE 8-9)
──────────────────────────────────
Нед.6 (19-25 авг) — ТЕЙПЕР: объём -30%, интенсивность сохранена. JLU ≤300.

A-блок (полный PAP-кластер, 10 сек между звеньями):
  A1: Squat/RDL 80-87.5% 1ПМ, 3-4 повт. — 10 сек
  A2: Depth Jump → Box Jump, 3 повт. = 6 JLU — 10 сек
  A3: Подход 4 шага → Max Jump, 3 повт. = 4.5 JLU — Полный отдых 3-4 мин

B-блок (позиционно адаптируется):
  Доигровщик/Диагональный: SL RDL 3×5/ст. + SL Box Jump 3×3/ст. = 9 JLU
  Центральный: Heavy Squat 4×3 85% + Lateral Bound → Box Jump 3×3 = 9 JLU
  Либеро: Lateral Shuffle Deceleration 3×5/ст. = 0 JLU
  Связующий: Jump Squat лёгкий (30%) 3×5 = 7.5 JLU

БЛОКИРУЮЩИЙ КЛАСТЕР (замена B-блока 1 раз/нед для центральных):
  B1: Lateral Bound 2 шага → bilateral Box Jump, 3×4 = 6 JLU
  B2: Crossover Step → Block Jump, 3×3 = 4.5 JLU

C-блок (по позиции):
  Доигровщик/Диагональный: Push Press + One-Arm DB Row
  Центральный: Bench Press + Weighted Pull-Up
  Либеро: Band Rows + Band Press (функциональный объём)
  Связующий: Push Press лёгкий + Reverse Fly

D-блок (специфика позиции):
  Доигровщик/Диагональный: Resisted Approach Jump (лента на лодыжках), 3×3 = 9 JLU
  Центральный: Rapid Lateral Step → Jump (быстрый первый шаг), 3×4 = 6 JLU
  Либеро: Reactive COD Drill (зрительный стимул → движение + низкая позиция), 3×5
  Связующий: Jump Set Drill (прыжок из движения + имитация передачи), 3×6 = 9 JLU

E-блок (E4 = Nordic Curl 2×3 + полный prehab).

──────────────────────────────────
ЗВС СЕЗОН — СИЛОВОЙ ДЕНЬ (3+ дней до следующей игры; JLU ≤120; 55-65 мин)
──────────────────────────────────
Тренер указывает "X дней до игры" в комментарии — чем больше дней, тем выше можно объём.

A-блок (PAP средний):
  A1: 80-85% 1ПМ, 3×4-5 — 10 сек
  A2: Box Jump или Depth Jump, 3×3 = 9 JLU — Отдых 2.5-3 мин

B-блок (по позиции):
  Доигровщик: Bulgarian Split Squat 3×5/ст. + SL Box Jump 3×2 = 6 JLU
  Центральный: Heavy Squat 3×4 (85%) + Lateral Box Jump 3×2 = 6 JLU
  Либеро: Lateral Lunge 3×6/ст. + Hip Thrust (без прыжка) = 0 JLU
  Связующий: Split Squat умеренный 3×5/ст. = 0 JLU

C-блок: Bench Press + Pull-Up 3×4-5 (обязателен горизонт.жим + вертикальная тяга).

D-блок (позиционная специфика):
  Доигровщик: Approach Jump тренировка по маркерам 3-4 подхода = 12-18 JLU
  Центральный: Block Footwork Drill + Box Jump 3×3 = 4.5 JLU
  Либеро: Defensive Shuffle + Reactive Stop Drill
  Связующий: Jump Set Mechanics лёгкий

E-блок (Nordic Curl 2×3 + полные 4 зоны).

──────────────────────────────────
ЗВС СЕЗОН — МОЩНОСТНОЙ ДЕНЬ (1-2 дня до игры; JLU ≤80; 30-40 мин МАКСИМУМ)
──────────────────────────────────
ЖЁСТКОЕ ПРАВИЛО: никто не выходит из зала с мышечной усталостью или болью.
Цель — нейронная активация, не накопление.

A-блок (активационный PAP):
  A1: 85-90% 1ПМ, 2×2-3 — короткий, не объёмный
  A2: Priming Jump, 2×3 = 6 JLU — Отдых 3 мин

B-блок (один, короткий):
  Доигровщик: SL Approach Jump лёгкий (¾ усилия), 2×2 = 6 JLU
  Центральный: Lateral Box Jump quick, 2×2 = 6 JLU
  Либеро: Reactive Shuffle + Quick Stop (0 JLU)
  Связующий: Jump Set × 4 = 4 JLU

C-блок: ТОЛЬКО Band Pull-Apart + 10 отжиманий (активация, не нагрузка).

E-блок (сокращённый, 10 мин): E1×1сет, E2×1сет, E3×1 ст. 20 сек, E4 Spanish Squat 1×20 сек.

──────────────────────────────────
ЗВС СЕЗОН — ВОССТАНОВИТЕЛЬНЫЙ ДЕНЬ (день после игры; JLU=0; 30-40 мин)
──────────────────────────────────
НОЛЬ прыжков. НОЛЬ тяжёлой нагрузки. Только движение и регенерация.

A-блок (Mobility Flow):
  Hip Flexor Eccentrics → Pigeon → Hip CARs → 90/90 Hip Rotation
  Thoracic Open Book → T-Spine Rotation
  Ankle Circuit (Knee-to-Wall, Circles, Dorsiflexion)

B-блок (Тканевая работа):
  Foam Roll Full Body (акцент: quads, IT-band, thoracic, calves) 8-10 мин.
  Band Joint Distraction: hip → ankle → shoulder.

C-блок (Лёгкая изометрия):
  Spanish Squat Hold 3×30 сек. Dead Bug Breathing 2×5/ст. Band ER 2×15/ст.

E-блок (РАСШИРЕННЫЙ — главный приоритет дня):
  E1: McGill Big 3 (Bird-Dog + Side Plank + Modified Curl-Up), 1×8-10.
  E2: Full Shoulder Circuit (YTW + ER + Sleeper Stretch), 2×10.
  E3: SL Balance + Perturbation, 2×30 сек/ст.
  E4: Nordic Curl 1×3 лёгкий (сухожилие нуждается в движении, не отдыхе).

──────────────────────────────────
ЗВС СЕЗОН — ДЕLOAD НЕДЕЛЯ (каждые 6 недель; JLU ≤100)
──────────────────────────────────
Объём -50%, паттерны сохранены. E-блок профилактики НЕ сокращается.

Силовой день деload: A — 2 подхода (vs 3-4), B — 2×3, C — 2×3, D — только техника.
Мощностной день deload: A — 1×3, B — 1-2×3 лёгких.

──────────────────────────────────
ПОЗИЦИОННАЯ ДИФФЕРЕНЦИАЦИЯ ЗВС
──────────────────────────────────

ДОИГРОВЩИК / ДИАГОНАЛЬНЫЙ (Outside Hitter / Opposite):
  Главное: прыжок с разбега + здоровье ударного плеча.
  • D-блок: всегда Resisted Approach Jump или Approach Mechanics.
  • Унилатеральная работа приоритетна (SL RDL, SL Box Jump, SL Landing).
  • Плечо ударной руки: НЕ добавлять вертикальный жим в мощностной день.
  • Норма: объём тяги > жима каждую сессию (защита ротаторной манжеты).
  • Диагональный бьёт вертикально справа → ER-упражнения ещё важнее.

ЦЕНТРАЛЬНЫЙ (Middle Blocker):
  Главное: скорость первого шага в сторону + bilateral прыжок из реакции.
  • Блокирующий кластер (Lateral Bound → Box Jump) обязателен каждую тренировку.
  • Heavy bilateral Squat в каждом B-блоке.
  • Hip Flexor Mobility критично (широкий блок-шаг = перегруз iliopsoas).
  • Ключевые упражнения: Lateral Bound, Box Squat, Crossover Step → Jump, Copenhagen Plank.

ЛИБЕРО:
  Главное: наземная реактивность, деселерация, мобильность бедра.
  • JLU = 0 в восстановительные дни, ≤50 в обычные тренировки.
  • A-блок: мобильность + реактивные наземные движения (NO box jumps).
  • НЕТ heavy squat (не нужен по позиции, риск перегруза при частых приземлениях).
  • D-блок: Reactive COD Drill (зрительный стимул → движение → низкая позиция).
  • Голеностоп: КРИТИЧНО — наибольший риск подвывиха при страховке/приёме.
  • НЕТ overhead press (не нужен по специфике позиции).

СВЯЗУЮЩИЙ (Setter):
  Главное: прыжковая передача + быстрая перестановка + управление нагрузкой.
  • Суммарный объём -20% vs полевые игроки (100% розыгрышей = высокая ЦНС-нагрузка).
  • Запястье/предплечье: НЕ добавлять прямые нагрузки на wrist flexors (перегружены передачей).
  • D-блок: Jump Set Drill (прыжок из движения + имитация передачи).
  • Push Press лёгкий или горизонтальный жим вместо тяжёлого вертикального.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ПРАВИЛА СОСТАВЛЕНИЯ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Нагрузка: RPE или %1ПМ. Конкретные кг — только если тренер указал в комментариях.
• Темп записывай в cue-подсказке: "Опускать строго 5 секунд, взрывной подъём"
• Пары контрастного метода — записывай последовательно в одном блоке (напр. B1=тяжёлое, B2=взрывное) с пометкой "Немедленно после B1, отдых после пары"
• Профилактика плеча (ротаторная манжета, YTW, тяга резинки) — в каждой сессии, всегда в последнем блоке.
• Пиши на русском, профессиональным языком тренера.

Заполни структуру через инструмент build_session.`;

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

  const { playerId, date, dayGoal = '', days = 7, focus = 'inseason', notes = '' } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  const today = todayISO();
  const targetDate = date || today;
  // Allow up to tomorrow so coaches can plan the next session in the evening
  const dayAfterTomorrow = new Date(today + 'T12:00:00');
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  if (targetDate >= dayAfterTomorrow.toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'Дата не может быть позже завтрашнего дня' });
  }

  // Fetch player bio-metrics, session history, and team schedule in parallel
  const [snapshot, sessionSummaries, rawSchedule] = await Promise.all([
    getPlayerSnapshot(String(playerId), Number(days) || 7, targetDate),
    getRecentSessionSummaries(String(playerId), 10).catch(() => []),
    redis('get', 'schedule:team').catch(() => null),
  ]);

  if (!snapshot) return res.status(404).json({ error: 'Player not found' });

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

  const dataSummary = summarizeSnapshot(snapshot);
  const focusLabel = FOCUS_LABELS[focus] || focus;

  const historyBlock =
    sessionSummaries.length > 0
      ? `ИСТОРИЯ ПОСЛЕДНИХ ${sessionSummaries.length} СОХРАНЁННЫХ ТРЕНИРОВОК ИГРОКА:\n${sessionSummaries.join('\n\n')}\n\nНА ОСНОВЕ ИСТОРИИ — перед составлением определи:\n1. Какие векторы/паттерны получили нагрузку в последние 48–72 ч — избегай их или делай лёгкую работу в том же паттерне.\n2. Какой характер нагрузки преобладал в последних сессиях (силовой, объёмный, взрывной) — выбери другой для сегодняшней.\n3. Какие конкретные упражнения повторялись недавно — смени вариацию или замени на другое в том же паттерне.\n4. Логика DUP: куда по волне нагрузки должна идти сегодняшняя сессия.`
      : 'ИСТОРИЯ ТРЕНИРОВОК: нет сохранённых сессий для этого игрока — составь первую тренировку без привязки к предыдущим.';

  const userPrompt = `${dataSummary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${historyBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${scheduleContext}
Фаза подготовки: ${focusLabel}
Цель именно этой тренировки: ${dayGoal || 'не указана — ориентируйся на фазу подготовки и логику периодизации из истории'}
${notes ? `Комментарии тренера: ${notes}` : ''}

Составь ОДНУ тренировку в зале на ${targetDate} — не микроцикл, а конкретно эту сессию.`;

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
        max_tokens: 4000,
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
    const toolUse = data.content?.find(c => c.type === 'tool_use' && c.name === 'build_session');
    if (!toolUse) {
      return res.status(502).json({ error: 'Модель не вернула структурированную тренировку' });
    }

    return res.status(200).json({
      session: toolUse.input,
      player: snapshot.player,
      dataSummary,
      date: targetDate,
      dayGoal,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
