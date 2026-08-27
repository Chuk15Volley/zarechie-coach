// Deterministic in-season strength/maintenance methodology.
// The model selects suitable exercises; this module owns the mode, readiness
// dose, required block roles and the post-generation structural audit.

import { powerPositionGroup } from './inSeasonPower.mjs';

const BALLISTIC_RE = /jump|hop|pogo|bound|throw|toss|slam|sprint|acceleration|change[ -]?of[ -]?direction|\bcod\b|clean\b|snatch\b|high[ -]?pull|plyo|прыж|спринт|брос|рывок|толчок/i;
const LOWER_ANCHOR_RE = /deadlift|hip thrust|trap bar|landmine squat|goblet squat|становая|ягодичн.*мост|присед.*landmine|кубков/i;
const UNILATERAL_LOWER_RE = /split squat|rear.?foot|bulgarian|lunge|step.?up|single.?leg|unilateral|выпад|болгар|зашаг|одноног/i;
const POSTERIOR_RE = /rdl|romanian|hip thrust|back extension|hamstring curl|glute bridge|hinge|pull.?through|разгибан.*бедр|румын|ягод|сгибание ног|гиперэкст/i;
const PRESS_RE = /press|push.?up|жим|отжим/i;
const HORIZONTAL_PULL_RE = /row|face pull|тяга.*(?:горизонт|блок|гантел|trx|кольц)|горизонтальн.*тяг/i;
const CORE_RE = /core|plank|pallof|dead bug|carry|chop|lift|anti.?rotation|кор|планк|перенос|анти.?ротац/i;
const PREHAB_RE = /prehab|rotator|external rotation|scap|calf|soleus|tibialis|achilles|adductor|copenhagen|spanish squat|deceleration|stability|tendon|shoulder|ankle|knee|проф|ротатор|лопат|икр|ахилл|аддукт|стабил|сухож|плеч|голеност|колен/i;
const MACHINE_RE = /leg press|smith machine|leg extension|machine hamstring curl|seated hamstring curl|lying hamstring curl|жим ногами|машин[ае].*смита|разгибание ног|сгибание ног.*тренаж/i;
const HEAVY_RE = /(?:8[0-9]|9\d)\s*%|rpe\s*(?:7|8|9|10)|(?:7|8|9|10)\s*rpe|heavy|тяж/i;

function range(min, max) { return { min, max }; }
function setCount(exercise) { return Array.isArray(exercise?.targetSets) ? exercise.targetSets.length : 0; }
function blockKey(block) { return String(block?.code || block?.label || '').trim().toUpperCase().match(/^[A-E]/)?.[0] || ''; }
function exerciseText(exercise) { return `${exercise?.name || ''} ${exercise?.weightNote || ''} ${exercise?.tempo || ''}`; }

export function isInSeasonStrengthFocus(focus = '') {
  return String(focus) === 'inseason_strength';
}

const POSITION_LABELS = {
  middle: 'Центральная', outside: 'Доигровщица', opposite: 'Диагональная', setter: 'Связующая', libero: 'Либеро',
};

const PREHAB_TASKS = {
  middle: 'выбери 2 приоритета: колено, ахилл/икроножная, плечо',
  outside: 'плечо, задняя цепь и торможение; выбери 2 наиболее актуальных',
  opposite: 'плечо, задняя цепь и торможение; выбери 2 наиболее актуальных',
  setter: 'плечо/лопатка, икроножная и латеральная стабильность; выбери 2',
  libero: 'аддуктор, задняя цепь, кор/торможение; выбери 2, прыжков ноль',
};

export function assessOneRmFreshness(history = [], targetDate = '') {
  const entries = Array.isArray(history) ? history : [];
  const dated = entries
    .map(entry => ({ ...entry, date: String(entry?.date || '') }))
    .filter(entry => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && (!targetDate || entry.date <= targetDate))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!dated.length || !targetDate) return { status: 'missing', fresh: false, date: null, ageDays: null };
  const ageDays = Math.max(0, Math.round((new Date(`${targetDate}T12:00:00Z`) - new Date(`${dated[0].date}T12:00:00Z`)) / 86400000));
  return { status: ageDays <= 84 ? 'fresh' : 'stale', fresh: ageDays <= 84, date: dated[0].date, ageDays };
}

