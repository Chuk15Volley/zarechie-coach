import { seasonCalendarContext } from './seasonPolicy.mjs';

const number = value => value == null || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const labels = { full: 'Без ограничений ReadySix', modified: 'Нагрузка модифицирована', limited: 'Нагрузка ограничена', individual_plan: 'Индивидуальный план после проверки', load_stop: 'Стоп до решения штаба', insufficient_data: 'Недостаточно данных ReadySix' };

// Present the upstream assessment. Never infer a new health state from WHOOP,
// questionnaire scores or missing tests in the gym client.
export function readySixGymState(decision) {
  if (!decision) return { source: 'ReadySix', level: 'yellow', code: 'readysix_missing', label: 'Нет решения ReadySix', detail: 'Обновите состояние в ReadySix перед назначением нагрузки.', capPercent: null, hardStop: false, needsReview: true };
  const capPercent = number(decision.capPercent);
  const hardStop = decision.hardStopSignal === true || capPercent === 0 || decision.recommendation === 'load_stop';
  const recommendation = decision.recommendation || 'insufficient_data';
  const level = hardStop || ['limited', 'individual_plan'].includes(recommendation) ? 'red'
    : recommendation === 'full' ? 'green' : 'yellow';
  return { source: 'ReadySix', code: `readysix_${recommendation}`, level,
    label: decision.recommendationLabel || labels[recommendation] || 'Решение ReadySix',
    detail: [...(decision.reasons || []), ...(decision.restrictions || [])].join(' '),
    capPercent, hardStop, needsReview: hardStop || capPercent == null || capPercent <= 20 || recommendation === 'insufficient_data',
    confidence: decision.confidence || 'insufficient',
    targets: decision.targets || [], observations: decision.observations || [],
  };
}

export function readySixCalendarContext(calendar, targetDate) {
  const valid = calendar?.date === targetDate;
  const events = (valid ? calendar.events || [] : []).filter(event => event.confirmed !== false).map(event => ({
    ...event, type: event.type === 'match' ? 'game' : event.type === 'flight' ? 'travel' : event.type,
  }));
  return { ...seasonCalendarContext(events, targetDate), available: !!calendar && calendar.date === targetDate,
    today: calendar?.date === targetDate ? calendar.today : null,
    conflicts: valid ? (calendar.conflicts || []).filter(event => Math.abs((Date.parse(event.date) - Date.parse(targetDate)) / 86400000) <= 3) : [], events };
}

