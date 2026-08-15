const DAY_MS = 86400000;

export const MATCH_DAY_EXERCISE_LIBRARY = Object.freeze({
  lowerStrength: [
    'Trap Bar Deadlift',
    'Conventional Deadlift',
    'Goblet Squat (DB)',
    'Goblet Squat (KB)',
    'Rear-Foot-Elevated Split Squat (DB)',
    'Split Squat (DB)',
    'Split Squat ISO',
    'Single-Leg Romanian Deadlift (DB)',
    'Step-Up (DB)',
    'Single-Leg Hip Thrust (DB)',
    'Hang High Pull',
    'Clean Pull from Hang',
    'Snatch Pull from Hang',
    'Snatch-Grip High Pull',
  ],
  lowerBallistic: [
    'Countermovement Jump (CMJ)',
    'Approach Jump',
    'Box Jump (Bilateral)',
    'Pogo Jump',
    'Lateral Bound',
    'Single-Leg Box Jump',
    'Step-Up Jump',
    'Lateral-to-Vertical Jump',
    'Split Jump',
    'Trap Bar Jump',
    'Loaded Jump Squat (DB)',
  ],
  upperStrength: [
    'DB Bench Press',
    'DB Incline Press',
    'Single-Arm DB Bench Press',
    'Push Press',
    'One-Arm DB Row',
    'Chest-Supported DB Row',
    'Isometric Bench Press against Pins',
    'Isometric Row Hold (Band)',
    'Pull-Up',
    'Inverted Row',
  ],
  upperBallistic: [
    'MB Chest Pass',
    'MB Rotational Throw',
    'MB Overhead Throw',
    'MB Scoop Toss',
    'Plyo Push-Up',
  ],
  trunkStrength: [
    'Pallof Press ISO (Band)',
    'Half-Kneeling Pallof Press ISO (Band)',
    'Suitcase Carry (DB)',
    'Dead Bug (Band)',
    'Copenhagen Adductor Plank',
  ],
  trunkBallistic: [
    'MB Rotational Throw',
    'MB Scoop Toss',
    'MB Shot-Put Throw',
    'MB Overhead Slam',
  ],
});

const APPROVED_NAMES = new Set(Object.values(MATCH_DAY_EXERCISE_LIBRARY).flat().map(normalizeName));
const APPROVED_BY_GROUP = new Map(Object.entries(MATCH_DAY_EXERCISE_LIBRARY)
  .map(([group, names]) => [group, new Set(names.map(normalizeName))]));

