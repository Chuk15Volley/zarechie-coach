// The club does not have a sled/prowler. Keep one shared matcher and sanitizer
// so prompt wording, generated sessions, manual saves and exercise replacement
// cannot drift apart.
export const SLED_EXERCISE_PATTERN = /\bsled\b|\bprowler\b|\bсан(?:и|ей|ями|ям|ях|ки|ок|кам|ками|ках)\b|толкани[ея].*(?:сан|нагруженн.*платформ)|тяг[аи].*сан/i;

export function isSledExercise(name) {
  return SLED_EXERCISE_PATTERN.test(String(name || ''));
}

function fallbackName(name) {
  return /pull|drag|backward|reverse|тяг|назад/i.test(String(name || ''))
    ? 'Backward Band Walk'
    : 'Band-Resisted March';
}

function sanitizeExercise(exercise) {
  const alternatives = Array.isArray(exercise?.alternatives)
    ? exercise.alternatives.filter(alternative => !isSledExercise(typeof alternative === 'string' ? alternative : alternative?.name))
    : exercise?.alternatives;
  const sourceName = `${exercise?.name || ''} ${exercise?.nameEn || ''}`;
  if (!isSledExercise(sourceName)) return { ...exercise, ...(alternatives ? { alternatives } : {}) };
  const replacement = fallbackName(sourceName);
  return {
    ...exercise,
    name: replacement,
    ...(exercise?.nameEn != null ? { nameEn: replacement } : {}),
    weightKg: null,
    loadUnits: 1,
    weightNote: 'Сопротивление резины подобрать вручную, цель RPE 6-7',
    cue: replacement === 'Backward Band Walk'
      ? 'Темп: контролируемые шаги назад. Колени направлены по линии стоп.'
      : 'Темп: мощный марш вперёд. Корпус стабилен, колено поднимай активно.',
    ...(exercise?.img_prompt != null ? { img_prompt: 'Athlete performing a band-resisted march with resistance band around waist, upright trunk, powerful knee drive, no sled.' } : {}),
    ...(alternatives ? { alternatives } : {}),
  };
}

export function sanitizeUnavailableEquipmentExercises(plan) {
  if (!plan || typeof plan !== 'object') return plan;
  const sanitizeGroups = groups => (groups || []).map(group => ({
    ...group,
    exercises: (group.exercises || []).map(sanitizeExercise),
  }));
  return {
    ...plan,
    ...(Array.isArray(plan.blocks) ? { blocks: sanitizeGroups(plan.blocks) } : {}),
    ...(Array.isArray(plan.sections) ? { sections: sanitizeGroups(plan.sections) } : {}),
  };
}