export function recommendGymSession({ snapshot, targetDate, recentSessions = [] } = {}) {
  const state = readySixGymState(snapshot?.readySixDecision);
  const calendar = readySixCalendarContext(snapshot?.readySixCalendar, targetDate);
  const reasons = [];
  const warnings = [];
  const plan = calendar.today?.confirmed ? calendar.today.planType : calendar.todayEvent?.type;
  const previous = recentSessions.filter(record => record.date < targetDate).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const previousDays = previous ? Math.round((Date.parse(`${targetDate}T12:00:00Z`) - Date.parse(`${previous.date}T12:00:00Z`)) / 86400000) : null;
  const base = { source: 'ReadySix', targetDate, state, calendar,
    revision: snapshot?.readySixMeta?.revision || null,
    confidence: state.confidence || 'insufficient', reasons, warnings, automatic: false };
  const choose = (key, label, focus = null, extra = {}) => ({ ...base, key, label, focus,
    trainingType: /power|activation|primer/.test(focus || '') ? 'activation_power' : /prophylaxis/.test(focus || '') ? 'recovery_prehab' : 'full_body',
    canApply: !!focus, ...extra });
  if (state.hardStop || state.needsReview) {
    reasons.push(state.detail || state.label);
    return choose('review', 'Сначала решение штаба в ReadySix');
  }
  if (calendar.conflicts.length) {
    reasons.push('Календарь и подтверждённый план ReadySix расходятся. Уточните план дня.');
    return choose('calendar_conflict', 'Уточнить расписание в ReadySix');
  }
  if (['rest', 'travel', 'volleyball_only'].includes(plan)) {
    reasons.push(plan === 'rest' ? 'В ReadySix подтверждён выходной.' : plan === 'travel' ? 'В ReadySix указан переезд.' : 'В ReadySix запланирован только волейбол.');
    return choose('no_gym', 'Зал не запланирован');
  }
  if (!calendar.available) warnings.push('Календарь ReadySix не передан. Рекомендация ограничена; уточните ближайший матч.');
  else if (!calendar.nextGame && calendar.todayEvent?.type !== 'game') warnings.push('Ближайший матч в ReadySix не указан. Это не подтверждает свободное окно для развития.');
  if (calendar.todayEvent?.type === 'game') {
    reasons.push('Сегодня матч. Только знакомый короткий праймер с ручной проверкой тренером.');
    return choose('match_day', 'Игровой силовой праймер', 'inseason_match_day_primer');
  }
  if (state.level === 'red' || plan === 'recovery' || calendar.daysSinceGame === 1) {
    reasons.push(state.level === 'red' ? state.detail || state.label : plan === 'recovery' ? 'В ReadySix восстановительный день.' : 'Первый день после матча; учесть фактическое участие игрока.');
    return choose('recovery', 'Восстановление / профилактика', 'inseason_prophylaxis');
  }
  if (calendar.daysToGame === 1 || plan === 'pregame') {
    reasons.push('Матч завтра или подтверждён предыгровой день. Сохранить свежесть.');
    return choose('activation', 'Короткая активация', 'inseason_md1_activation');
  }
  if (calendar.daysToGame === 2 || calendar.congested) {
    reasons.push('Короткое окно между играми: ограниченный объём мощностной работы.');
    return choose('microdose', 'Мощность / микродоза', 'inseason_power', { powerMode: 'microdose' });
  }
  if (state.level !== 'green' || !calendar.available || !calendar.nextGame || previousDays != null && previousDays < 2) {
    reasons.push(previousDays != null && previousDays < 2 ? 'Предыдущая программа зала была менее 48 часов назад; факт выполнения нужно учитывать отдельно.' : state.level !== 'green' ? state.detail || state.label : 'До уточнения календаря — поддерживающий вариант.');
    return choose('maintenance', 'Поддерживающая силовая', 'inseason_strength', { strengthMode: 'maintenance' });
  }
  const strengthFocus = calendar.today?.morning?.strengthFocus || [];
  if (strengthFocus.includes('ballistic') || previous?.focus === 'inseason_strength') {
    reasons.push(strengthFocus.includes('ballistic') ? 'В ReadySix задана баллистическая направленность.' : 'Предыдущая программа была силовой; предлагается следующая мощностная экспозиция.');
    const development = calendar.daysToGame >= 4;
    return choose('power', development ? 'Развивающая мощность' : 'Мощность / микродоза', 'inseason_power', { powerMode: development ? 'development' : 'microdose' });
  }
  reasons.push(`До матча ${calendar.daysToGame} дн.; ReadySix не назначил ограничений. Есть окно для силовой работы.`);
  return choose('strength', 'Развивающая силовая', 'inseason_strength', { strengthMode: 'development' });
}

// A protected day requires an explicit method choice instead of contradictory
// development instructions with a recovery-sized dose.
export function readySixGenerationIssue(recommendation, focus) {
  if (!recommendation) return null;
  if (recommendation.state.needsReview) return { status: recommendation.state.capPercent == null ? 503 : 409,
    error: `${recommendation.state.label}. ${recommendation.state.detail || 'Обновите решение штаба в ReadySix.'}` };
  if (['calendar_conflict', 'no_gym'].includes(recommendation.key)) return { status: 409, error: recommendation.reasons.join(' ') };
  if (['recovery', 'activation', 'match_day'].includes(recommendation.key) && focus !== recommendation.focus) {
    return { status: 409, error: `Для этого дня предложено: ${recommendation.label}. Примените вариант ReadySix перед генерацией или уточните план дня в ReadySix.` };
  }
  return null;
}

