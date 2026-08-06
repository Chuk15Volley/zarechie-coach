const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function shiftIsoDate(date, days) {
  const base = DATE_RE.test(String(date || '')) ? String(date) : new Date().toISOString().slice(0, 10);
  const value = new Date(`${base}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function clean(value, max) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

const METRIC_KEYS = new Set(['manual', 'rsi', 'cmj', 'sprint10m']);
const REVIEW_DECISIONS = new Set(['pending', 'continue', 'adjust', 'complete']);

function finite(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDevelopmentPlan(input = {}, fallbackDate = new Date().toISOString().slice(0, 10)) {
  const cycleStart = DATE_RE.test(String(input.cycleStart || '')) ? String(input.cycleStart) : fallbackDate;
  const goals = (Array.isArray(input.goals) ? input.goals : [])
    .map((goal, index) => ({
      id: clean(goal?.id, 48) || `goal-${index + 1}`,
      title: clean(goal?.title, 120),
      criterion: clean(goal?.criterion, 200),
      metric: METRIC_KEYS.has(goal?.metric) ? goal.metric : 'manual',
      baselineValue: finite(goal?.baselineValue),
      targetValue: finite(goal?.targetValue),
      baselineDate: DATE_RE.test(String(goal?.baselineDate || '')) ? String(goal.baselineDate) : null,
      unit: clean(goal?.unit, 20),
    }))
    .filter(goal => goal.title)
    .slice(0, 3);

  return {
    cycleStart,
    reviewDate: shiftIsoDate(cycleStart, 28),
    goals,
    reviewDecision: REVIEW_DECISIONS.has(input.reviewDecision) ? input.reviewDecision : 'pending',
    reviewNote: clean(input.reviewNote, 300),
  };
}

export function evaluateDevelopmentPlan(input, {
  metrics = {}, plannedSessions = 0, actualSessions = 0, targetDate = new Date().toISOString().slice(0, 10),
} = {}) {
  const plan = normalizeDevelopmentPlan(input || {}, targetDate);
  const due = targetDate >= plan.reviewDate;
  const adherencePercent = plannedSessions > 0 ? Math.round(actualSessions / plannedSessions * 100) : null;
  const goals = plan.goals.map(goal => {
    if (goal.metric === 'manual') return { ...goal, reviewStatus: due ? 'manual_review' : 'in_progress', currentValue: null, meaningful: null, achieved: null };
    const metric = metrics[goal.metric] || {};
    const currentValue = finite(metric.value);
    const baselineValue = finite(goal.baselineValue);
    const lowerIsBetter = goal.metric === 'sprint10m';
    const rawDelta = currentValue != null && baselineValue
      ? ((currentValue - baselineValue) / baselineValue) * 100
      : null;
    const performanceDeltaPercent = rawDelta == null ? null : Math.round((lowerIsBetter ? -rawDelta : rawDelta) * 10) / 10;
    const threshold = finite(metric.decisionThresholdPercent) ?? 5;
    const meaningful = performanceDeltaPercent == null ? null : Math.abs(performanceDeltaPercent) >= threshold;
    const achieved = currentValue == null || goal.targetValue == null
      ? null
      : lowerIsBetter ? currentValue <= goal.targetValue : currentValue >= goal.targetValue;
    const reviewStatus = achieved === true ? 'achieved'
      : !due ? 'in_progress'
      : performanceDeltaPercent == null ? 'insufficient_data'
      : meaningful && performanceDeltaPercent > 0 ? 'improved_not_target'
      : meaningful && performanceDeltaPercent < 0 ? 'regressed'
      : 'within_noise';
    return {
      ...goal,
      currentValue,
      currentDate: metric.date || null,
      performanceDeltaPercent,
      decisionThresholdPercent: threshold,
      meaningful,
      achieved,
      reviewStatus,
    };
  });
  const measurable = goals.filter(goal => goal.metric !== 'manual');
  return {
    ...plan,
    goals,
    review: {
      due,
      targetDate,
      plannedSessions,
      actualSessions,
      adherencePercent,
      achievedGoals: measurable.filter(goal => goal.achieved).length,
      measurableGoals: measurable.length,
      coachDecisionRequired: due && plan.reviewDecision === 'pending',
    },
  };
}

export function formatDevelopmentPlanForPrompt(input, targetDate) {
  const plan = normalizeDevelopmentPlan(input || {}, targetDate);
  if (!plan.goals.length) return '';
  const due = DATE_RE.test(String(targetDate || '')) && targetDate >= plan.reviewDate;
  const lines = [
    'ИНДИВИДУАЛЬНЫЙ ПЛАН РАЗВИТИЯ · 4 НЕДЕЛИ:',
    `• Цикл: ${plan.cycleStart} → ${plan.reviewDate}${due ? ' · ⚠ наступил срок пересмотра' : ''}`,
    ...plan.goals.map((goal, index) => {
      const measure = goal.metric !== 'manual'
        ? ` | ${goal.metric.toUpperCase()}: baseline ${goal.baselineValue ?? '—'}${goal.unit || ''}, цель ${goal.targetValue ?? '—'}${goal.unit || ''}${goal.currentValue != null ? `, сейчас ${goal.currentValue}${goal.unit || ''}` : ''}`
        : '';
      return `• Цель ${index + 1}: ${goal.title}${goal.criterion ? ` | критерий: ${goal.criterion}` : ''}${measure}`;
    }),
    '→ Цели направляют выбор 1–2 аксессуаров/якорей и их измеримую прогрессию в цикле; не пытайся закрыть все цели в одной сессии.',
    due ? `• Решение тренера: ${plan.reviewDecision}${plan.reviewNote ? ` — ${plan.reviewNote}` : ''}` : null,
    due && plan.reviewDecision === 'pending' ? '→ Цикл завершён: сохрани освоенные якоря, но не добавляй новый целевой объём до пересмотра тренером.' : null,
    '→ Боль, ограничения, свежая готовность, ручной метод тренера и фаза подготовки всегда сильнее целей плана.',
  ].filter(Boolean);
  return `\n━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━\n`;
}
