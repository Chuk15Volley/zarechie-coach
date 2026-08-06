// Deterministic session-dose prescription and audit.
// The language model may select exercises, but it does not get to invent an
// unlimited duration, set volume or jump dose.

const JUMP_RE = /jump|hop|pogo|bound|прыж/i;
const NON_STRENGTH_RE = /mobility|breath|stretch|release|rolling|дых|мобил|растяж/i;

function range(min, max) { return { min, max }; }

function profileFor(focus = '', trainingType = '') {
  const f = String(focus || '').toLowerCase();
  const t = String(trainingType || '').toLowerCase();
  if (t === 'recovery_prehab' || /recovery|prophylaxis|deload|rehab/.test(f)) {
    return { key: 'recovery', minutes: range(30, 50), exercises: range(5, 9), totalSets: range(14, 27), hardSets: range(0, 12), jumpContacts: range(0, 8), targetRpe: range(4, 6) };
  }
  if (/md1|taper/.test(f)) {
    return { key: 'primer', minutes: range(15, 25), exercises: range(4, 7), totalSets: range(8, 18), hardSets: range(2, 8), jumpContacts: range(4, 12), targetRpe: range(4, 6) };
  }
  if (t === 'activation_power' || /activation/.test(f)) {
    return { key: 'activation', minutes: range(20, 35), exercises: range(5, 8), totalSets: range(12, 22), hardSets: range(3, 10), jumpContacts: range(6, 18), targetRpe: range(5, 7) };
  }
  if (/camp_iso|camp_ecc/.test(f)) {
    return { key: 'camp-development', minutes: range(60, 70), exercises: range(9, 13), totalSets: range(27, 42), hardSets: range(12, 24), jumpContacts: range(0, 16), targetRpe: range(7, 8) };
  }
  if (/accumulation/.test(f)) {
    return { key: 'accumulation', minutes: range(55, 70), exercises: range(9, 12), totalSets: range(27, 40), hardSets: range(14, 24), jumpContacts: range(0, 18), targetRpe: range(7, 8.5) };
  }
  if (/power|conversion|explosive/.test(f)) {
    return { key: 'power', minutes: range(35, 50), exercises: range(6, 10), totalSets: range(16, 30), hardSets: range(6, 16), jumpContacts: range(8, 30), targetRpe: range(6, 8) };
  }
  if (/inseason/.test(f)) {
    return { key: 'in-season-strength', minutes: range(40, 55), exercises: range(7, 11), totalSets: range(20, 34), hardSets: range(10, 20), jumpContacts: range(0, 18), targetRpe: range(6.5, 8) };
  }
  return { key: 'general', minutes: range(45, 65), exercises: range(7, 11), totalSets: range(20, 36), hardSets: range(10, 22), jumpContacts: range(0, 24), targetRpe: range(6, 8) };
}

export function buildDosePrescription({ focus = '', trainingType = '', coachRecovery = 'green' } = {}) {
  const base = profileFor(focus, trainingType);
  const modifier = coachRecovery === 'red' ? 0.6 : coachRecovery === 'yellow' ? 0.75 : 1;
  if (modifier === 1) return { ...base, coachRecovery, volumeModifier: 1 };
  const scale = (r, floor = 0) => range(Math.max(floor, Math.round(r.min * modifier)), Math.max(floor, Math.round(r.max * modifier)));
  return {
    ...base,
    totalSets: scale(base.totalSets, 6),
    hardSets: scale(base.hardSets, 0),
    jumpContacts: scale(base.jumpContacts, 0),
    targetRpe: coachRecovery === 'red' ? range(4, 6) : range(Math.min(base.targetRpe.min, 6), Math.min(base.targetRpe.max, 7)),
    coachRecovery,
    volumeModifier: modifier,
  };
}

export function repsFromTarget(value) {
  const text = String(value || '').trim();
  const multiplied = text.match(/^(\d+)\s*[x×]\s*(\d+)/i);
  if (multiplied) return Number(multiplied[1]) * Number(multiplied[2]);
  const first = text.match(/\d+/);
  return first ? Number(first[0]) : 0;
}

function restSeconds(note) {
  const text = String(note || '').toLowerCase();
  const values = [];
  for (const match of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:-|–|—)\s*(\d+(?:[.,]\d+)?)\s*(мин|сек)/g)) {
    const value = (Number(match[1].replace(',', '.')) + Number(match[2].replace(',', '.'))) / 2;
    values.push(value * (match[3] === 'мин' ? 60 : 1));
  }
  for (const match of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(мин|сек)/g)) {
    const value = Number(match[1].replace(',', '.'));
    values.push(value * (match[2] === 'мин' ? 60 : 1));
  }
  return values.length ? Math.min(210, Math.max(...values)) : 75;
}

