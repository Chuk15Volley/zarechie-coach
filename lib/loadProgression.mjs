function round(value, step) {
  return Math.max(step, Math.round(value / step) * step);
}

function stepFor(name = '') {
  return /dumbbell|гантел|\bdb\b/i.test(name) ? 2 : 2.5;
}

export function recommendLoad(exposures = [], { name = '', currentKg = 0, pain = false } = {}) {
  const history = (Array.isArray(exposures) ? exposures : [])
    .filter(item => Number(item.kg) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-5);
  const base = Number(history.at(-1)?.kg) || Number(currentKg) || 0;
  if (!base) return { suggestedKg: null, confidence: 'low', trend: 'unknown', reasons: ['Нет фактических рабочих весов'] };
  const recent = history.slice(-3);
  const avgRpe = recent.filter(item => Number(item.rpe) > 0).reduce((sum, item, _, arr) => sum + Number(item.rpe) / arr.length, 0) || null;
  const completion = recent.length
    ? recent.reduce((sum, item) => sum + (Number(item.plannedSets) > 0 ? Number(item.completedSets) / Number(item.plannedSets) : 1), 0) / recent.length
    : 0;
  const painSeen = pain || recent.some(item => item.pain);
  const step = stepFor(name);
  let suggestedKg = base;
  let trend = 'maintain';
  const reasons = [];
  if (painSeen) {
    suggestedKg = round(base * 0.9, step);
    trend = 'reduce';
    reasons.push('Зафиксирована боль или дискомфорт');
  } else if (completion < 0.8 || (avgRpe != null && avgRpe >= 9)) {
    suggestedKg = round(base * 0.95, step);
    trend = 'reduce';
    reasons.push(completion < 0.8 ? 'Выполнено менее 80% подходов' : `Средний RPE ${avgRpe.toFixed(1)}`);
  } else if (history.length >= 2 && completion >= 0.95 && avgRpe != null && avgRpe <= 6.5) {
    suggestedKg = round(Math.max(base + step, base * 1.04), step);
    trend = 'increase';
    reasons.push(`Последние ${recent.length} экспозиции выполнены уверенно`, `Средний RPE ${avgRpe.toFixed(1)}`);
  } else {
    reasons.push(avgRpe != null ? `Средний RPE ${avgRpe.toFixed(1)} — целевая зона` : 'Недостаточно RPE для прогрессии');
    if (completion) reasons.push(`Выполнение ${Math.round(completion * 100)}%`);
  }
  const confidence = history.length >= 4 ? 'high' : history.length >= 2 ? 'medium' : 'low';
  return { suggestedKg, confidence, trend, reasons, avgRpe, completionPercent: Math.round(completion * 100), exposures: history };
}