export function formatReadySixGymContext(recommendation) {
  const { state, calendar } = recommendation;
  return `\nREADYSIX — ИСТОЧНИК АНАЛИТИКИ И КАЛЕНДАРЯ:\n` +
    `Состояние: ${state.label}. ${state.detail}\n` +
    `Предыдущий матч: ${calendar.previousGame || 'не указан'}; следующий: ${calendar.nextGame || 'не указан'}; дней до игры: ${calendar.daysToGame ?? 'неизвестно'}.\n` +
    `Предложение зала: ${recommendation.label}. ${recommendation.reasons.join(' ')}\n${recommendation.warnings.join(' ')}\n` +
    'Состояние игрока не пересчитывай по собственным порогам WHOOP/HRV/анкет. Соблюдай решение ReadySix и более строгие указания тренера. Выбранный тренером метод сохраняется; календарь ограничивает объём, а не назначает нагрузку автоматически.\n';
}

// Volume percentages conservatively cap the chosen gym method's remaining
// set budget, never as a percent of 1RM. Regional minimum is conservative until
// exercises have reviewed anatomical tags; raw regional limits remain visible.
export function applyReadySixGymDose(prescription, recommendation) {
  const next = structuredClone(prescription);
  const state = recommendation.state;
  const caps = [state.capPercent, ...(state.targets || []).filter(target => ['strength_upper', 'strength_lower'].includes(target.target))
    .map(target => number(target.healthCapPercent ?? (target.planApplicability === 'not_planned' ? null : target.capPercent)))].filter(value => value != null);
  const factor = Math.max(0, Math.min(100, ...caps)) / 100;
  for (const key of ['totalSets', 'hardSets', 'jumpContacts']) {
    if (!next[key]) continue;
    next[key].max = Math.floor(next[key].max * factor);
    next[key].min = Math.min(next[key].min, next[key].max);
  }
  const calendar = recommendation.calendar;
  const plan = calendar.today?.confirmed ? calendar.today.planType : calendar.todayEvent?.type;
  const recoveryDay = ['rest', 'travel', 'recovery', 'volleyball_only'].includes(plan) || calendar.daysSinceGame === 1;
  const pregame = calendar.daysToGame === 1 || plan === 'pregame';
  const matchDay = calendar.todayEvent?.type === 'game';
  if (recoveryDay || pregame) {
    const minutes = recoveryDay ? 30 : 20;
    next.minutes = { min: Math.min(next.minutes.min, minutes), max: Math.min(next.minutes.max, minutes) };
    next.totalSets.max = Math.min(next.totalSets.max, recoveryDay ? 12 : 10);
    next.totalSets.min = Math.min(next.totalSets.min, next.totalSets.max);
    // A/B/C also count light trunk and prehab work. Cap these sets without
    // making every light exercise an impossible zero-set prescription.
    next.hardSets = { min: 0, max: Math.min(next.hardSets.max, recoveryDay ? 4 : 6) };
    next.jumpContacts = { min: 0, max: recoveryDay ? 0 : Math.min(next.jumpContacts.max, 6) };
    if (next.workingSetRpe) next.workingSetRpe = { min: Math.min(next.workingSetRpe.min, 6), max: Math.min(next.workingSetRpe.max, 6) };
    next.targetRpe = { min: Math.min(next.targetRpe.min, 5), max: Math.min(next.targetRpe.max, 5) };
  }
  if (recoveryDay) next.loadedHardSetsMax = 0;
  next.readySix = { revision: recommendation.revision, capPercent: factor * 100, calendarLimited: recoveryDay || pregame || matchDay };
  return next;
}
