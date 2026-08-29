import { sessionPlanFact } from './floorOperations.mjs';
import { evaluateReturnToPlay } from './todayDecisionCenter.mjs';
import { normalizeAdaptationRecommendation } from './sessionAdaptation.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value) {
  return Math.round(finite(value));
}

function median(values) {
  const sorted = safeArray(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function hasPain(actual = {}) {
  const value = actual || {};
  return safeArray(value.exercises).some(exercise => Boolean(exercise?.pain)) ||
    Object.values(value.blockFeedback || {}).some(item => Boolean(item?.pain));
}

function sessionLabel(record = {}) {
  return String(record.trainingLabel || record.focus || record.trainingType || 'Тренировка').trim().slice(0, 100);
}

function exposure(entry) {
  const planFact = sessionPlanFact(entry?.record?.session, entry?.actual, entry?.log);
  const started = Boolean(entry?.log?.startedAt);
  const completed = Boolean(entry?.log?.completedAt || entry?.actual?.savedAt);
  return {
    date: entry.date,
    hasSession: Boolean(entry?.record?.session),
    label: sessionLabel(entry?.record),
    savedAt: entry?.record?.savedAt || null,
    adaptation: entry?.record?.session?.adaptation || null,
    started,
    completed,
    pain: hasPain(entry?.actual),
    ...planFact,
  };
}

function weeklyTotals(entries) {
  return entries.reduce((total, item) => {
    total.sessions += item.hasSession ? 1 : 0;
    total.plannedSets += finite(item.plannedSets);
    total.completedSets += finite(item.completedSets);
    total.plannedTonnage += finite(item.plannedTonnage);
    total.actualTonnage += finite(item.actualTonnage);
    total.referenceSets += finite(item.completedSets) > 0 ? finite(item.completedSets) : finite(item.plannedSets);
    total.referenceTonnage += finite(item.actualTonnage) > 0 ? finite(item.actualTonnage) : finite(item.plannedTonnage);
    return total;
  }, { sessions: 0, plannedSets: 0, completedSets: 0, plannedTonnage: 0, actualTonnage: 0, referenceSets: 0, referenceTonnage: 0 });
}

function budgetStatus(calibrating, utilization) {
  if (calibrating) return 'calibrating';
  if (utilization > 103) return 'over';
  if (utilization >= 90) return 'near';
  return 'within';
}

export function buildAthleteWeekLoad({ player = {}, weekStart, dates = [], entries = [], returnToPlay = {}, recommendation = null } = {}) {
  const all = safeArray(entries).filter(item => item?.record?.session).map(exposure);
  const byDate = new Map(all.map(item => [item.date, item]));
  const current = dates.map(date => byDate.get(date) || {
    date, hasSession: false, label: '', savedAt: null, adaptation: null, started: false, completed: false, pain: false,
    plannedSets: 0, completedSets: 0, completionPercent: 0, plannedTonnage: 0, actualTonnage: 0,
    tonnagePercent: null, compliance: 0, sessionRpe: null, note: '',
  });
  const totals = weeklyTotals(current);
  const historicalWeeks = Array.from({ length: 4 }, (_, index) => {
    const end = shiftDate(weekStart, -(index * 7 + 1));
    const start = shiftDate(end, -6);
    return weeklyTotals(all.filter(item => item.date >= start && item.date <= end));
  }).filter(week => week.sessions > 0);
  const calibratedWeeks = historicalWeeks.filter(week => week.referenceSets > 0 || week.referenceTonnage > 0);
  const calibrating = calibratedWeeks.length < 2;
  const referenceSets = round(median(calibratedWeeks.map(week => week.referenceSets)));
  const referenceTonnage = round(median(calibratedWeeks.map(week => week.referenceTonnage)));
  const referenceSessions = Math.max(1, round(median(calibratedWeeks.map(week => week.sessions))));
  const sessionTonnageReference = round(median(all.filter(item => item.date < weekStart && item.plannedTonnage > 0).map(item => item.actualTonnage || item.plannedTonnage)));

  const rtp = evaluateReturnToPlay(returnToPlay || {}, dates[0] || weekStart);
  const normalizedRecommendation = recommendation ? normalizeAdaptationRecommendation(recommendation) : null;
  const recommendationFactor = normalizedRecommendation ? normalizedRecommendation.volumePercent / 100 : 1;
  const rtpFactor = rtp.active ? (rtp.status === 'paused' ? 0 : rtp.phase.volumeCap / 100) : 1;
  const factor = Math.max(0, Math.min(1.03, recommendationFactor, rtpFactor));
  const baseSets = referenceSets || totals.plannedSets;
  const baseTonnage = referenceTonnage || totals.plannedTonnage;
  const budgetSets = round(baseSets * factor);
  const budgetTonnage = round(baseTonnage * factor);
  const setUtilization = budgetSets > 0 ? totals.plannedSets / budgetSets * 100 : 0;
  const tonnageUtilization = budgetTonnage > 0 ? totals.plannedTonnage / budgetTonnage * 100 : 0;
  const utilizationPercent = round(Math.max(setUtilization, tonnageUtilization));
  const conflicts = [];

  if (!calibrating && utilizationPercent > 103) {
    conflicts.push({
      code: 'budget_exceeded', severity: 'high', date: null,
      title: 'Недельный бюджет превышен',
      detail: `План использует ${utilizationPercent}% персонального бюджета`,
    });
  }
  current.filter(item => item.pain).forEach(item => conflicts.push({
    code: 'pain_reported', severity: 'critical', date: item.date,
    title: 'Зафиксирована боль', detail: `${item.label}: требуется решение тренера`,
  }));

  for (let index = 1; index < current.length; index += 1) {
    const previous = current[index - 1];
    const item = current[index];
    const threshold = sessionTonnageReference > 0 ? sessionTonnageReference * 0.85 : Infinity;
    if (previous.plannedTonnage >= threshold && item.plannedTonnage >= threshold) {
      conflicts.push({
        code: 'dense_loading', severity: 'medium', date: item.date,
        title: 'Плотная нагрузка < 48 часов',
        detail: `${previous.label} и ${item.label} — две высокие экспозиции подряд`,
      });
    }
  }

  const matchIndexes = current.reduce((indexes, item, index) => {
    if (/матч|игр|game|match/i.test(item.label)) indexes.push(index);
    return indexes;
  }, []);
  matchIndexes.forEach(index => {
    [index - 1, index + 1].filter(value => value >= 0 && value < current.length).forEach(neighbour => {
      const item = current[neighbour];
      if (item.plannedTonnage > 0 && sessionTonnageReference > 0 && item.plannedTonnage >= sessionTonnageReference * 0.85) {
        conflicts.push({
          code: 'match_adjacent_load', severity: 'high', date: item.date,
          title: 'Высокая нагрузка рядом с матчем', detail: `${item.label}: проверьте игровую готовность`,
        });
      }
    });
  });

  const budget = {
    sets: budgetSets,
    tonnage: budgetTonnage,
    utilizationPercent,
    status: budgetStatus(calibrating, utilizationPercent),
    factorPercent: round(factor * 100),
    source: calibrating ? 'Калибровка по текущему плану' : `Медиана ${calibratedWeeks.length} предыдущих недель`,
    referenceSets,
    referenceTonnage,
    referenceSessions,
    recommendation: normalizedRecommendation,
    rtp: rtp.active ? { status: rtp.status, phase: rtp.currentPhase, label: rtp.phase.label, volumeCap: rtp.phase.volumeCap } : null,
  };

  return {
    player: { id: String(player.id), name: player.name || '', position: player.position || '' },
    days: current,
    totals: { ...totals, plannedSets: round(totals.plannedSets), completedSets: round(totals.completedSets), plannedTonnage: round(totals.plannedTonnage), actualTonnage: round(totals.actualTonnage) },
    budget,
    conflicts,
  };
}

export function summarizeTeamWeek(athletes = []) {
  const values = safeArray(athletes);
  const totalBudget = values.reduce((sum, athlete) => sum + finite(athlete?.budget?.tonnage), 0);
  const plannedTonnage = values.reduce((sum, athlete) => sum + finite(athlete?.totals?.plannedTonnage), 0);
  return {
    athletes: values.length,
    sessions: values.reduce((sum, athlete) => sum + finite(athlete?.totals?.sessions), 0),
    completed: values.reduce((sum, athlete) => sum + safeArray(athlete?.days).filter(day => day.completed).length, 0),
    plannedSets: round(values.reduce((sum, athlete) => sum + finite(athlete?.totals?.plannedSets), 0)),
    plannedTonnage: round(plannedTonnage),
    actualTonnage: round(values.reduce((sum, athlete) => sum + finite(athlete?.totals?.actualTonnage), 0)),
    budgetTonnage: round(totalBudget),
    utilizationPercent: totalBudget > 0 ? round(plannedTonnage / totalBudget * 100) : 0,
    conflicts: values.reduce((sum, athlete) => sum + safeArray(athlete?.conflicts).length, 0),
    overBudget: values.filter(athlete => athlete?.budget?.status === 'over').length,
    calibrating: values.filter(athlete => athlete?.budget?.status === 'calibrating').length,
  };
}