export function analyzeSessionDose(session) {
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  let totalSets = 0;
  let hardSets = 0;
  let jumpContacts = 0;
  let exerciseCount = 0;
  let durationSeconds = 0;
  const movementSets = { lower: 0, upper: 0, trunkPrehab: 0, power: 0 };

  for (const block of blocks) {
    const exercises = Array.isArray(block.exercises) ? block.exercises : [];
    const rounds = Math.max(0, ...exercises.map(ex => Array.isArray(ex.targetSets) ? ex.targetSets.length : 0));
    let blockSets = 0;
    durationSeconds += 90 + exercises.length * 20; // setup and transitions
    for (const ex of exercises) {
      exerciseCount += 1;
      const sets = Array.isArray(ex.targetSets) ? ex.targetSets.length : 0;
      const name = String(ex.name || '');
      const code = String(ex.code || '');
      blockSets += sets;
      totalSets += sets;
      durationSeconds += sets * (JUMP_RE.test(name) ? 18 : /iso|изометр/i.test(`${name} ${ex.tempo || ''}`) ? 38 : 32);
      if (JUMP_RE.test(name)) {
        const contacts = (ex.targetSets || []).reduce((sum, target) => sum + repsFromTarget(target), 0);
        jumpContacts += contacts;
        movementSets.power += sets;
      } else if (/^[ABC]\d*/i.test(code) && !NON_STRENGTH_RE.test(name)) {
        hardSets += sets;
      }
      if (/squat|split|lunge|deadlift|hinge|hip thrust|step|calf|hamstring|glute|присед|выпад|тяга|ягод|икр/i.test(name)) movementSets.lower += sets;
      else if (/press|push|pull|row|chin|shoulder|жим|тяг|отжим|подтяг/i.test(name)) movementSets.upper += sets;
      else movementSets.trunkPrehab += sets;
    }
    if (blockSets > 0) durationSeconds += Math.max(0, rounds - 1) * restSeconds(block.rest_note);
  }

  return {
    exerciseCount,
    totalSets,
    hardSets,
    jumpContacts,
    estimatedMinutes: Math.round(durationSeconds / 60),
    movementSets,
  };
}

function inRange(value, target, tolerance = 0) {
  return value >= target.min - tolerance && value <= target.max + tolerance;
}

export function auditDose(session, prescription) {
  const actual = analyzeSessionDose(session);
  const p = prescription || buildDosePrescription();
  const checks = {
    exercises: inRange(actual.exerciseCount, p.exercises),
    totalSets: inRange(actual.totalSets, p.totalSets),
    hardSets: inRange(actual.hardSets, p.hardSets),
    jumpContacts: inRange(actual.jumpContacts, p.jumpContacts),
    duration: inRange(actual.estimatedMinutes, p.minutes, 8),
    perExerciseSets: (session?.blocks || []).every(block => (block.exercises || []).every(ex => {
      const count = Array.isArray(ex.targetSets) ? ex.targetSets.length : 0;
      return count >= 1 && count <= 5;
    })),
  };
  const details = [
    `упражнения ${actual.exerciseCount} (цель ${p.exercises.min}-${p.exercises.max})`,
    `подходы ${actual.totalSets} (цель ${p.totalSets.min}-${p.totalSets.max})`,
    `развивающие подходы ${actual.hardSets} (цель ${p.hardSets.min}-${p.hardSets.max})`,
    `прыжковые контакты ${actual.jumpContacts} (лимит ${p.jumpContacts.min}-${p.jumpContacts.max})`,
    `расчётное время ${actual.estimatedMinutes} мин (цель ${p.minutes.min}-${p.minutes.max})`,
  ];
  return { valid: Object.values(checks).every(Boolean), checks, actual, prescription: p, detail: details.join('; ') };
}

export function formatDosePrescriptionForPrompt(prescription) {
  const p = prescription;
  return `\nДЕТЕРМИНИРОВАННЫЙ БЮДЖЕТ ТРЕНИРОВКИ (обязателен):\n` +
    `• Профиль: ${p.key}; длительность ${p.minutes.min}-${p.minutes.max} мин.\n` +
    `• Упражнения: ${p.exercises.min}-${p.exercises.max}; всего рабочих подходов: ${p.totalSets.min}-${p.totalSets.max}; развивающих A/B/C: ${p.hardSets.min}-${p.hardSets.max}.\n` +
    `• Прыжковые контакты: ${p.jumpContacts.min}-${p.jumpContacts.max}; целевой RPE: ${p.targetRpe.min}-${p.targetRpe.max}.\n` +
    `• Коэффициент объёма по готовности тренера: ${p.volumeModifier}. Отдых укажи так, чтобы занятие реально уложилось во время.\n` +
    `→ Не компенсируй снижение объёма повышением отказности. Ни одного подхода до отказа; качество повторений и скорость приоритетнее количества.\n`;
}