export function buildInSeasonStrengthContext({
  focus = '', position = '', recoveryStatus = 'green', requestedMode = 'development',
  anchorContext = null, oneRmFreshness = null, shoulderConcern = false,
} = {}) {
  if (!isInSeasonStrengthFocus(focus)) return null;
  const positionGroup = powerPositionGroup(position);
  const mode = requestedMode === 'maintenance' ? 'maintenance' : 'development';
  const red = recoveryStatus === 'red';
  const closeExposure = !red && !!anchorContext?.closeExposure;
  const doseStatus = red ? 'red' : (recoveryStatus === 'yellow' || closeExposure ? 'yellow' : 'green');
  const reason = red
    ? 'RED: выбранный силовой метод сохранён в метаданных, но тяжёлая динамическая сила отменена.'
    : closeExposure
      ? 'Тот же силовой паттерн выполнялся менее 48 часов назад: интенсивность якоря не повышать, использовать менее утомительный вариант и YELLOW-объём.'
      : recoveryStatus === 'yellow'
        ? 'YELLOW: интенсивность тяжёлого якоря сохранена, объём снижен на 25–35%.'
        : `Ручной выбор тренера: ${mode === 'development' ? 'Развивающая' : 'Поддерживающая'} силовая сессия.`;
  return {
    methodology: 'zarechie-inseason-strength-v1',
    mode: red ? 'red_adaptation' : mode,
    selectedMode: mode,
    selectedModeLabel: mode === 'development' ? 'Развивающая' : 'Поддерживающая',
    recoveryStatus,
    doseStatus,
    reason,
    positionGroup,
    positionLabel: POSITION_LABELS[positionGroup],
    prehabTask: PREHAB_TASKS[positionGroup],
    shoulderConcern: !!shoulderConcern,
    noOverhead: !!shoulderConcern,
    anchorContext: anchorContext || null,
    oneRmFreshness: oneRmFreshness || { status: 'missing', fresh: false, date: null, ageDays: null },
  };
}

export function inSeasonStrengthDoseProfile(context) {
  if (!context) return null;
  if (context.mode === 'red_adaptation') {
    return {
      key: 'in-season-strength-red-adaptation', strengthMode: 'red_adaptation', strengthContext: context,
      minutes: range(20, 30), exercises: range(5, 7), totalSets: range(8, 12), hardSets: range(0, 2),
      jumpContacts: range(0, 0), targetRpe: range(3, 5), workingSetRpe: range(4, 6),
      coachRecovery: 'red', volumeModifier: 0, perExerciseSetsMax: 3,
    };
  }
  const yellow = context.doseStatus === 'yellow';
  if (context.mode === 'maintenance') {
    return {
      key: yellow ? 'in-season-strength-maintenance-yellow' : 'in-season-strength-maintenance',
      strengthMode: 'maintenance', strengthContext: context,
      minutes: yellow ? range(25, 30) : range(30, 35), exercises: range(6, 8),
      totalSets: yellow ? range(8, 11) : range(11, 15), hardSets: yellow ? range(4, 7) : range(6, 10),
      jumpContacts: range(0, 0), targetRpe: yellow ? range(4, 5) : range(4, 6), workingSetRpe: range(7, 8),
      coachRecovery: context.recoveryStatus, volumeModifier: yellow ? 0.7 : 1, perExerciseSetsMax: 3,
    };
  }
  return {
    key: yellow ? 'in-season-strength-development-yellow' : 'in-season-strength-development',
    strengthMode: 'development', strengthContext: context,
    minutes: yellow ? range(40, 45) : range(50, 55), exercises: yellow ? range(7, 9) : range(7, 9),
    totalSets: yellow ? range(12, 16) : range(16, 21), hardSets: yellow ? range(7, 10) : range(10, 14),
    jumpContacts: range(0, 0), targetRpe: yellow ? range(5, 6) : range(6, 7), workingSetRpe: range(7, 8),
    coachRecovery: context.recoveryStatus, volumeModifier: yellow ? 0.7 : 1, perExerciseSetsMax: 3,
  };
}

function anchorInstruction(context) {
  const anchor = context.anchorContext || {};
  const continuity = [];
  if (anchor.lowerAnchor) continuity.push(`нижний A1: ${anchor.lowerAnchor}`);
  if (anchor.upperAnchor) continuity.push(`верхний B1: ${anchor.upperAnchor}`);
  if (!continuity.length) return '• История якорей отсутствует: выбери подходящие A1 и B1 и начни цикл на 4–6 экспозиций.';
  const reentry = anchor.reentryRequired
    ? ' Точный якорь отсутствовал ≥14 дней: первая экспозиция −10%, максимум 2 рабочих подхода, RPE≤7.'
    : ' Сохрани их, если нет боли, противопоказаний или смены задачи.';
  return `• Текущие якоря — ${continuity.join('; ')}.${reentry}`;
}

