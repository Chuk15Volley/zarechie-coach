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

export function normalizeDevelopmentPlan(input = {}, fallbackDate = new Date().toISOString().slice(0, 10)) {
  const cycleStart = DATE_RE.test(String(input.cycleStart || '')) ? String(input.cycleStart) : fallbackDate;
  const goals = (Array.isArray(input.goals) ? input.goals : [])
    .map((goal, index) => ({
      id: clean(goal?.id, 48) || `goal-${index + 1}`,
      title: clean(goal?.title, 120),
      criterion: clean(goal?.criterion, 200),
    }))
    .filter(goal => goal.title)
    .slice(0, 3);

  return {
    cycleStart,
    reviewDate: shiftIsoDate(cycleStart, 28),
    goals,
  };
}

export function formatDevelopmentPlanForPrompt(input, targetDate) {
  const plan = normalizeDevelopmentPlan(input || {}, targetDate);
  if (!plan.goals.length) return '';
  const due = DATE_RE.test(String(targetDate || '')) && targetDate >= plan.reviewDate;
  const lines = [
    'ИНДИВИДУАЛЬНЫЙ ПЛАН РАЗВИТИЯ · 4 НЕДЕЛИ:',
    `• Цикл: ${plan.cycleStart} → ${plan.reviewDate}${due ? ' · ⚠ наступил срок пересмотра' : ''}`,
    ...plan.goals.map((goal, index) => `• Цель ${index + 1}: ${goal.title}${goal.criterion ? ` | критерий: ${goal.criterion}` : ''}`),
    '→ Цели направляют выбор 1–2 аксессуаров/якорей и их измеримую прогрессию в цикле; не пытайся закрыть все цели в одной сессии.',
    due ? '→ Цикл завершён: сохрани освоенные якоря, но не добавляй новый целевой объём до пересмотра тренером.' : null,
    '→ Боль, ограничения, свежая готовность, ручной метод тренера и фаза подготовки всегда сильнее целей плана.',
  ].filter(Boolean);
  return `\n━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━\n`;
}
