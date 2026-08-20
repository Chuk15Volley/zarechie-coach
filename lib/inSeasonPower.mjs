// Deterministic in-season power/speed methodology.
// The model selects exercises, while this module owns placement, structure,
// positional jump dose, readiness adaptations and the post-generation audit.

const JUMP_RE = /jump|hop|pogo|bound|прыж/i;
const BALLISTIC_RE = /jump|hop|pogo|bound|throw|toss|slam|clean|snatch|high[ -]?pull|plyo push/i;
const SPEED_RE = /sprint|acceleration|change[ -]?of[ -]?direction|\bcod\b|shuffle|deceleration|first[ -]?step|lateral cut|cut drill|pro agility|5-10-5/i;
const HEAVY_STRENGTH_RE = /deadlift|split squat|lunge|squat|pull from blocks|isometric pull|тяга|выпад|присед/i;
const HIGH_RISK_PLYO_RE = /depth jump|drop jump(?! landing)|hurdle (?:jump|hop)|прыж.*(?:с глубины|через барьер)/i;

function range(min, max) { return { min, max }; }

export function isInSeasonPowerFocus(focus = '') {
  return String(focus) === 'inseason_power';
}

export function powerPositionGroup(position = '') {
  const text = String(position).toLowerCase();
  if (/либеро|libero|\bl\b/.test(text)) return 'libero';
  if (/связ|setter|\bs\b/.test(text)) return 'setter';
  if (/центр|middle|\bmb\b/.test(text)) return 'middle';
  if (/диагон|opposite|\bopp\b/.test(text)) return 'opposite';
  return 'outside';
}

const POSITION_LABELS = {
  middle: 'Центральная',
  outside: 'Доигровщица',
  opposite: 'Диагональная',
  setter: 'Связующая',
  libero: 'Либеро',
};

const POSITION_TASKS = {
  middle: 'блоковый и повторный вертикальный прыжок, короткий реактивный цикл, приземление',
  outside: 'прыжок с разбега, первые шаги, торможение, ротационная мощность',
  opposite: 'прыжок с разбега, вертикальная и ударная мощность, торможение',
  setter: 'латеральный первый шаг, умеренная реактивная работа, плечо и передача усилия через корпус',
  libero: 'первый шаг, COD, торможение, низкая стойка и корпус; развивающие прыжки запрещены',
};

function jumpBudget(mode, positionGroup, recoveryStatus) {
  if (positionGroup === 'libero') return range(0, 0);
  if (mode === 'development') {
    const green = positionGroup === 'middle' ? range(18, 24)
      : ['outside', 'opposite'].includes(positionGroup) ? range(14, 20)
        : range(10, 16);
    if (recoveryStatus !== 'yellow') return green;
    return positionGroup === 'middle' ? range(14, 18)
      : ['outside', 'opposite'].includes(positionGroup) ? range(11, 15)
        : range(8, 12);
  }
  const green = ['middle', 'outside', 'opposite'].includes(positionGroup) ? range(6, 10) : range(4, 8);
  if (recoveryStatus !== 'yellow') return green;
  return ['middle', 'outside', 'opposite'].includes(positionGroup) ? range(4, 6) : range(2, 5);
}

function lowPreviousMatchLoad(status = '') {
  return ['low', 'none'].includes(String(status));
}

