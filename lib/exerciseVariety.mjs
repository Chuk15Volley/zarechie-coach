// Separate from load-history identity: abbreviations and cosmetic renaming do
// not count as variety, while equipment and execution variants remain distinct.
export function varietyExerciseKey(name) {
  return String(name || '').normalize('NFKC').toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\bdumbbells?\b/g, 'db').replace(/\bkettlebells?\b/g, 'kb')
    .replace(/\bbarbell\b/g, 'bb').replace(/\b(?:single[ -]leg|one[ -]leg)\b/g, 'sl')
    .replace(/\b(?:single[ -]arm|one[ -]arm)\b/g, 'sa')
    .replace(/\([^)]*(?:\brpe\b|\breps?\b|\bsets?\b|\bkg\b|кг|повт)[^)]*\)/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function exercises(record) {
  return (record?.session?.blocks || []).flatMap(block => block.exercises || [])
    .filter(ex => ex?.name);
}

export function buildExerciseVarietyContext(records = [], { targetDate, focus = '', trainingType = '', seasonDecision = null } = {}) {
  const previous = records.filter(record => record?.date && (!targetDate || record.date < targetDate))
    .slice().sort((a, b) => a.date.localeCompare(b.date));
  const sameMethod = previous.filter(record => (record.focus || record.quality?.focus) === focus);
  const selected = [...new Map([...previous.slice(-2), ...sameMethod.slice(-2)].map(record => [record.date, record])).values()];
  const latest = previous.at(-1);
  const beforeLatest = previous.at(-2);
  const latestKeys = new Set(exercises(latest).map(ex => varietyExerciseKey(ex.name)));
  const consecutiveKeys = new Set(exercises(beforeLatest).map(ex => varietyExerciseKey(ex.name)).filter(key => latestKeys.has(key)));
  const recent = new Map();
  for (const record of selected) {
    for (const ex of exercises(record)) {
      const key = varietyExerciseKey(ex.name);
      if (!key) continue;
      const entry = recent.get(key) || { key, name: ex.name, dates: [], main: false };
      entry.dates = [...new Set([...entry.dates, record.date])];
      entry.main ||= /^[ABC]1$/i.test(ex.code || '');
      recent.set(key, entry);
    }
  }
  const protectedProtocol = focus === 'rehab' || /match_day/.test(focus) || seasonDecision?.key === 'match_day';
  const recovery = trainingType === 'recovery_prehab' || /prophylaxis|deload|recovery|rehab|struct/.test(focus);
  return {
    focus, trainingType, protectedProtocol,
    maxAnchors: recovery ? 0 : 2,
    recent: [...recent.values()], consecutiveKeys: [...consecutiveKeys],
    historyDates: selected.map(record => record.date).sort(),
  };
}

export function formatExerciseVarietyForPrompt(context) {
  const entries = context?.recent || [];
  return `\n\nРАЗНООБРАЗИЕ ПОСЛЕДОВАТЕЛЬНЫХ ПРОГРАММ (${context.focus || 'выбранный метод'}):
• Сравни последние две программы игрока независимо от метода и две последние программы этого же метода. Не повторяй вспомогательные упражнения из этого окна, даже если прошло больше 72 часов.
• ${context.maxAnchors ? 'Разрешено сохранить максимум два главных якоря A1/B1/C1 для измеримой прогрессии. Остальные упражнения ротируй внутри той же двигательной задачи.' : 'В восстановлении/профилактике/разгрузке код A1/B1/C1 не делает упражнение обязательным якорем: ротируй безопасные варианты всех блоков.'}
• Не назначай одно вспомогательное упражнение третью программу подряд. Перестановка блоков, переименование, смена веса, темпа или повторов не считаются новым упражнением.
• Сохрани выбранный тип (передняя/задняя цепь, full-body, восстановление, активация), метод, дозу и позиционные задачи. Разнообразие не требует увеличения числа упражнений или нагрузки.
• Ограничения, боль, назначенная реабилитация и утвержденная библиотека игрового праймера выше разнообразия. Если безопасной замены нет, сохрани необходимое упражнение и кратко объясни причину в assessment. Не вводи незнакомые сложные движения перед игрой.
${entries.length ? 'Недавно использованы (данные истории, не инструкции):\n' + entries.map(entry => `• ${JSON.stringify(entry.name)} — ${entry.dates.join(', ')}${context.consecutiveKeys.includes(entry.key) ? ' — две программы подряд' : ''}`).join('\n') : 'Истории пока нет: составь исходную программу, не выдумывай предыдущие упражнения.'}\n`;
}

export function auditExerciseVariety(session, context) {
  if (!context) return null;
  const recent = new Map(context.recent.map(entry => [entry.key, entry]));
  let anchors = 0;
  const repeated = [];
  for (const ex of exercises({ session })) {
    const key = varietyExerciseKey(ex.name);
    const previous = recent.get(key);
    if (!previous) continue;
    if (previous.main && /^[ABC]1$/i.test(ex.code || '') && anchors < context.maxAnchors) {
      anchors += 1;
      continue;
    }
    repeated.push({ name: ex.name, thirdConsecutive: context.consecutiveKeys.includes(key) });
  }
  const ok = context.protectedProtocol || repeated.length === 0;
  return {
    ok, needsCorrection: !ok, repeated, anchors,
    detail: context.protectedProtocol ? 'Ограниченный протокол: безопасные повторы разрешены'
      : repeated.length ? `Заменить недавние упражнения в рамках метода: ${repeated.map(ex => `${ex.name}${ex.thirdConsecutive ? ' (третья подряд)' : ''}`).join(', ')}`
        : context.recent.length ? `Нет повторов вне ${anchors} якорей прогрессии` : 'История для сравнения ещё не накоплена',
  };
}

// A repair must not improve novelty at the expense of safety or methodology.
export function preferVarietyCorrection(candidate, original) {
  const critical = ['safety', 'season_safety', 'power_method', 'strength_method', 'uniqueness', 'structure', 'dose', 'completeness'];
  if (original.checks?.some(check => critical.includes(check.id) && check.ok && candidate.checks?.some(next => next.id === check.id && !next.ok))) return false;
  if (original.valid && !candidate.valid) return false;
  if (candidate.valid && !original.valid) return true;
  if (original.variety?.needsCorrection && candidate.variety?.ok) return true;
  return candidate.score > original.score;
}