export function formatInSeasonStrengthForPrompt(context) {
  if (!context) return '';
  if (context.mode === 'red_adaptation') {
    return `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nСИЛОВАЯ / ПОДДЕРЖАНИЕ — RED adaptation\n• ${context.reason}\n• 20–30 мин чистой работы, 5–7 упражнений, 8–12 лёгких подходов, session RPE 3–5.\n• Ноль прыжков/баллистики и ноль тяжёлой динамической силы. Сохрани full-body паттерны в безопасных вариантах, кор и позиционный prehab.\n• Название выбранного метода не менять на recovery: это RED-адаптация «${context.selectedModeLabel}».\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  }
  const development = context.mode === 'development';
  const structure = development
    ? `РОВНО 5 БЛОКОВ A–E:\nA — ровно 1 тяжёлый bilateral lower anchor, отдельно: 3×2–4, 80–87% свежего 1ПМ или RPE 7–8; отдых 2,5–4 мин.\nB — ровно 2 упражнения paired set: B1 жим + B2 обязательная горизонтальная тяга, обычно 3×4–6.\nC — ровно 1 unilateral lower, отдельно: 2–3×4–6/сторону; паттерн дополняет A.\nD — ровно 2 упражнения paired set: posterior chain 2×5–8 + core.\nE — ровно 2 позиционных prehab-упражнения paired set, обычно по 2 подхода.`
    : `РОВНО 4 БЛОКА A–D:\nA — ровно 1 тяжёлый bilateral lower anchor, отдельно: 2×2–3, 80–85% свежего 1ПМ или RPE 7–8.\nB — ровно 2 упражнения paired set: B1 жим + B2 обязательная горизонтальная тяга, обычно 2×4–6.\nC — ровно 2 упражнения ПОСЛЕДОВАТЕЛЬНО, не утомляющий суперсет: unilateral lower, затем posterior chain.\nD — ровно 3 упражнения: core + два позиционных prehab.`;
  const freshness = context.oneRmFreshness?.fresh
    ? `1ПМ свежий (${context.oneRmFreshness.date}, ${context.oneRmFreshness.ageDays} дн.): проценты разрешены только для того же упражнения.`
    : '1ПМ отсутствует или старше 12 недель: это только справка; точные кг и проценты не назначать, использовать RPE.';
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ОКОНЧАТЕЛЬНАЯ МЕТОДИКА · СИЛОВАЯ / ПОДДЕРЖАНИЕ
• Режим: ${context.selectedModeLabel}; ${development ? '50–55 мин чистой работы, session RPE 6–7' : '30–35 мин, session RPE 4–6'}.
• ${context.reason}
• Позиция: ${context.positionLabel}; prehab — ${context.prehabTask}.
${structure}

ЖЁСТКИЕ ПРАВИЛА:
• Разминку не добавлять: тренер проводит её отдельно. Только full-body. Прыжки, спринт, COD, броски, PAP/contrast и Olympic lifts запрещены.
• Back Squat и Front Squat запрещены. Conventional Deadlift, Trap Bar Deadlift, Hip Thrust, тяжёлый Split Squat и Barbell Bench Press разрешены. Barbell OHP назначай редко; при высокой плечевой нагрузке/симптомах исключи и предпочти DB/Landmine.
• Тренажёры/cable/TRX допустимы как accessory/prehab, но не как A/B/C1 primary anchor. Nordic Curl и Heavy Good Morning автоматически не назначать.
• A по умолчанию hip-dominant bilateral (Trap Bar, Conventional Deadlift, Hip Thrust; Landmine/Goblet при необходимости), C — дополняющий knee-dominant unilateral. Если A knee-dominant, C должен быть hip-dominant.
• Горизонтальная тяга есть всегда. Вертикальная тяга может быть дополнительной, но не заменяет горизонтальную. Подходов тяги не меньше, чем жима; OH/OPP/MB целятся примерно в 3:2, S/L минимум 1:1.
• Темп главных движений: около 2 секунд контролируемо вниз, вверх с максимальным намерением ускориться. Трёхсекундная эксцентрика и изометрии 20–45 сек допустимы только в целевом tendon/prehab.
• STOP одного подхода: любой grind, потеря позиции, RPE>8 или новая/усилившаяся боль немедленно завершает подход.

НАГРУЗКА И ПРОГРЕССИЯ:
• ${freshness}
${anchorInstruction(context)}
• Приоритет: фактический вес+RPE → свежий 1ПМ → RPE-only. Никогда не выдумывай кг и не переноси 1ПМ между упражнениями.
• Повышай вес только после двух качественных экспозиций: barbell +2,5–5 кг, DB +2 кг на каждый снаряд. Поддерживающая может подтвердить следующую прогрессию, но не обязана повышать вес.
• Prehab — развивающая работа: 6–12 повторов RPE 6–7 или изометрия 20–45 сек, без отказа; прогресс после двух уверенных экспозиций. Сохраняй 1–2 упражнения 3–6 экспозиций.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

export function auditInSeasonStrengthSession(session, prescription) {
  if (!prescription?.strengthMode) return null;
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const exercises = blocks.flatMap(block => block.exercises || []);
  const dose = {
    totalSets: exercises.reduce((sum, exercise) => sum + setCount(exercise), 0),
  };
  const context = prescription.strengthContext || {};
  if (prescription.strengthMode === 'red_adaptation') {
    const noBallistic = exercises.every(ex => !BALLISTIC_RE.test(exerciseText(ex)));
    const noHeavy = exercises.every(ex => !HEAVY_RE.test(exerciseText(ex)));
    const doseOk = exercises.length >= prescription.exercises.min && exercises.length <= prescription.exercises.max
      && dose.totalSets >= prescription.totalSets.min && dose.totalSets <= prescription.totalSets.max;
    const checks = { noBallistic, noHeavy, dose: doseOk };
    return { valid: Object.values(checks).every(Boolean), safe: noBallistic && noHeavy && dose.totalSets <= prescription.totalSets.max, checks, detail: `RED adaptation; ${exercises.length} упражнений; ${dose.totalSets} подходов; баллистика ${noBallistic ? 'нет' : 'есть'}; тяжёлая сила ${noHeavy ? 'нет' : 'есть'}` };
  }
  const development = prescription.strengthMode === 'development';
  const requiredCodes = development ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
  const keyed = new Map(blocks.map(block => [blockKey(block), block]));
  const a = keyed.get('A')?.exercises || [];
  const b = keyed.get('B')?.exercises || [];
  const c = keyed.get('C')?.exercises || [];
  const d = keyed.get('D')?.exercises || [];
  const e = keyed.get('E')?.exercises || [];
  const exactStructure = blocks.length === requiredCodes.length && requiredCodes.every((code, index) => blockKey(blocks[index]) === code);
  const aOk = a.length === 1 && LOWER_ANCHOR_RE.test(exerciseText(a[0])) && !MACHINE_RE.test(exerciseText(a[0]));
  const bOk = b.length === 2 && PRESS_RE.test(exerciseText(b[0])) && HORIZONTAL_PULL_RE.test(exerciseText(b[1]))
    && setCount(b[1]) >= setCount(b[0]) && b.every(ex => !MACHINE_RE.test(exerciseText(ex)));
  const cOk = development
    ? c.length === 1 && UNILATERAL_LOWER_RE.test(exerciseText(c[0])) && !MACHINE_RE.test(exerciseText(c[0]))
    : c.length === 2 && UNILATERAL_LOWER_RE.test(exerciseText(c[0])) && POSTERIOR_RE.test(exerciseText(c[1])) && !MACHINE_RE.test(exerciseText(c[0]));
  const dOk = development
    ? d.length === 2 && POSTERIOR_RE.test(exerciseText(d[0])) && CORE_RE.test(exerciseText(d[1]))
    : d.length === 3 && CORE_RE.test(exerciseText(d[0])) && d.slice(1).every(ex => PREHAB_RE.test(exerciseText(ex)));
  const eOk = !development || (e.length === 2 && e.every(ex => PREHAB_RE.test(exerciseText(ex))));
  const noBallistic = exercises.every(ex => !BALLISTIC_RE.test(exerciseText(ex)));
  const mainAutoReg = [a[0], b[0], c[0]].filter(Boolean)
    .every(ex => /grind|rpe\s*>?\s*8|позици|техник|боль|pain/i.test(String(ex?.autoReg || '')));
  const shoulderOk = !context.noOverhead || exercises.every(ex => !/overhead|military press|жим.*голов/i.test(exerciseText(ex)));
  const machinePrimaryOk = [...a, ...b, ...(c.slice(0, 1))].every(ex => !MACHINE_RE.test(exerciseText(ex)));
  const checks = { exactStructure, lowerAnchor: aOk, pressPull: bOk, complementaryLower: cOk, posteriorCore: dOk, prehab: eOk, noBallistic, mainAutoReg, shoulder: shoulderOk, machinePrimary: machinePrimaryOk };
  return {
    valid: Object.values(checks).every(Boolean),
    safe: noBallistic && shoulderOk && machinePrimaryOk && setCount(a[0]) <= 3,
    checks,
    detail: `${context.selectedModeLabel || prescription.strengthMode}; блоки ${blocks.map(blockKey).join('/') || '—'}; A ${aOk ? 'да' : 'нет'}; жим+горизонтальная тяга ${bOk ? 'да' : 'нет'}; lower C ${cOk ? 'да' : 'нет'}; posterior/core ${dOk ? 'да' : 'нет'}; prehab ${eOk ? 'да' : 'нет'}; баллистика ${noBallistic ? 'нет' : 'есть'}`,
  };
}

export function isStrengthMachineAccessoryAllowed(name = '', exerciseCode = '') {
  if (!MACHINE_RE.test(String(name))) return false;
  const code = String(exerciseCode).toUpperCase();
  return /^D|^E|^C2/.test(code);
}