export function buildInSeasonPowerContext({ focus = '', seasonDecision = null, position = '', recoveryStatus = 'green', requestedMode = 'auto' } = {}) {
  if (!isInSeasonPowerFocus(focus)) return null;
  const positionGroup = powerPositionGroup(position);
  const daysToGame = seasonDecision?.calendar?.daysToGame;
  const previousMatchStatus = seasonDecision?.previousMatchStatus || 'unknown';
  let mode = 'development';
  let reason = 'Ручной выбор тренера или окно MD-4+: полная развивающая сессия мощности/скорости.';

  if (recoveryStatus === 'red') {
    mode = 'recovery';
    reason = 'Красный readiness/боль: мощностная работа отменена, назначается recovery/prehab без прыжков и тяжёлой пары.';
  } else if (seasonDecision?.key === 'compressed_microdose' || daysToGame === 2) {
    mode = 'microdose';
    reason = 'MD-2 или сжатый календарь: 30-минутная микродоза без тяжёлой complex-пары.';
  } else if (daysToGame === 3 && (recoveryStatus !== 'green' || !lowPreviousMatchLoad(previousMatchStatus))) {
    mode = 'microdose';
    reason = `MD-3 допускает Development только при green и невысокой предыдущей игровой нагрузке; readiness=${recoveryStatus}, matchLoad=${previousMatchStatus}.`;
  } else if (daysToGame === 3) {
    reason = 'MD-3, green readiness и невысокая предыдущая игровая нагрузка: разрешён полный Development.';
  } else if (requestedMode === 'microdose') {
    mode = 'microdose';
    reason = 'Ручной выбор тренера: 30-минутная Microdose без тяжёлой complex-пары.';
  } else if (requestedMode === 'development') {
    reason = 'Ручной выбор тренера: полная Development-сессия мощности/скорости.';
  }

  return {
    methodology: 'zarechie-inseason-power-v1',
    mode,
    reason,
    positionGroup,
    positionLabel: POSITION_LABELS[positionGroup],
    positionTask: POSITION_TASKS[positionGroup],
    recoveryStatus,
    requestedMode,
    previousMatchStatus,
    daysToGame: Number.isFinite(Number(daysToGame)) ? Number(daysToGame) : null,
    jumpContacts: mode === 'recovery' ? range(0, 0) : jumpBudget(mode, positionGroup, recoveryStatus),
  };
}

export function inSeasonPowerDoseProfile(context) {
  if (!context) return null;
  if (context.mode === 'recovery') {
    return {
      key: 'in-season-power-red-recovery', powerMode: 'recovery', powerContext: context,
      minutes: range(25, 40), exercises: range(5, 8), totalSets: range(8, 16),
      hardSets: range(0, 2), jumpContacts: range(0, 0), targetRpe: range(2, 5),
      coachRecovery: 'red', volumeModifier: 0,
    };
  }
  if (context.mode === 'microdose') {
    const yellow = context.recoveryStatus === 'yellow';
    return {
      key: yellow ? 'in-season-power-microdose-yellow' : 'in-season-power-microdose',
      powerMode: 'microdose', powerContext: context,
      minutes: range(28, 32), exercises: yellow ? range(4, 7) : range(5, 8),
      totalSets: yellow ? range(8, 14) : range(10, 18), hardSets: range(0, 4),
      jumpContacts: context.jumpContacts, targetRpe: range(3, 5), workingSetRpe: range(4, 6),
      coachRecovery: context.recoveryStatus, volumeModifier: yellow ? 0.65 : 1,
      perExerciseSetsMax: 5,
    };
  }
  const yellow = context.recoveryStatus === 'yellow';
  return {
    key: yellow ? 'in-season-power-development-yellow' : 'in-season-power-development',
    powerMode: 'development', powerContext: context,
    minutes: range(50, 55), exercises: yellow ? range(7, 10) : range(8, 12),
    totalSets: yellow ? range(15, 24) : range(19, 30), hardSets: range(2, 6),
    jumpContacts: context.jumpContacts, targetRpe: yellow ? range(5, 6) : range(5, 7), workingSetRpe: range(6, 8),
    coachRecovery: context.recoveryStatus, volumeModifier: yellow ? 0.75 : 1,
    perExerciseSetsMax: 5,
  };
}

