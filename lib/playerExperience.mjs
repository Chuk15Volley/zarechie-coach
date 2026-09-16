export const SKIP_REASONS = ['Нет оборудования', 'Дискомфорт', 'Решение тренера'];

export function normalizeSkips(value) {
  return Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {})
    .filter(([key, reason]) => /^\d+-\d+$/.test(key) && (reason === null || SKIP_REASONS.includes(reason))));
}

export function skippedSetCount(session, done = {}, skipped = {}) {
  return (session?.blocks || []).reduce((sum, block, bi) => sum + (block.exercises || []).reduce((n, ex, ei) =>
    n + (skipped[`${bi}-${ei}`] ? (ex.targetSets || []).filter((_, si) => !done[`${bi}-${ei}-${si}`]).length : 0), 0), 0);
}

export function selectSessionDate(dates, today, requested) {
  const sorted = [...new Set(dates)].filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  if (requested) return sorted.includes(requested) ? requested : null;
  return sorted.includes(today) ? today : sorted.find(date => date > today) || sorted.at(-1) || null;
}

export function holdPrescription(target, exercise = null) {
  if (exercise && !/plank|\biso\b|isometr|hold|spanish|планк|удерж|изометр|испанск/i.test(`${exercise.name || ''} ${exercise.tempo || ''}`)) return null;
  const match = String(target || '').trim().match(/^(\d+)\s*(?:сек(?:унд[а-я]*)?|sec(?:onds?)?|s|с)(?:\s*(?:\/|на\s+|per\s+)(side|leg|arm|сторону|ногу|руку))?\.?$/i);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 600) return null;
  return { seconds: Number(match[1]), sides: match[2] ? 2 : 1 };
}

export function performanceKey(exercise) {
  return exercise?.exerciseId || String(exercise?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function previousPerformances(records, beforeDate) {
  const result = {};
  for (const record of [...records].filter(record => record.date < beforeDate).sort((a, b) => b.date.localeCompare(a.date))) {
    for (const [bi, block] of (record.session?.blocks || []).entries()) {
      for (const [ei, ex] of (block.exercises || []).entries()) {
        const key = performanceKey(ex);
        if (!key || result[key]) continue;
        const actual = record.actual?.exercises?.find(item =>
          ex.exerciseId && item.exerciseId ? item.exerciseId === ex.exerciseId : item.name === ex.name && item.block === (block.label || ''));
        const sets = record.log ? (ex.targetSets || []).flatMap((target, si) => {
          const setKey = `${bi}-${ei}-${si}`;
          return record.log.done?.[setKey] ? [{ target, kg: Number(String(record.log.weights?.[setKey] || '').replace(',', '.')) || null }] : [];
        }) : (actual?.setActuals || []).filter(set => set.completed).map(set => ({ target: set.target, kg: set.kg || null }));
        if (sets.length) result[key] = { date: record.date, sets, rpe: record.feedback?.rpe || actual?.sessionRpe || null };
      }
    }
  }
  return result;
}
