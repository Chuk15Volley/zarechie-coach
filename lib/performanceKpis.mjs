const METRICS = {
  rsi: {
    label: 'RSI',
    unit: '',
    aliases: ['rsi', 'reactive_strength_index'],
    cadenceDays: 1,
    staleAfterDays: 2,
    higherIsBetter: true,
  },
  cmj: {
    label: 'CMJ',
    unit: ' см',
    aliases: ['cmj', 'countermovement_jump', 'countermovementJump'],
    cadenceDays: 7,
    staleAfterDays: 8,
    higherIsBetter: true,
  },
  sprint10m: {
    label: 'Спринт 10 м',
    unit: ' сек',
    aliases: ['sprint10m', 'sprint_10m', 'ten_meter_sprint', 'sprint'],
    cadenceDays: 7,
    staleAfterDays: 8,
    higherIsBetter: false,
  },
};

function number(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function recordDate(record) {
  if (!record || typeof record !== 'object') return null;
  return dateOnly(
    record.date || record.day || record.testDate || record.measuredAt ||
    record.testTime || record.timestamp || record.createdAt || record.updatedAt
  );
}

function metricValue(record, config, allowGeneric = false) {
  const direct = number(record);
  if (direct != null) return direct;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;

  for (const alias of config.aliases) {
    const value = number(record[alias]);
    if (value != null) return value;
  }
  if (allowGeneric) {
    for (const key of ['value', 'result', 'score', 'height', 'time']) {
      const value = number(record[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function daysBetween(date, targetDate) {
  if (!date || !targetDate) return null;
  const from = Date.parse(`${date}T12:00:00Z`);
  const to = Date.parse(`${targetDate}T12:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to - from) / 86400000));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function addCandidate(candidates, record, config, targetDate, priority, fallbackDate = null, allowGeneric = false) {
  const value = metricValue(record, config, allowGeneric);
  if (value == null) return;
  const date = recordDate(record) || dateOnly(fallbackDate);
  if (date && targetDate && date > targetDate) return;
  candidates.push({ value, date, priority });
}

function seriesForMetric(neuro, metricKey, config, targetDate) {
  const candidates = [];
  const latest = neuro?.latest && typeof neuro.latest === 'object' ? neuro.latest : {};
  const combinedHistory = Array.isArray(neuro?.history) ? neuro.history : [];
  const historyHasNamedMetrics = combinedHistory.some(entry =>
    entry && typeof entry === 'object' && Object.values(METRICS).some(metric => metric.aliases.some(alias => entry[alias] != null))
  );

  for (const entry of combinedHistory) {
    // NK's legacy fallback exposes hist.cmj as a generic {date,value} array.
    // Generic combined records are therefore CMJ-only; they must never leak
    // the same value into RSI, attack jump and sprint.
    addCandidate(candidates, entry, config, targetDate, 2, null, metricKey === 'cmj' && !historyHasNamedMetrics);
  }
  for (const entry of Array.isArray(latest.history) ? latest.history : []) {
    addCandidate(candidates, entry, config, targetDate, 2);
  }

  for (const alias of config.aliases) {
    const nested = latest?.hist?.[alias];
    if (Array.isArray(nested)) {
      for (const entry of nested) addCandidate(candidates, entry, config, targetDate, 3, null, true);
    }
  }

  const latestDate = recordDate(latest);
  for (const alias of config.aliases) {
    const raw = latest[alias];
    if (Array.isArray(raw)) {
      for (const entry of raw) addCandidate(candidates, entry, config, targetDate, 3, null, true);
    } else if (raw != null) {
      addCandidate(candidates, raw, config, targetDate, 1, latestDate, true);
    }
  }

  // Keep the highest-confidence source for a dated test. An undated scalar is
  // retained only as a last-resort legacy value and never presented as fresh.
  const dated = new Map();
  let undated = null;
  for (const candidate of candidates) {
    if (!candidate.date) {
      if (!undated || candidate.priority > undated.priority) undated = candidate;
      continue;
    }
    const current = dated.get(candidate.date);
    if (!current || candidate.priority >= current.priority) dated.set(candidate.date, candidate);
  }
  const result = [...dated.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!result.length && undated) result.push(undated);
  return result.map(({ value, date }) => ({ value, date }));
}

function baselineFromPrior(prior) {
  if (prior.length < 2) return null;
  const window = prior.slice(-5);
  let ewma = window[0].value;
  for (const item of window.slice(1)) ewma = 0.3 * item.value + 0.7 * ewma;
  return ewma;
}

export function performanceKpis(neuro, targetDate) {
  const result = {};
  for (const [key, config] of Object.entries(METRICS)) {
    const series = seriesForMetric(neuro, key, config, targetDate);
    const latest = series[series.length - 1] || null;
    const prior = latest?.date
      ? series.filter(item => item.date && item.date < latest.date)
      : series.slice(0, -1);
    const baselineRaw = baselineFromPrior(prior);
    const rawDeltaPercent = latest && baselineRaw
      ? ((latest.value - baselineRaw) / baselineRaw) * 100
      : null;
    const ageDays = latest?.date ? daysBetween(latest.date, targetDate) : null;

    result[key] = {
      key,
      label: config.label,
      unit: config.unit,
      cadenceDays: config.cadenceDays,
      value: latest ? round(latest.value, 2) : null,
      date: latest?.date || null,
      ageDays,
      stale: latest ? (ageDays == null || ageDays > config.staleAfterDays) : true,
      baseline: baselineRaw == null ? null : round(baselineRaw, 2),
      deltaPercent: rawDeltaPercent == null ? null : round(rawDeltaPercent, 1),
      performanceDeltaPercent: rawDeltaPercent == null
        ? null
        : round(config.higherIsBetter ? rawDeltaPercent : -rawDeltaPercent, 1),
      previous: prior.length ? prior[prior.length - 1] : null,
      history: series,
    };
  }
  result.hasAny = Object.values(result).some(metric => metric && typeof metric === 'object' && metric.value != null);
  return result;
}

export function formatPerformanceKpisForPrompt(neuro, targetDate) {
  const profile = performanceKpis(neuro, targetDate);
  const lines = ['Нейромышечные и скоростно-силовые KPI (последний доступный тест каждого показателя):'];

  for (const key of ['rsi', 'cmj', 'sprint10m']) {
    const metric = profile[key];
    if (metric.value == null) {
      lines.push(`• ${metric.label}: данных нет`);
      continue;
    }
    const date = metric.date || 'дата неизвестна';
    const freshness = metric.stale
      ? `, ⚠ устарел${metric.ageDays != null ? ` на ${metric.ageDays} дн.` : ': дата неизвестна'}`
      : `, актуальность ${metric.ageDays === 0 ? 'сегодня' : `${metric.ageDays} дн.`}`;
    const trend = metric.baseline != null
      ? `; индивидуальный baseline ${metric.baseline}${metric.unit}; изменение результативности ${metric.performanceDeltaPercent >= 0 ? '+' : ''}${metric.performanceDeltaPercent}%`
      : '; baseline пока недостаточен';
    lines.push(`• ${metric.label}: ${metric.value}${metric.unit} (${date}${freshness})${trend}`);
  }

  lines.push('→ Используй последнее доступное значение каждого теста, а не только общий последний протокол.');
  lines.push('→ Решение об урезании нагрузки принимай по индивидуальному изменению и совпадению минимум двух доменов (KPI + WHOOP/опрос/боль), а не по одному абсолютному числу или одному шумному тесту.');
  lines.push('→ Протокол RSI Заречья: 5 повторных вертикальных прыжков с работой рук; первый прыжок исключается, результат — среднее следующих 4. Задача: минимальный контакт с опорой и максимальная высота каждого прыжка.');
  lines.push('→ Протокол CMJ Заречья: OVR JUMP, после разминки непосредственно перед вечерней тренировкой, с работой рук, 3 валидные попытки, записывается лучший результат.');
  lines.push('→ Протокол 10 м Заречья: электронные ворота, высокая стойка, носок в 50 см от первых ворот, одна валидная попытка. Не смешивай с ручным хронометражем или другим стартовым протоколом.');
  lines.push('→ Устаревший тест остаётся контекстом, но не считается свежим сигналом готовности. RSI ожидается ежедневно; CMJ и 10 м — еженедельно.');
  return { profile, text: lines.join('\n') };
}