export function formatInSeasonPowerForPrompt(context) {
  if (!context) return '';
  if (context.mode === 'recovery') {
    return `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nМОЩНОСТЬ / СКОРОСТЬ · RED OVERRIDE\n• ${context.reason}\n• 25–40 мин recovery/prehab, JLU=0, без спринта/COD максимальной интенсивности, без Olympic lifts и тяжёлой complex-пары.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  }
  const development = context.mode === 'development';
  const blocks = development
    ? `РОВНО 6 БЛОКОВ A–F:\nA — SPRINT/COD: ровно 2 упражнения по 3–5 качественных отрезков 5–7 м, суммарно 6–10 efforts и 30–60 м; отдых 60–120 сек.\nB — LOWER BALLISTIC/PLYOMETRIC: позиционные прыжки внутри бюджета.\nC — РОВНО ОДНА COMPLEX-ПАРА: C1 тяжёлое 2–3×1–3, 75–85% 1ПМ, RPE 7–8; через 10–30 сек C2 баллистика 2–3 качественных повтора; 2–3 мин между кругами.\nD — UPPER/ROTATIONAL POWER: medball, landmine, ballistic push/pull.\nE — POSITIONAL POWER: дополнительный скоростно-силовой акцент позиции без дублирования C.\nF — PREHAB: короткий индивидуальный блок плечо/колено/голеностоп/кор.`
    : `РОВНО 4 БЛОКА A–D:\nA — SPRINT/COD: 1–2 упражнения, суммарно 4–6 качественных отрезков по 5–7 м и 20–35 м; отдых 60–90 сек.\nB — POSITIONAL BALLISTIC: минимальный прыжковый/баллистический стимул внутри бюджета.\nC — FAST STRENGTH: 1 скоростное силовое движение 2–3×2–4, 40–70% 1ПМ того же движения или RPE 4–6; НЕТ тяжёлой complex-пары.\nD — UPPER POWER + PREHAB: короткая баллистика верхней части и обязательная профилактика.`;
  const yellow = context.recoveryStatus === 'yellow'
    ? development
      ? '\n• YELLOW: объём снижен на 25%; тяжёлая complex-пара C сохраняется, интенсивность не повышать.'
      : '\n• YELLOW: объём микродозы снижен на 30–40%, качество и полный отдых сохранены.'
    : '';
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ОКОНЧАТЕЛЬНАЯ МЕТОДИКА · МОЩНОСТЬ / СКОРОСТЬ
• Режим: ${development ? 'DEVELOPMENT · 50–55 мин чистой работы после отдельной командной разминки' : 'MICRODOSE · 30 мин'}.
• Основание: ${context.reason}
• Позиция: ${context.positionLabel}; задача — ${context.positionTask}
• Рабочий прыжковый бюджет (разминка не считается): ${context.jumpContacts.min}–${context.jumpContacts.max} контактов.
${blocks}${yellow}

УПРАЖНЕНИЯ И НАГРУЗКА:
• Разрешены conventional/barbell deadlift, trap-bar, Olympic pulls и полные Clean/Snatch; Back Squat и Front Squat запрещены.
• Depth Jump и Hurdle Jump запрещены для автоматической генерации. Максимальные Approach/Block Jump разрешены только в Development и внутри бюджета позиции.
• Назначай Olympic lifts всем, если они подходят задаче; тренер вручную заменит упражнение конкретному игроку при необходимости.
• Для скоростной работы без приборов выбирай вес, с которым каждый повтор визуально резкий; никаких grind-повторов.
• Процент 1ПМ используй только от 1ПМ того же упражнения. Не переноси Trap Bar 1ПМ на Conventional Deadlift и не выдумывай 1ПМ для Clean/Snatch: без валидной истории назначай только RPE-диапазон.

СТОП-ПРАВИЛО БЕЗ ИЗМЕРИТЕЛЬНОГО ОБОРУДОВАНИЯ:
• Первое заметное ухудшение скорости, высоты, подседа, приземления, положения колена/корпуса или лишний шаг в COD → полный отдых и одна повторная попытка.
• Второе ухудшение подряд → закончить упражнение. Любая боль → немедленный стоп.

ПРОГРЕССИЯ:
• Сохраняй главные якоря 3–4 экспозиции. Все повторы резкие и RPE ≤6 → следующая экспозиция +2,5–5% веса; RPE 7 → удержать; RPE ≥8 или хуже техника → −5–10%.
• Не повышай вес и прыжковый объём одновременно. Фиксированной волны 3:1 нет: разгрузку определяют календарь, readiness и общий deload.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

function blockKey(block) {
  return String(block?.code || block?.label || '').trim().toUpperCase().match(/^[A-F]/)?.[0] || '';
}

function targetReps(value) {
  const multiplied = String(value || '').match(/^(\d+)\s*[x×]\s*(\d+)/i);
  if (multiplied) return Number(multiplied[1]) * Number(multiplied[2]);
  return Number(String(value || '').match(/\d+/)?.[0] || 0);
}

function looksHeavy(exercise) {
  const text = `${exercise?.name || ''} ${exercise?.weightNote || ''}`;
  return HEAVY_STRENGTH_RE.test(text)
    && /(?:7[5-9]|8[0-5])\s*%|rpe\s*[78]|[78]\s*rpe/i.test(text);
}

function isMicrodoseHeavy(exercise) {
  const text = `${exercise?.name || ''} ${exercise?.weightNote || ''}`;
  return /(?:7[5-9]|[89]\d)\s*%|rpe\s*(?:[7-9]|10)|(?:[7-9]|10)\s*rpe/i.test(text);
}

export function auditInSeasonPowerSession(session, prescription) {
  if (!prescription?.powerMode || prescription.powerMode === 'recovery') return null;
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const keyed = new Map(blocks.map(block => [blockKey(block), block]));
  const exercises = blocks.flatMap(block => block.exercises || []);
  const mode = prescription.powerMode;
  const requiredCodes = mode === 'development' ? ['A', 'B', 'C', 'D', 'E', 'F'] : ['A', 'B', 'C', 'D'];
  const exactStructure = blocks.length === requiredCodes.length
    && requiredCodes.every((code, index) => blockKey(blocks[index]) === code);
  const speedExercises = keyed.get('A')?.exercises || [];
  const sprintEfforts = speedExercises
    .filter(exercise => SPEED_RE.test(String(exercise?.name || '')))
    .reduce((sum, exercise) => sum + (exercise.targetSets || []).length, 0);
  const sprintRange = mode === 'development' ? range(6, 10) : range(4, 6);
  const speedBlockOk = mode === 'development'
    ? speedExercises.length === 2 && speedExercises.every(exercise => SPEED_RE.test(String(exercise?.name || '')) && (exercise.targetSets || []).length >= 3 && (exercise.targetSets || []).length <= 5)
    : speedExercises.length >= 1 && speedExercises.length <= 2 && speedExercises.every(exercise => SPEED_RE.test(String(exercise?.name || '')));
  const jumpContacts = exercises
    .filter(exercise => JUMP_RE.test(String(exercise?.name || '')))
    .reduce((sum, exercise) => sum + (exercise.targetSets || []).reduce((n, target) => n + targetReps(target), 0), 0);
  const complex = keyed.get('C')?.exercises || [];
  const complexOk = mode === 'development'
    ? complex.length === 2 && looksHeavy(complex[0]) && BALLISTIC_RE.test(String(complex[1]?.name || ''))
    : complex.length === 1 && !complex.some(isMicrodoseHeavy);
  const prehabBlock = keyed.get(mode === 'development' ? 'F' : 'D');
  const prehabOk = !!prehabBlock && /prehab|проф|shoulder|ankle|knee|core|rotator|calf|adductor|hamstring/i.test(
    `${prehabBlock.label || ''} ${(prehabBlock.exercises || []).map(ex => ex.name).join(' ')}`
  );
  const highRiskPlyo = exercises.filter(exercise => HIGH_RISK_PLYO_RE.test(String(exercise?.name || ''))).map(ex => ex.name);
  const jumpRange = prescription.jumpContacts;
  const checks = {
    exactStructure,
    sprintDose: speedBlockOk && sprintEfforts >= sprintRange.min && sprintEfforts <= sprintRange.max,
    jumpDose: jumpContacts >= jumpRange.min && jumpContacts <= jumpRange.max,
    complex: complexOk,
    prehab: prehabOk,
    highRiskPlyo: highRiskPlyo.length === 0,
  };
  return {
    valid: Object.values(checks).every(Boolean),
    safe: speedBlockOk && sprintEfforts <= sprintRange.max && jumpContacts <= jumpRange.max && highRiskPlyo.length === 0 && complexOk,
    checks,
    sprintEfforts,
    sprintRange,
    jumpContacts,
    jumpRange,
    highRiskPlyo,
    detail: `${mode}; блоки ${blocks.map(blockKey).join('/') || '—'}; sprint/COD ${sprintEfforts} (цель ${sprintRange.min}-${sprintRange.max}); прыжки ${jumpContacts} (цель ${jumpRange.min}-${jumpRange.max}); complex ${complexOk ? 'да' : 'нет'}; prehab ${prehabOk ? 'да' : 'нет'}`,
  };
}

export function isForbiddenAutomaticPowerPlyometric(name = '') {
  return HIGH_RISK_PLYO_RE.test(String(name));
}
