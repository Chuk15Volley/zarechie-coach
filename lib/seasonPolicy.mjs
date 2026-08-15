const DAY_MS = 86400000;

export const MANUAL_MATCH_DAY_FOCUS = 'inseason_match_day_primer';

export const SEASON_FOCUSES = new Set([
  'inseason_strength',
  'inseason_power',
  'inseason_prophylaxis',
  'inseason_deload',
  'inseason_accumulation',
  'inseason_conversion',
  'inseason_taper',
  'inseason_md1_activation',
  MANUAL_MATCH_DAY_FOCUS,
]);

export const SEASON_SESSION_TYPES = {
  strength: { focus: 'inseason_strength', trainingType: 'full_body', label: 'Силовая / поддержание' },
  power: { focus: 'inseason_power', trainingType: 'activation_power', label: 'Мощность / скорость' },
  recovery: { focus: 'inseason_prophylaxis', trainingType: 'recovery_prehab', label: 'Восстановление / prehab' },
  primer: { focus: 'inseason_md1_activation', trainingType: 'activation_power', label: 'MD-1 активация' },
  matchDayPrimer: { focus: 'inseason_md1_activation', trainingType: 'activation_power', label: 'Игровой день · силовой праймер' },
  taper: { focus: 'inseason_taper', trainingType: 'activation_power', label: 'Тейпер / пик' },
};

export function isInSeasonFocus(focus = '') {
  return focus === 'inseason' || SEASON_FOCUSES.has(String(focus));
}

export function isManualMatchDayFocus(focus = '') {
  return String(focus) === MANUAL_MATCH_DAY_FOCUS;
}

