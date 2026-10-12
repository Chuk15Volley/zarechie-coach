import { normalizeDevelopmentPlan } from './developmentPlan.mjs';

export const STRENGTH_INDIVIDUAL_VERSION = 'strength-individual-load-v2';
export const STRENGTH_PRIORITIES = {
  posterior: 'Задняя цепь', unilateral: 'Односторонняя сила ног', adductor: 'Приводящие',
  calf: 'Икроножные', shoulder: 'Плечо / лопатка', core: 'Кор',
};
const number = value => value == null || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const distance = (a, b) => (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000;
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

// Explicit coach goals only: no deficit is inferred from a position, pain or test.
export function strengthPriorities(input, date) {
  if (!input) return { priorities: [], status: 'position_base' };
  const plan = normalizeDevelopmentPlan(input, date);
  if (date < plan.cycleStart || plan.reviewDecision === 'complete') return { priorities: [], status: 'inactive' };
  if (date >= plan.reviewDate) return { priorities: [], status: 'review_due' };
  const priorities = [...new Set(plan.goals.map(goal => goal.strengthPriority).filter(key => Object.hasOwn(STRENGTH_PRIORITIES, key)))].slice(0, 2);
  return { priorities, status: priorities.length ? 'coach_confirmed' : 'position_base', cycleStart: plan.cycleStart, reviewDate: plan.reviewDate };
}

// Keep morning and evening separate; a legacy evening and post-evening report
// are already deduplicated by the ReadySix snapshot adapter. Do not add totals
// to their component blocks or treat an unknown load as zero.
export function strengthReadySixLoad(snapshot, date, calendar = {}) {
  const rows = [
    ...(snapshot.chronicSurveys || snapshot.surveys || []).map(row => ({ ...row, period: 'evening' })),
    ...(snapshot.chronicPostMorningSurveys || snapshot.postMorningSurveys || []).map(row => ({ ...row, period: 'morning' })),
  ].filter(row => row.date && row.date <= date);
  const unique = new Map();
  for (const row of rows) {
    const key = `${row.date}:${row.period}`;
    const old = unique.get(key);
    if (!old || String(row.submittedAt || '') >= String(old.submittedAt || '')) unique.set(key, row);
  }
  const sessions = [...unique.values()].map(row => {
    const blocks = Array.isArray(row.blocks) ? row.blocks : [];
    const court = blocks.filter(block => ['volleyball', 'match'].includes(block.type));
    const fallbackCourt = !blocks.length && ['volleyball', 'match'].includes(row.sessionType);
    const valid = block => number(block.duration) != null && number(block.duration) >= 0 && number(block.srpe) != null && number(block.srpe) >= 0 && number(block.srpe) <= 10;
    const duration = number(row.totalDuration ?? row.duration);
    const srpe = number(row.srpe);
    const courtLoad = court.length && court.every(valid) ? court.reduce((sum, block) => sum + Number(block.duration) * Number(block.srpe), 0)
      : fallbackCourt && duration != null && duration >= 0 && srpe != null && srpe >= 0 && srpe <= 10 ? duration * srpe : null;
    const isMatch = row.sessionType === 'match' || court.some(block => block.type === 'match');
    return { date: row.date, period: row.period, courtLoad, isMatch,
      setsPlayed: isMatch && number(row.setsPlayed) != null && number(row.setsPlayed) >= 0 && number(row.setsPlayed) <= 5 ? number(row.setsPlayed) : null,
      legFatigue: !row.legFatigueStatus || row.legFatigueStatus === 'rated' ? number(row.legFatigue) : null,
      shoulderLoad: !row.shoulderLoadStatus || row.shoulderLoadStatus === 'rated' ? number(row.shoulderLoad) : null,
    };
  });
  const recent = sessions.filter(row => distance(row.date, date) <= 1);
  const baseline = sessions.filter(row => distance(row.date, date) >= 2 && distance(row.date, date) <= 28 && row.courtLoad > 0 && !row.isMatch);
  const byDay = new Map();
  for (const row of baseline) byDay.set(row.date, (byDay.get(row.date) || 0) + row.courtLoad);
  const ownMean = byDay.size >= 4 ? mean([...byDay.values()]) : null;
  const recentCourtLoad = recent.some(row => row.courtLoad != null) ? recent.reduce((sum, row) => sum + (row.courtLoad || 0), 0) : null;
  const reasons = [];
  const matchRows = recent.filter(row => row.isMatch);
  const playedSets = matchRows.some(row => row.setsPlayed != null) ? matchRows.reduce((sum, row) => sum + (row.setsPlayed || 0), 0) : null;
  const knownBench = matchRows.length > 0 && matchRows.every(row => row.setsPlayed === 0 && row.courtLoad === 0);
  const congested = calendar.congested === true;
  const closeMatch = Number.isFinite(calendar.daysToGame) && calendar.daysToGame >= 0 && calendar.daysToGame <= 2;
  const travel = (calendar.events || []).filter(event => event.confirmed !== false && ['travel', 'flight'].includes(event.type) && Math.abs(distance(event.date, date)) <= 1);
  const recentDays = new Map();
  for (const row of recent) if (row.courtLoad != null) recentDays.set(row.date, (recentDays.get(row.date) || 0) + row.courtLoad);
  const highCourt = ownMean != null && [...recentDays.values()].some(load => load > ownMean * 1.5);
  const highLegs = recent.some(row => row.legFatigue >= 4 && row.legFatigue <= 5);
  const highShoulder = recent.some(row => row.shoulderLoad >= 4 && row.shoulderLoad <= 5);
  const matchExposure = !knownBench && matchRows.some(row => row.setsPlayed >= 3 || row.courtLoad > 0 && (row.setsPlayed == null || row.setsPlayed === 0));
  if (congested) reasons.push({ code: 'congested', text: 'Плотный календарь матчей: сократить объём ног, сохранить выбранный метод.' });
  if (closeMatch) reasons.push({ code: 'match_soon', text: `Матч через ${calendar.daysToGame} дн.: сократить утомляющую работу ног, без прибавки кг.` });
  if (matchExposure) reasons.push({ code: 'match_exposure', text: `Недавний матч${playedSets != null ? `: ${playedSets} сыгранных партий` : ': участие не уточнено'}; снизить объём ног.` });
  if (highCourt) reasons.push({ code: 'court_high', text: 'Нагрузка площадки сегодня или вчера выше 150% собственного среднего дня: снизить объём ног.' });
  if (highLegs) reasons.push({ code: 'legs_high', text: 'ReadySix: высокая усталость ног; снизить только связанные задачи.' });
  if (highShoulder) reasons.push({ code: 'shoulder_high', text: 'ReadySix: высокая нагрузка плеча; снизить жим, тягу и плечевые аксессуары.' });
  if (travel.length) reasons.push({ code: 'travel', text: 'Поездка рядом с тренировкой: меньше объёма ног и дополнительных задач, без прибавки кг.' });
  const missing = [];
  if (!calendar.available) missing.push('calendar');
  if (!Number.isFinite(calendar.daysToGame)) missing.push('next_match');
  if (!recent.length || recent.every(row => row.courtLoad == null)) missing.push('recent_court_load');
  if (ownMean == null) missing.push('personal_court_baseline');
  if (matchRows.some(row => row.setsPlayed == null || row.setsPlayed === 0 && row.courtLoad > 0)) missing.push('match_sets');
  if (calendar.daysSinceGame === 1 && !matchRows.length) missing.push('match_participation');
  if (calendar.conflicts?.length) missing.push('calendar_conflict');
  if (missing.length) reasons.push({ code: 'data_gap', text: 'Часть нагрузки ReadySix не передана: прибавку веса отложить, уточнить данные перед выполнением.' });
  return { version: STRENGTH_INDIVIDUAL_VERSION, source: 'ReadySix', revision: snapshot.readySixMeta?.revision || null,
    observationDate: snapshot.readySixPlanning?.assessmentDate || date, targetDate: date,
    recentCourtLoad, ownMeanCourtDay: ownMean, baselineDays: byDay.size, playedSets, knownBench,
    travelDates: travel.map(event => event.date), reasons, missing,
    reduceLower: congested || closeMatch || matchExposure || highCourt || highLegs || travel.length > 0,
    reduceUpper: highShoulder, reduceAccessories: travel.length > 0,
    allowIncrease: reasons.length === 0 && !snapshot.readySixPlanning?.preliminary,
  };
}

export function strengthExternalDose(exercise, context) {
  const load = context.externalLoad;
  if (!load || exercise.symptomAdapted) return null;
  const family = exercise.strengthFamily;
  const lower = ['lower', 'knee', 'hinge', 'posterior', 'lowerPrehab', 'adductor', 'balance', 'lateralPrehab'].includes(family);
  const upper = ['press', 'row', 'shoulder'].includes(family);
  if (lower && load.reduceLower || upper && load.reduceUpper || load.reduceAccessories && !['A1', 'B1', 'B2'].includes(exercise.code)) {
    return { sets: exercise.code === 'A1' || exercise.code === 'B2' ? 2 : 1, rpe: '6–7', reason: 'readysix_external_load' };
  }
  return null;
}