export const MATCH_DAY_POSITION_PROFILES = Object.freeze({
  middle: 'Центральная: вертикальная мощность, короткий реактивный цикл блока, качество приземления.',
  outside: 'Доигровщица: прыжок с разбега, торможение, ротационная мощность и готовность плечевого пояса.',
  opposite: 'Диагональная: вертикальная мощность, прыжок с разбега, ударная и ротационная мощность.',
  setter: 'Связующая: реактивность, латеральный переход, передача усилия через корпус и плечевой пояс.',
  libero: 'Либеро: первый шаг, латеральная реактивность, торможение, корпус и плечевой пояс.',
});

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dateDistance(from, to) {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

function previousDate(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function positionKey(position = '') {
  const text = String(position).toLowerCase();
  if (/цент|middle|mb/.test(text)) return 'middle';
  if (/доигр|outside|oh/.test(text)) return 'outside';
  if (/диаг|opposite|opp/.test(text)) return 'opposite';
  if (/связ|setter|\bs\b/.test(text)) return 'setter';
  if (/либер|libero|\bl\b/.test(text)) return 'libero';
  return 'outside';
}

function painZonesFrom(readiness = {}) {
  const records = [
    { source: 'утро', record: readiness.morning, fresh: readiness.morningFresh },
    { source: 'после утренней работы', record: readiness.postMorning, fresh: readiness.postMorningFresh },
    { source: 'вечер', record: readiness.evening, fresh: readiness.eveningFresh },
  ].filter(item => item.record);
  const zones = [];
  for (const item of records) {
    for (const [area, detail] of Object.entries(item.record?.zoneDetails || {})) {
      if (detail?.type !== 'pain') continue;
      const raw = Number(detail.level10 ?? detail.level);
      const max = Number(detail.scaleMax) || (detail.level10 != null ? 10 : 5);
      if (!Number.isFinite(raw) || raw <= 0) continue;
      zones.push({ area, level10: Math.min(10, Math.max(1, max === 10 ? raw : raw * 2)), source: item.source, fresh: !!item.fresh });
    }
    if (!Object.keys(item.record?.zoneDetails || {}).length) {
      for (const area of item.record?.painAreas || []) zones.push({ area, level10: null, source: item.source, fresh: !!item.fresh });
    }
  }
  const byArea = new Map();
  for (const zone of zones) {
    const key = String(zone.area).toLowerCase();
    const current = byArea.get(key);
    if (!current || (zone.level10 || 0) > (current.level10 || 0) || (zone.fresh && !current.fresh)) byArea.set(key, zone);
  }
  return [...byArea.values()];
}

export function isApprovedMatchDayExercise(name, group = null) {
  const normalized = normalizeName(name);
  return group
    ? APPROVED_BY_GROUP.get(group)?.has(normalized) === true
    : APPROVED_NAMES.has(normalized);
}

export function matchDayAutomaticRecoveryStatus(decision, isMatchDay = false) {
  if (isMatchDay && ['injury_or_pain', 'previous_injury_or_pain', 'unscored_pain'].includes(decision?.code)) {
    return 'green';
  }
  return decision?.level || 'green';
}

export function matchDayDataFreshness(readiness = {}, targetDate) {
  const previous = previousDate(targetDate);
  const hasCurrentMorning = readiness.exactMorning?.date === targetDate;
  if (hasCurrentMorning) return { key: 'current', label: 'свежая утренняя анкета', volumeModifier: 1 };

  const hasPreviousMorning = readiness.morning?.date === previous;
  const hasPreviousEvening = readiness.evening?.date === previous;
  if (hasPreviousMorning && hasPreviousEvening) {
    return { key: 'previous_day', label: 'утро и вечер предыдущего дня', volumeModifier: 1 };
  }

  const dates = [readiness.morning?.date, readiness.evening?.date, readiness.postMorning?.date, readiness.whoop?.date]
    .filter(Boolean)
    .sort();
  const latest = dates.at(-1) || null;
  const ageDays = latest ? dateDistance(latest, targetDate) : null;
  return {
    key: 'stale',
    label: latest ? `неполные/устаревшие данные (${latest})` : 'данных готовности нет',
    latestDate: latest,
    ageDays,
    volumeModifier: 0.45,
  };
}

export function buildMatchDayPrimerContext({ targetDate, seasonDecision, readiness, position, recoveryStatus = 'green' } = {}) {
  if (seasonDecision?.key !== 'match_day') return null;
  const seriesDay = Math.min(3, Math.max(1, Number(seasonDecision?.calendar?.consecutiveGameDay) || 1));
  const seriesModifier = seriesDay === 1 ? 1 : seriesDay === 2 ? 0.65 : 0.45;
  const freshness = matchDayDataFreshness(readiness, targetDate);
  const recoveryModifier = recoveryStatus === 'red' ? 0.45 : recoveryStatus === 'yellow' ? 0.65 : 1;
  const activeInjuries = readiness?.activeInjuries || [];
  const painZones = painZonesFrom(readiness);
  const shoulderLoad = Math.max(0,
    Number(readiness?.evening?.shoulderLoad) || 0,
    Number(readiness?.postMorning?.shoulderLoad) || 0
  );
  const shoulderPain = Math.max(0, ...painZones
    .filter(zone => /shoulder|плеч|лопат/i.test(zone.area))
    .map(zone => Number(zone.level10) || 0));
  const noOverhead = shoulderLoad >= 4 || shoulderPain >= 4;
  const strongestPain = Math.max(0, ...painZones.map(zone => Number(zone.level10) || 0));
  const painModifier = strongestPain >= 7 ? 0.45 : strongestPain >= 4 ? 0.65 : 1;
  const staleWithInjury = freshness.key === 'stale' && activeInjuries.length > 0;
  const volumeModifier = Math.min(seriesModifier, freshness.volumeModifier, recoveryModifier, painModifier);
  const mode = staleWithInjury
    ? 'modified'
    : volumeModifier <= 0.45
      ? 'minimal'
      : volumeModifier < 1
        ? 'reduced'
        : painZones.length || activeInjuries.length || noOverhead
          ? 'adapted'
          : 'full';
  const positionGroup = positionKey(position);
  return {
    key: 'elite-women-match-day-primer-v1',
    matchStartWindow: '18:00–19:00',
    courtWork: '11:00–12:00: 20 мин общей разминки + 40 мин лёгкой технической работы с мячом без прыжков',
    gymWindow: '12:00–12:25',
    seriesDay,
    seriesModifier,
    freshness,
    recoveryStatus,
    recoveryModifier,
    volumeModifier,
    mode,
    positionGroup,
    positionProfile: MATCH_DAY_POSITION_PROFILES[positionGroup],
    painZones,
    activeInjuries,
    shoulderLoad,
    shoulderPain,
    strongestPain,
    painModifier,
    noOverhead,
    manualSaveRequired: true,
  };
}

export function matchDayDoseProfile(context = {}) {
  const minimal = context.mode === 'minimal' || context.mode === 'modified' || context.seriesDay >= 3;
  const reduced = !minimal && (context.mode === 'reduced' || context.seriesDay === 2);
  if (minimal) {
    return {
      key: context.mode === 'modified' ? 'match-day-primer-modified' : 'match-day-primer-minimal',
      minutes: { min: 10, max: 15 }, exercises: { min: 6, max: 6 }, totalSets: { min: 6, max: 6 },
      hardSets: { min: 0, max: 4 }, jumpContacts: { min: 0, max: 4 }, targetRpe: { min: 2, max: 3 },
      workingSetRpe: { min: 5, max: 6 }, perExerciseSetsMax: 1,
    };
  }
  if (reduced) {
    return {
      key: 'match-day-primer-reduced',
      minutes: { min: 15, max: 20 }, exercises: { min: 6, max: 6 }, totalSets: { min: 8, max: 10 },
      hardSets: { min: 2, max: 6 }, jumpContacts: { min: 2, max: 6 }, targetRpe: { min: 2, max: 4 },
      workingSetRpe: { min: 5, max: 6 }, perExerciseSetsMax: 2,
    };
  }
  return {
    key: 'match-day-primer-full',
    minutes: { min: 20, max: 25 }, exercises: { min: 6, max: 6 }, totalSets: { min: 12, max: 12 },
    hardSets: { min: 4, max: 8 }, jumpContacts: { min: 4, max: 8 }, targetRpe: { min: 3, max: 4 },
    workingSetRpe: { min: 6, max: 6 }, perExerciseSetsMax: 2,
  };
}

export function formatMatchDayPrimerForPrompt(context) {
  if (!context) return '';
  const pain = context.painZones.length
    ? context.painZones.map(zone => `${zone.area}: ${zone.level10 == null ? 'уровень не указан' : `${zone.level10}/10`}`).join('; ')
    : 'не отмечена';
  const injuries = context.activeInjuries.length
    ? context.activeInjuries.map(item => `${item.bodyPart}${item.painLevel != null ? `, боль ${item.painLevel}/10` : ''}`).join('; ')
    : 'нет';
  const library = Object.entries(MATCH_DAY_EXERCISE_LIBRARY)
    .map(([group, names]) => `  ${group}: ${names.join(' | ')}`)
    .join('\n');
  return `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `ИГРОВОЙ ДЕНЬ · УТРЕННИЙ СИЛОВОЙ ПРАЙМЕР (обязательная методология)\n` +
    `• Расписание: ${context.courtWork}; затем зал ${context.gymWindow}; матч ${context.matchStartWindow}.\n` +
    `• Серия матчей: день ${context.seriesDay}/3; режим ${context.mode}; коэффициент объёма ${context.volumeModifier}.\n` +
    `• Данные готовности: ${context.freshness.label}. Утро+вечер предыдущего дня разрешают обычный праймер; неполные или устаревшие данные — только минимальная баллистика/изометрия, без динамической силовой работы.\n` +
    `• Позиционная задача: ${context.positionProfile}\n` +
    `• Боль: ${pain}. Активные статусы: ${injuries}. Не отменяй генерацию: исключи прямую нагрузку болезненной зоны, уменьши ROM/объём при 1–3/10, исключи цепь при 4–6/10, при 7–10/10 оставь только безопасный альтернативный блок и крупное предупреждение.\n` +
    `• Плечо: нагрузка ${context.shoulderLoad || '—'}/5, боль ${context.shoulderPain || '—'}/10.${context.noOverhead ? ' Надголовные жимы запрещены: замени горизонтальным жимом, тягой или безопасным броском медбола.' : ' Надголовный вариант допустим только при свободном безболезненном движении.'}\n` +
    `• Ровно 3 коротких комплекса: A нижняя часть, B верхняя часть, C корпус. В каждом — ровно один силовой/изометрический и один баллистический элемент из утверждённой библиотеки. Сокращай объём числом кругов, а не удалением элемента пары.\n` +
    `• Между силовым и баллистическим элементом 15–30 сек; между кругами полное восстановление. Рабочие повторения очень быстрые, RPE подхода 6/10; session RPE 3–4/10. Стоп при замедлении, ухудшении приземления или боли.\n` +
    `• Силовые/тяговые движения: 1–3 повтора; прыжки/броски: 2–4 повтора. В полном режиме 2 круга; в reduced 1–2; в minimal/modified не более 1.\n` +
    `• Вес: используй три последние успешные экспозиции того же упражнения, предложи консервативный вес для RPE 6. Нет сопоставимой истории — не выдумывай кг, укажи ручной подбор RPE 6. Игрок может изменить вес; фактический вес важнее предложенного.\n` +
    `• Олимпийские производные — только pull/high-pull без ловли. Никаких новых упражнений, отказа, медленной эксцентрики, развивающего объёма или метаболической работы.\n` +
    `• УТВЕРЖДЁННАЯ БИБЛИОТЕКА — названия упражнений выбирай только из этого списка, без переименования и новых аналогов:\n${library}\n` +
    `• Ручное сохранение обязательно после визуальной проверки тренером.\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
}
