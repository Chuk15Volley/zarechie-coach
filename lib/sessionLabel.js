const FOCUS_LABELS = {
  inseason_strength: 'Силовая / поддержание',
  inseason_power: 'Мощность / скорость',
  inseason_prophylaxis: 'Профилактика',
  inseason_deload: 'Разгрузочная тренировка',
  inseason_accumulation: 'Накопление силы',
  inseason_conversion: 'Конверсия в мощность',
  inseason_taper: 'Тейпер к пику',
  inseason_md1_activation: 'Активация / мощность',
  camp_ecc_anterior: 'Эксцентрика · Передняя цепь',
  camp_ecc_posterior: 'Эксцентрика · Задняя цепь',
  camp_ecc_fullbody: 'Эксцентрика · Всё тело',
  camp_iso_anterior: 'Изометрика · Передняя цепь',
  camp_iso_posterior: 'Изометрика · Задняя цепь',
  camp_explosive: 'Взрыв / потенциация',
  zvs_struct: 'Структурная подготовка',
  zvs_strength_base: 'Силовая база',
  zvs_power_transfer: 'Мощность и перенос',
  zvs_strength_day: 'Силовой день',
  zvs_power_day: 'Мощностной день',
  zvs_recovery: 'Восстановление',
  zvs_deload: 'Разгрузочная тренировка',
  strength: 'Силовая тренировка',
  power: 'Мощностная тренировка',
  recovery: 'Восстановительная тренировка',
  rehab: 'Реабилитация / травма',
};

const TRAINING_TYPE_LABELS = {
  anterior_chain: 'Передняя цепь',
  posterior_chain: 'Задняя цепь',
  full_body: 'Всё тело',
  recovery_prehab: 'Восстановление / профилактика',
  activation_power: 'Активация / мощность',
};

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function inferLegacyTrainingLabel(session) {
  if (!session) return '';

  const blocks = Array.isArray(session.blocks) ? session.blocks : [];
  const exercises = blocks.flatMap(block => Array.isArray(block.exercises) ? block.exercises : []);
  const narrative = [
    session.periodization_note,
    session.assessment,
    session.warnings,
    session.goal,
    session.day_goal,
    ...blocks.map(block => block.goal),
  ].map(cleanText).filter(Boolean).join(' ').toLocaleLowerCase('ru');

  let chain = '';
  if (/передн(?:яя|ей|юю)\s+цеп|anterior\s+chain/.test(narrative)) chain = 'Передняя цепь';
  else if (/задн(?:яя|ей|юю)\s+цеп|posterior\s+chain/.test(narrative)) chain = 'Задняя цепь';
  else if (/вс[её]\s+тело|full[ -]?body/.test(narrative)) chain = 'Всё тело';

  const tempos = exercises.map(exercise => cleanText(exercise?.tempo).toLocaleLowerCase('ru'));
  const eccentricCount = tempos.filter(tempo => /^5-0-x-0$/i.test(tempo) || /5\s*сек.*вниз/.test(tempo)).length;
  const isometricCount = tempos.filter(tempo => /(?:0-)?5\s*сек|изометр|\biso\b/.test(tempo)).length;
  const powerCount = tempos.filter(tempo => /реактив|x-0-x|взрыв/.test(tempo)).length;

  let method = '';
  if (eccentricCount >= 2 || /эксцентр/.test(narrative)) method = 'Эксцентрика';
  else if (isometricCount >= 2 || /изометр/.test(narrative)) method = 'Изометрика';
  else if (powerCount >= 2 || /мощност|взрыв|потенциац|power/.test(narrative)) method = 'Мощность / скорость';

  if (method && chain) return `${method} · ${chain}`;
  if (method) return method;
  if (chain) return chain;

  // Ordinary strength sessions also contain a preventive E-block, so a single
  // mention of "профилактика" is not enough to classify the whole workout.
  if (/восстановительн(?:ая|ой)\s+трениров|сессия\s+восстанов|режим\s+восстанов|recovery\s+session|реабилитационн(?:ая|ой)\s+трениров/.test(narrative)) {
    return 'Восстановление / профилактика';
  }

  const loadedExercises = exercises.filter(exercise => Number(exercise?.weightKg) > 0 || /\d\s*кг/i.test(cleanText(exercise?.weightNote))).length;
  return loadedExercises >= 2 ? 'Силовая тренировка' : '';
}

export function parseSavedSession(value) {
  let record = value;
  if (typeof record === 'string') {
    try { record = JSON.parse(record); } catch (_) { return { record: null, session: null }; }
  }
  if (!record || typeof record !== 'object') return { record: null, session: null };

  const session = Array.isArray(record.session?.blocks)
    ? record.session
    : Array.isArray(record.blocks)
      ? record
      : null;
  return { record, session };
}

export function sessionDayGoal(value) {
  const { record, session } = parseSavedSession(value);
  return cleanText(
    record?.dayGoal
      || session?.dayGoal
      || session?.day_goal
      || session?.goal
      || session?.blocks?.[0]?.goal
  );
}

export function sessionTrainingLabel(value) {
  const { record, session } = parseSavedSession(value);
  if (!record) return 'Тренировка в зале';

  const explicit = cleanText(record.trainingLabel || session?.trainingLabel || session?.title || session?.name);
  const focus = cleanText(record.focus || session?.focus);
  const trainingType = cleanText(record.trainingType || session?.trainingType);
  const primary = explicit || FOCUS_LABELS[focus] || '';
  const typeLabel = TRAINING_TYPE_LABELS[trainingType] || '';

  if (primary && typeLabel && !primary.toLocaleLowerCase('ru').includes(typeLabel.toLocaleLowerCase('ru'))) {
    return `${primary} · ${typeLabel}`;
  }
  if (primary || typeLabel) return primary || typeLabel;

  return sessionDayGoal(record) || inferLegacyTrainingLabel(session) || 'Тренировка в зале';
}