export function shiftIsoDate(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function dayDistance(from, to) {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

function normalizeEvents(events) {
  return (Array.isArray(events) ? events : [])
    .filter(event => event?.date && event?.type)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function seasonCalendarContext(events, targetDate) {
  const normalized = normalizeEvents(events);
  const games = normalized.filter(event => event.type === 'game').map(event => event.date);
  const todayEvent = normalized.find(event => event.date === targetDate) || null;
  const previousGame = games.filter(date => date < targetDate).at(-1) || null;
  const nextGame = games.find(date => date > targetDate) || null;
  const daysSinceGame = previousGame ? dayDistance(previousGame, targetDate) : null;
  const daysToGame = nextGame ? dayDistance(targetDate, nextGame) : null;
  const travelToday = todayEvent?.type === 'travel';
  const travelWithinTwoDays = normalized.some(event =>
    event.type === 'travel'
    && event.date > targetDate
    && dayDistance(targetDate, event.date) <= 2
  );
  const congested = daysSinceGame != null && daysSinceGame <= 3 && daysToGame != null && daysToGame <= 3;
  let consecutiveGameDay = todayEvent?.type === 'game' ? 1 : 0;
  if (consecutiveGameDay) {
    for (let offset = 1; offset <= 2; offset += 1) {
      if (!games.includes(shiftIsoDate(targetDate, -offset))) break;
      consecutiveGameDay += 1;
    }
  }
  return {
    todayEvent,
    previousGame,
    nextGame,
    daysSinceGame,
    daysToGame,
    travelToday,
    travelWithinTwoDays,
    congested,
    consecutiveGameDay,
  };
}

function matchStatus(load) {
  const status = String(load?.status || 'unknown');
  return ['high', 'medium', 'low', 'none', 'inactive'].includes(status) ? status : 'unknown';
}

export function resolveSeasonSession({
  events = [],
  targetDate,
  requestedFocus = 'inseason_strength',
  requestedTrainingType = 'full_body',
  previousMatchLoad = null,
} = {}) {
  const calendar = seasonCalendarContext(events, targetDate);
  const played = matchStatus(previousMatchLoad);
  let resolved = {
    focus: requestedFocus,
    trainingType: requestedTrainingType,
    key: 'coach_selected',
    label: 'Выбор тренера',
    overridden: false,
    reason: 'Календарь не требует защитной смены типа сессии.',
  };

  const apply = (profile, key, reason) => {
    resolved = { ...profile, key, reason, overridden: profile.focus !== requestedFocus || profile.trainingType !== requestedTrainingType };
  };

  if (calendar.todayEvent?.type === 'game') {
    apply(SEASON_SESSION_TYPES.matchDayPrimer, 'match_day', `День матча, игра ${calendar.consecutiveGameDay || 1}/3 подряд: индивидуальный full-body силовой праймер без накопления усталости.`);
  } else if (calendar.travelToday) {
    apply(SEASON_SESSION_TYPES.recovery, 'travel_day', 'День переезда: только мобильность, кровоток и prehab.');
  } else if (calendar.daysSinceGame === 1 && !['low', 'none'].includes(played)) {
    apply(SEASON_SESSION_TYPES.recovery, 'md_plus_1', `MD+1, игровая нагрузка: ${played}. Тяжёлая сила и прыжки запрещены.`);
  } else if (calendar.daysToGame === 1 || (calendar.daysToGame === 2 && calendar.travelWithinTwoDays)) {
    apply(SEASON_SESSION_TYPES.primer, 'md_minus_1', 'Матч/переезд в ближайшие 24–48 ч: короткая активация без накопления усталости.');
  } else if (calendar.congested || calendar.daysToGame === 2) {
    apply(SEASON_SESSION_TYPES.power, 'compressed_microdose', 'Сжатый микроцикл/MD-2: только короткая мощностная микродоза.');
  }

  return { ...resolved, calendar, previousMatchStatus: played };
}

export function resolveManualMatchDaySession({ targetDate, consecutiveGameDay = 1 } = {}) {
  const day = Math.min(3, Math.max(1, Number(consecutiveGameDay) || 1));
  const events = Array.from({ length: day }, (_, index) => ({
    date: shiftIsoDate(targetDate, index - day + 1),
    type: 'game',
  }));
  const decision = resolveSeasonSession({
    events,
    targetDate,
    requestedFocus: MANUAL_MATCH_DAY_FOCUS,
    requestedTrainingType: 'activation_power',
  });
  return {
    ...decision,
    manualSelection: true,
    reason: `Ручной выбор тренера: игровой день, матч ${day}/3 подряд. Индивидуальный full-body силовой праймер без накопления усталости.`,
  };
}

// Builds the team S&C exposures for a seven-day window. Match and travel days
// are excluded; protective slots are derived from the calendar, while quiet
// weeks retain two strength exposures and one power exposure.
export function buildSeasonMicrocycle({ events = [], startDate, days = 7 } = {}) {
  if (!startDate || !Number.isFinite(Number(days)) || Number(days) < 1) return [];
  const windowDays = Array.from({ length: Math.min(14, Math.floor(Number(days))) }, (_, index) => shiftIsoDate(startDate, index));
  const normalized = normalizeEvents(events);
  const hasRelevantGame = normalized.some(event =>
    event.type === 'game'
    && dayDistance(shiftIsoDate(startDate, -1), event.date) >= 0
    && dayDistance(event.date, shiftIsoDate(startDate, windowDays.length)) >= 0
  );

  if (!hasRelevantGame) {
    return [
      { date: windowDays[0], ...SEASON_SESSION_TYPES.strength, key: 'quiet_week_strength_1' },
      windowDays[2] ? { date: windowDays[2], ...SEASON_SESSION_TYPES.power, key: 'quiet_week_power' } : null,
      windowDays[4] ? { date: windowDays[4], ...SEASON_SESSION_TYPES.strength, key: 'quiet_week_strength_2' } : null,
    ].filter(Boolean);
  }

  const candidates = windowDays
    .filter(date => !normalized.some(event => event.date === date && ['game', 'travel'].includes(event.type)))
    .map(date => ({
      date,
      ...resolveSeasonSession({ events: normalized, targetDate: date, previousMatchLoad: { status: 'unknown' } }),
    }));

  const forcedKeys = new Set(['md_plus_1', 'md_minus_1', 'compressed_microdose']);
  const selected = candidates.filter(item => forcedKeys.has(item.key));
  const ordinary = candidates.filter(item => item.key === 'coach_selected');
  const strengthCandidate = ordinary.find(item => {
    const calendar = item.calendar || {};
    return (calendar.daysSinceGame == null || calendar.daysSinceGame >= 2)
      && (calendar.daysToGame == null || calendar.daysToGame >= 3)
      && selected.every(existing => Math.abs(dayDistance(existing.date, item.date)) >= 2 || existing.key === 'md_minus_1');
  });
  if (strengthCandidate) selected.push(strengthCandidate);

  return selected
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)
    .map(item => ({
      date: item.date,
      focus: item.focus,
      trainingType: item.trainingType,
      label: item.label,
      key: item.key,
      reason: item.reason,
    }));
}

export function formatSeasonDecisionForPrompt(decision) {
  if (!decision) return '';
  const c = decision.calendar || {};
  const lines = [
    decision.manualSelection
      ? 'РУЧНОЕ РЕШЕНИЕ ТРЕНЕРА ДЛЯ КОНКРЕТНОГО ИГРОКА И ДАТЫ:'
      : 'ДЕТЕРМИНИРОВАННОЕ РЕШЕНИЕ СЕЗОННОГО МИКРОЦИКЛА:',
    `• Тип: ${decision.label}; focus=${decision.focus}; trainingType=${decision.trainingType}.`,
    `• Причина: ${decision.reason}`,
  ];
  if (!decision.manualSelection) {
    lines.push(`• Предыдущий матч: ${c.previousGame || '—'}${c.daysSinceGame != null ? ` (MD+${c.daysSinceGame})` : ''}; следующий: ${c.nextGame || '—'}${c.daysToGame != null ? ` (MD-${c.daysToGame})` : ''}.`);
  }
  lines.push(`• Игровая нагрузка после предыдущего матча: ${decision.previousMatchStatus}.`);
  lines.push(decision.manualSelection
    ? '→ Выбор игрового дня сделан тренером вручную, без общего календаря. Модель не может заменить его другим методом.'
    : '→ Это решение определяет тип и потолок дозы. Модель не может заменить его другим методом.');
  return `\n━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━\n`;
}
