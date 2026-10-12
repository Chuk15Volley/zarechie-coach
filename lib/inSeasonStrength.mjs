import {hasLateralMovementFromC} from './strengthLateralVector.mjs';
// Deterministic in-season strength/maintenance methodology.
// The model selects suitable exercises; this module owns the mode, readiness
// dose, required block roles and the post-generation structural audit.

import { varietyExerciseKey } from './exerciseVariety.mjs';
import { loadUnitsForExercise } from './tonnage.js';
import { estimateStrengthMinutes, STRENGTH_VERSION } from './strengthExecution.mjs';
import { powerPositionGroup } from './inSeasonPower.mjs';

const BALLISTIC_RE = /jump|hop|pogo|bound|throw|toss|slam|sprint|acceleration|change[ -]?of[ -]?direction|\bcod\b|clean\b|snatch\b|high[ -]?pull|plyo|прыж|спринт|брос|рывок|толчок/i;
const LOWER_ANCHOR_RE = /deadlift|hip thrust|trap bar|landmine squat|goblet squat|становая|ягодичн.*мост|присед.*landmine|кубков/i;
const UNILATERAL_LOWER_RE = /split squat|rear.?foot|bulgarian|lunge|step.?up|single.?leg|kickstand|b[ -]?stance|unilateral|выпад|болгар|зашаг|одноног/i;
const POSTERIOR_RE = /rdl|romanian|hip thrust|back extension|hamstring curl|glute bridge|hinge|pull.?through|разгибан.*бедр|румын|ягод|сгибание ног|гиперэкст/i;
const PRESS_RE = /press|push.?up|жим|отжим/i;
const HORIZONTAL_PULL_RE = /row|face pull|тяга.*(?:горизонт|блок|гантел|trx|кольц)|горизонтальн.*тяг/i;
const CORE_RE = /core|plank|pallof|dead bug|carry|chop|lift|anti.?rotation|кор|планк|перенос|анти.?ротац/i;
const PREHAB_RE = /prehab|rotator|external rotation|face[ -]?pull|hip airplane|balance|band pull[ -]?apart|y[ -]?t[ -]?w|scap|(?:prone|supported|cable|band).*[ywt][ -]?raise|serratus|calf|soleus|tibialis|achilles|adductor|copenhagen|spanish squat|step[ -]?down|deceleration|stability|tendon|shoulder|ankle|knee|hip abduction|hip adduction|проф|ротатор|лопат|икр|ахилл|аддукт|стабил|сухож|плеч|голеност|колен/i;
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
  focus = '', position = '', recoveryStatus = 'green', requestedMode = 'maintenance', targetDate = '', calendar = null, actualHistory = [],
  strengthCycle = null, regionalZones = [], trainingType = 'full_body', lateralVector = false, anchorContext = null, oneRmFreshness = null, shoulderConcern = false,
} = {}) {
  if (!isInSeasonStrengthFocus(focus)) return null;
  const positionGroup = powerPositionGroup(position);
  const mode = requestedMode === 'development' ? 'development' : 'maintenance';
  const red = recoveryStatus === 'red';
  const daysToGame = Number.isFinite(calendar?.daysToGame) ? calendar.daysToGame : null;
  const matchClose = daysToGame != null && daysToGame <= 3;
  const calendarUnknown = daysToGame == null;
  const weekStart = value => { const d=new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7); return d.toISOString().slice(0,10); };
  const completedThisWeek = targetDate ? actualHistory.filter(record => record.focus === 'inseason_strength' && record.date < targetDate && record.date >= weekStart(targetDate) && (record.exercises || []).some(ex => (ex.setActuals || []).some(set => set.completed))).map(record=>record.date) : [];
  const closeExposure = !strengthCycle && !red && !!anchorContext?.closeExposure;
  const doseStatus = red ? 'red' : (recoveryStatus === 'yellow' || closeExposure || (matchClose || calendarUnknown || calendar?.congested || (!strengthCycle && completedThisWeek.length)) ? 'yellow' : 'green');
  const reason = red
    ? 'RED: выбранный силовой метод сохранён в метаданных, но тяжёлая динамическая сила отменена.'
    : closeExposure
      ? 'Тот же силовой паттерн выполнялся менее 48 часов назад: интенсивность якоря не повышать, использовать менее утомительный вариант и YELLOW-объём.'
      : recoveryStatus === 'yellow'
        ? 'YELLOW: меньше рабочих подходов и умеренное усилие; вес подбирать по текущей переносимости, интенсивность не сохранять автоматически.'
        : `Ручной выбор тренера: ${mode === 'development' ? 'Развивающая' : 'Поддерживающая'} силовая сессия.`;
  return {
    methodology: STRENGTH_VERSION, strengthCycle, regionalZones, trainingType, lateralVector, targetDate, daysToGame, actualHistory, calendarUnknown, completedThisWeek, eveningCourt:true, weeklySessions:1,
    mode: red ? 'red_adaptation' : mode,
    selectedMode: mode,
    selectedModeLabel: mode === 'development' ? 'Развивающая' : 'Поддерживающая',
    recoveryStatus,
    doseStatus,
    reason: reason + (!strengthCycle && completedThisWeek.length ? ` Силовая уже выполнена на этой неделе (${completedThisWeek.join(', ')}): повторное занятие требует решения тренера; не считать его плановой второй силовой.` : '') + (mode === 'maintenance' ? calendarUnknown ? ' Дата матча неизвестна: консервативная доза, сверить расписание до выполнения.' : matchClose ? ` До матча ${daysToGame} дн.: уменьшенный объём и усилие перед вечерней площадкой.` : ' Утром после разминки; вечером площадка, без накопления утомления.' : ''),
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
  if(context.strengthCycle && (context.regionalZones?.length || context.trainingType !== 'full_body' || context.strengthCycle.previousDate)) return {key:'in-season-strength-regional-cycle',strengthMode:context.selectedMode,strengthContext:context,minutes:range(20,50),exercises:range(8,8),totalSets:range(8,17),hardSets:range(0,11),jumpContacts:range(0,0),targetRpe:range(4,7),workingSetRpe:range(7,8),perExerciseSetsMax:3};
  if (context.mode === 'maintenance') {
    return {
      key: yellow ? 'in-season-strength-maintenance-yellow' : 'in-season-strength-maintenance',
      strengthMode: 'maintenance', strengthContext: context,
      minutes: range(40, 50), exercises: range(8, 8),
      totalSets: yellow ? range(10, 13) : range(13, 17), hardSets: yellow ? range(5, 8) : range(8, 11),
      jumpContacts: range(0, 0), targetRpe: yellow ? range(4, 5) : range(4, 6), workingSetRpe: yellow ? range(6, 7) : range(7, 8),
      coachRecovery: context.recoveryStatus, volumeModifier: yellow ? 0.7 : 1, perExerciseSetsMax: 3,
    };
  }
  return {
    key: yellow ? 'in-season-strength-development-yellow' : 'in-season-strength-development',
    strengthMode: 'development', strengthContext: context,
    minutes: range(40, 50), exercises: yellow ? range(7, 9) : range(7, 9),
    totalSets: yellow ? range(12, 16) : range(16, 21), hardSets: yellow ? range(7, 10) : range(8, 11),
    jumpContacts: range(0, 0), targetRpe: yellow ? range(5, 6) : range(6, 7), workingSetRpe: range(7, 8),
    coachRecovery: context.recoveryStatus, volumeModifier: yellow ? 0.7 : 1, perExerciseSetsMax: 3,
  };
}

function anchorInstruction(context) {
  const anchor = context.anchorContext || {};
  const continuity = [];
  if (anchor.lowerAnchor) continuity.push(`нижний A1: ${anchor.lowerAnchor}`);
  if (anchor.upperAnchor) continuity.push(`верхний B1: ${anchor.upperAnchor}`);
  if (!continuity.length) return '• История якорей отсутствует: выбери подходящие A1 и B1 для первой тренировки.';
  const reentry = anchor.reentryRequired
    ? ' Перерыв ≥14 дней: выбери безопасные варианты вне окна повторов; первая экспозиция −10%, максимум 2 рабочих подхода, RPE≤7.'
    : ' Ротируй упражнения внутри этих двигательных задач: недавние A1/B1/C1 также нельзя повторять. Вес нового варианта подбирай отдельно по RPE и технике.';
  return `• Текущие якоря — ${continuity.join('; ')}.${reentry}`;
}

export function formatInSeasonStrengthForPrompt(context) {
  if (!context) return '';
  if (context.mode === 'red_adaptation') {
    return `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nСИЛОВАЯ / ПОДДЕРЖАНИЕ — RED adaptation\n• ${context.reason}\n• 20–30 мин чистой работы, 5–7 упражнений, 8–12 лёгких подходов, session RPE 3–5.\n• Ноль прыжков/баллистики и ноль тяжёлой динамической силы. Сохрани full-body паттерны в безопасных вариантах, кор и позиционный prehab.\n• Название выбранного метода не менять на recovery: это RED-адаптация «${context.selectedModeLabel}».\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  }
  if (context.selectedMode === 'maintenance') return `
СИЛОВАЯ v2 · ПОДДЕРЖАНИЕ СИЛЫ И ГОТОВНОСТЬ К МАТЧУ (приоритет над общими инструкциями)
• Оба пространства. Одна силовая в неделю, утром после командной разминки; вечером площадка. Предпочтительно MD−4/MD−3. ${context.reason}
• Основная часть 40–50 мин: рабочие и подводящие подходы, восстановление, настройка. Разминка отдельно. Не добирать объём ради времени.
• Ровно четыре блока A–D, 8 упражнений на всё тело:
A: одно bilateral lower (3 × 3–5 green; 2 × 3–4 yellow).
B: жим + горизонтальная тяга (по 2 × 4–6), последовательно, не суперсет.
${context.trainingType === 'anterior_chain' ? 'АКЦЕНТ ПЕРЕДНЯЯ ЦЕПЬ: A1 Goblet/Landmine Squat, C1 Single-Leg/Kickstand RDL.' : context.trainingType === 'posterior_chain' ? 'АКЦЕНТ ЗАДНЯЯ ЦЕПЬ: A1 Deadlift/Romanian Deadlift/Hip Thrust, C1 Lunge/Split Squat/Step-Up.' : ''}
${context.lateralVector ? 'ЛАТЕРАЛЬНЫЙ ВЕКТОР с C: при тазовом A1 выбрать C1 Lateral Lunge/Lateral Step-Up. При коленном A1 сохранить C1 RDL, а в одном из индивидуальных D2/D3 выбрать динамическое hip abduction/adduction. Объём не увеличивать; боковая планка не заменяет движение. При локальной боли ног/паха исключить нагруженные боковые выпады; разгруженный вариант после проверки тренером или явная отсрочка.' : ''}
C: дополняющее unilateral lower (2 × 4–6/side green, 1 × 4–6/side yellow) + hamstring/posterior chain (2 × 6–8 green, 1 × 6–8 yellow), последовательно. Если A — тяга/Hip Thrust (hip-dominant), C1 обязательно knee-dominant: вариант Lunge, Split Squat или Step-Up. Если A — Goblet/Landmine Squat (knee-dominant), C1 hip-dominant: Single-Leg/Kickstand RDL. Не назначать два основных hip-dominant подряд. C2 — Hamstring Curl, Back Extension или дополнительное разгибание бедра, не икроножная работа.
D: первое упражнение core (Pallof, Dead Bug, Plank, Carry), затем два индивидуальных prehab (по 1–2 подхода, 6–12 повторов или 20–30 sec удержания).
• Green 13–17 рабочих подходов; Yellow/MD−3/неизвестный календарь 10–13. Основные подходы RPE 7–8 green, 6–7 yellow; дополнительные RPE 6–7; C2 при Yellow RPE 5–6, чтобы не превышать 8 развивающих подходов. RED: только облегчённый план 20–30 мин по допуску ReadySix, без тяжёлой силы.
• Позиция: ${context.positionLabel}; индивидуальные задачи: ${context.prehabTask}. Жалобы и ограничения ReadySix имеют приоритет; боль не является диагнозом.
• Все упражнения менять относительно предыдущей недели и последних программ, включая A1/B1/C1. Сохранять двигательные задачи; изменение названия, темпа, веса или повторений не является новым упражнением. Если нет безопасной замены — ручная проверка вместо выдуманного упражнения.
• Названия упражнений только английские; техника на русском, соответствует выбранному варианту и оборудованию. Никаких новых сложных навыков ради разнообразия.
• Back Squat, Front Squat, Nordic Curl, Heavy Good Morning, прыжки, броски, спринты, COD, Olympic lifts, PAP/contrast запрещены. Машины допустимы в accessory, не как основные A/B1/C1. При симптомах плеча без overhead. Горизонтальной тяги не меньше подходов, чем жима.
• Вес: только фактически выполненные подходы ТОГО ЖЕ упражнения и числа снарядов. Для новой вариации кг не назначать — подводящие подходы и RPE. 1ПМ и проценты не использовать. RPE сессии/блока не выдавать за RPE каждого подхода. Нет RPE/повторов — нет автоматической прибавки. Вес DB указывать на один снаряд.
• Отдых отдельный от времени блока: A 180 sec green / 150 sec yellow; B 150/120 sec; C 120/90 sec; D 60 sec. Переход 60 sec. Сначала завершить все подходы упражнения. Не сокращать восстановление ради плотности.
• A1 — стандартная вариация Trap Bar Deadlift/Romanian Deadlift/Hip Thrust/Goblet Squat/Landmine Squat с доступным оборудованием; не выдумывать Belt Squat attachment. Основные A1/B1/C1 не на TRX, cable/band или тренажёрах: свободный вес или разрешённое упражнение с весом тела; B2 — разрешённая горизонтальная тяга; Seated Cable Row/Cable Row и Barbell Bench Press запрещены тренером. Prehab выполнять плавно и под контролем, удержания без резкого наращивания напряжения.
• Вниз около 2 сек контролируемо, вверх с намерением ускориться без потери позиции. Отказ, grind, новая/усилившаяся боль или RPE>8 — остановить подход. При усилии выше цели снизить вес; не назначать предельную эксцентрику/непривычную нагрузку перед площадкой.
• Прогресс не по весу разных вариаций и не по общему тоннажу: сравнивать повторные экспозиции одного упражнения с учётом повторений/RPE/техники; автоматического повышения нет.
`;
  return `
СИЛОВАЯ · РАЗВИВАЮЩАЯ v2 (приоритет над общими инструкциями)
• Одна утренняя сессия в неделю после командной разминки; вечером площадка. Основная часть 40–50 минут с подводящими подходами и настройкой. ${context.reason}
• Ровно 5 блоков A–E, 8 упражнений, последовательно, без суперсетов:
A1 bilateral lower: 3 × 3–5.
B1 жим + B2 горизонтальная тяга: по 2 × 4–6.
C1 unilateral lower: 2 × 4–6/side, дополняет A (если A тяга/Hip Thrust, C Lunge/Split Squat/Step-Up; если A присед, C Single-Leg RDL).
D1 posterior chain: 2 × 6–8 + D2 core: 2 × 6–10 или 20–30 sec.
E1/E2 два индивидуальных prehab: по 2 × 8–12 или 20–30 sec.
• Green 17 рабочих подходов; Yellow 12–14, можно короче. Главные RPE 7–8 Green / 6–7 Yellow, дополнительные 6–7. Без отказа и тяжёлой непривычной эксцентрики.
• Отдых A 180/150 sec Green/Yellow, B 150/120, C 120/90, D 90/60, E 60; переход 60 sec. Время блока не является отдыхом между подходами.
• ${context.positionLabel}: ${context.prehabTask}. Боль и медицинские ограничения приоритетны. При боли не назначать тяжёлую нагрузку на эту область; нужна отдельная адаптация.
• Менять ВСЕ упражнения относительно предыдущих программ и недели, сохранять двигательные задачи. Названия только английские. Короткая техника на русском: два точных предложения о выбранном варианте и оборудовании; без обрывов текста.
• Вес только из выполненных подходов ТОГО ЖЕ упражнения с сопоставимыми повторениями и RPE. Новая вариация — подводящие подходы, точные кг не назначать. 1ПМ, проценты и перенос кг между вариациями запрещены. RPE сессии не считать RPE каждого подхода. Автоматической прибавки нет.
${context.trainingType === 'anterior_chain' ? '• ПЕРЕДНЯЯ ЦЕПЬ: A1 Goblet/Landmine Squat; C1 Single-Leg/Kickstand RDL. Коленный паттерн получает приоритет первого блока. Сохранить жим, не меньшую горизонтальную тягу и posterior accessory; без увеличения подходов.' : context.trainingType === 'posterior_chain' ? '• ЗАДНЯЯ ЦЕПЬ: A1 Deadlift/Romanian Deadlift/Hip Thrust; C1 Lunge/Split Squat/Step-Up. Тазовый паттерн получает приоритет первого блока. Сохранить жим и коленный паттерн; без увеличения подходов.' : ''}
${context.lateralVector ? '• ЛАТЕРАЛЬНЫЙ ВЕКТОР с C: при hip-dominant A выбрать C1 Lateral Lunge/Lateral Step-Up; при knee-dominant A сохранить C1 RDL и использовать один существующий индивидуальный слот для hip abduction/adduction. Без добавления упражнений и подходов. При боли колена, голени, стопы/ахилла/паха — без нагруженного бокового выпада; только разрешённая разгруженная адаптация или явная отсрочка с проверкой тренером. Side Plank/Pallof/Carry не заменяют латеральное движение.' : ''}
• A1/B1/C1 свободный вес или обычный Push-Up, без machine/TRX/band/cable. B2 — разрешённая горизонтальная тяга; Seated Cable Row/Cable Row и Barbell Bench Press запрещены тренером. A стандартный Trap Bar Deadlift/Romanian Deadlift/Hip Thrust/Goblet Squat/Landmine Squat. Без Back/Front Squat, Nordic Curl, Heavy Good Morning, прыжков, бросков, спринтов, COD, Olympic lifts и контраста.
• Главные движения: вниз около 2 sec, вверх с намерением ускориться при сохранении позиции. Core/prehab плавно; без резкого напряжения при удержаниях. Новая/усилившаяся боль, grind, потеря позиции или RPE>8 — остановить подход. Повторная силовая в ту же неделю требует решения тренера.
`;

}

// A shared stop rule is prescribed by the methodology, not inferred by the model.
export function enforceStrengthStopRule(session, focus) {
  if (!isInSeasonStrengthFocus(focus) || !session?.blocks) return session;
  return { ...session, blocks: session.blocks.map(block => ({ ...block,
    exercises: (block.exercises || []).map(ex => /^[ABC]1$/i.test(ex.code || '')
      ? { ...ex, autoReg: 'Любой grind, потеря позиции, RPE > 8 или новая/усилившаяся боль → немедленно завершить подход.' }
      : ex),
  })) };
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
    const executionSafe = session.methodology?.version !== STRENGTH_VERSION || (estimateStrengthMinutes(session) <= 30 && exercises.every(ex => !/[а-яё]/i.test(ex.name || '') && !Number(ex.weightKg)));
    const checks = { noBallistic, noHeavy, execution:executionSafe, dose: doseOk };
    return { valid: Object.values(checks).every(Boolean), safe: noBallistic && noHeavy && executionSafe && dose.totalSets <= prescription.totalSets.max, checks, detail: `RED adaptation; ${exercises.length} упражнений; ${dose.totalSets} подходов; баллистика ${noBallistic ? 'нет' : 'есть'}; тяжёлая сила ${noHeavy ? 'нет' : 'есть'}` };
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
  const regional = ex => ex?.symptomAdapted === true && ex.weightKg == null && ex.targetRpeMax <= 4;
  const aOk = a.length === 1 && (regional(a[0]) || LOWER_ANCHOR_RE.test(exerciseText(a[0]))) && !MACHINE_RE.test(exerciseText(a[0]));
  const bOk = b.length === 2 && (regional(b[0]) || PRESS_RE.test(exerciseText(b[0]))) && (regional(b[1]) || HORIZONTAL_PULL_RE.test(exerciseText(b[1])))
    && setCount(b[1]) >= setCount(b[0]) && b.every(ex => !MACHINE_RE.test(exerciseText(ex)));
  const cOk = development
    ? c.length === 1 && (regional(c[0]) || UNILATERAL_LOWER_RE.test(exerciseText(c[0]))) && !MACHINE_RE.test(exerciseText(c[0]))
    : c.length === 2 && (regional(c[0]) || UNILATERAL_LOWER_RE.test(exerciseText(c[0]))) && (regional(c[1]) || POSTERIOR_RE.test(exerciseText(c[1]))) && !MACHINE_RE.test(exerciseText(c[0]));
  const dOk = development
    ? d.length === 2 && (regional(d[0]) || POSTERIOR_RE.test(exerciseText(d[0]))) && (regional(d[1]) || CORE_RE.test(exerciseText(d[1])))
    : d.length === 3 && (regional(d[0]) || CORE_RE.test(exerciseText(d[0]))) && d.slice(1).every(ex => (regional(ex) || PREHAB_RE.test(exerciseText(ex))));
  const eOk = !development || (e.length === 2 && e.every(ex => (regional(ex) || PREHAB_RE.test(exerciseText(ex)))));
  const noBallistic = exercises.every(ex => !BALLISTIC_RE.test(exerciseText(ex)));
  const mainAutoReg = [a[0], b[0], c[0]].filter(Boolean)
    .every(ex => /grind|rpe\s*>?\s*8|позици|техник|боль|pain/i.test(String(ex?.autoReg || '')));
  const shoulderOk = !context.noOverhead || exercises.every(ex => !/overhead|military press|жим.*голов/i.test(exerciseText(ex)));
  const machinePrimaryOk = [...a, ...b, ...(c.slice(0, 1))].every(ex => !MACHINE_RE.test(exerciseText(ex))) && (session.methodology?.version !== STRENGTH_VERSION || [a[0],b[0],c[0]].filter(Boolean).every(ex => !/trx|cable|band|machine|smith/i.test(ex.name)));
  const executionOk = session.methodology?.version !== STRENGTH_VERSION || (blocks.every(block => block.exerciseOrder === 'sequential' && Number(block.restSeconds) >= 45 && Number(block.restSeconds) <= 180 && Number(block.transitionRestSeconds) === 60) && estimateStrengthMinutes(session) <= 50 && (context.strengthCycle && (context.regionalZones?.length || context.trainingType !== 'full_body' || context.strengthCycle.previousDate) || context.doseStatus === 'yellow' || estimateStrengthMinutes(session) >= 40));
  const historicalLoadOk = session.methodology?.version !== STRENGTH_VERSION || exercises.every(ex => !Number(ex.weightKg) || (ex.loadEvidence?.kg === ex.weightKg && ex.loadEvidence?.exerciseKey === varietyExerciseKey(ex.name) && ex.loadEvidence?.loadUnits === loadUnitsForExercise(ex) && ex.loadEvidence?.date < context.targetDate && !ex.loadEvidence?.pain));
  const v2 = session.methodology?.version === STRENGTH_VERSION;
  const englishNames = !v2 || exercises.every(ex => !/[а-яё]/i.test(ex.name || ''));
  const repsOk = !v2 || exercises.every(ex => {
    const code = String(ex.code || '');
    return (ex.targetSets || []).every(target => {
      const text = String(target);
      if (/sec|сек/i.test(text)) return /^[DE]/.test(code) && Number(text.match(/\d+/)?.[0]) >= 15 && Number(text.match(/\d+/)?.[0]) <= 45;
      if (!/^\d+(?:\/side)?$/.test(text)) return false;
      const reps=Number(text.match(/\d+/)?.[0]);
      return regional(ex) ? reps>=5 && reps<=10 : /^A/.test(code) ? reps>=2 && reps<=5 : /^[BC]1|^B2/.test(code) ? reps>=3 && reps<=6 : reps>=5 && reps<=12;
    }) && setCount(ex) <= (/^A/.test(code) ? 3 : 2);
  });
  const complementOk = regional(a[0]) || regional(c[0]) || !v2 || !a[0] || !c[0] || (/deadlift|hip thrust|hinge|glute bridge/i.test(a[0].name) !== /rdl|romanian|deadlift|hip thrust|hinge|glute bridge/i.test(c[0].name));
  const weeklyCadence = !!context.strengthCycle || !v2 || !(context.completedThisWeek || []).length;
  const chainFocus = regional(a[0]) || !['anterior_chain','posterior_chain'].includes(context.trainingType) ||
    (context.trainingType === 'anterior_chain' ? /goblet squat|landmine squat/i.test(a[0]?.name || '') : /deadlift|hip thrust/i.test(a[0]?.name || ''));
  const lateralVector = !context.lateralVector || hasLateralMovementFromC(session) || !!session.methodology?.lateralVectorDeferred;
  const checks = { lateralVector, chainFocus, weeklyCadence, englishNames, repetitions:repsOk, complementaryPattern:complementOk, execution: executionOk, historicalLoad: historicalLoadOk, exactStructure, lowerAnchor: aOk, pressPull: bOk, complementaryLower: cOk, posteriorCore: dOk, prehab: eOk, noBallistic, mainAutoReg, shoulder: shoulderOk, machinePrimary: machinePrimaryOk };
  return {
    valid: Object.values(checks).every(Boolean),
    safe: lateralVector && chainFocus && noBallistic && shoulderOk && machinePrimaryOk && weeklyCadence && englishNames && repsOk && complementOk && executionOk && historicalLoadOk && setCount(a[0]) <= 3,
    checks,
    detail: `Частота и соседние сессии ${weeklyCadence?'учтены':'требуют решения тренера'}; исполнение ${executionOk?'да':`нет: расчёт ${estimateStrengthMinutes(session)} мин; Green должен укладываться в 40–50 мин при установленном отдыхе, A 3 рабочих подхода; при сниженной дозе разрешено короче`}; история веса ${historicalLoadOk?'да':'нет'}; повторы/подходы ${repsOk?'да':'нет'}; английские названия ${englishNames?'да':'нет'}; дополняющий паттерн ${complementOk?'да':`нет: A1 ${a[0]?.name}, C1 ${c[0]?.name}; при тяге в A нужен knee-dominant Lunge/Split Squat/Step-Up в C1, при приседе — Single-Leg RDL`}; ${context.selectedModeLabel || prescription.strengthMode}; блоки ${blocks.map(blockKey).join('/') || '—'}; A ${aOk ? 'да' : `нет: ${a[0]?.name}; нужен стандартный bilateral Trap Bar Deadlift/Hip Thrust/Goblet Squat/Landmine Squat`}; жим+горизонтальная тяга ${bOk ? 'да' : 'нет'}; lower C ${cOk ? 'да' : 'нет'}; posterior/core ${dOk ? 'да' : 'нет'}; prehab ${eOk ? 'да' : 'нет'}; основные без TRX/band/cable ${machinePrimaryOk?'да':`нет: A1 ${a[0]?.name}, B1 ${b[0]?.name}, C1 ${c[0]?.name}; заменить резину/TRX/cable свободным весом или обычным Push-Up`}; STOP главных подходов ${mainAutoReg ? 'да' : 'нет'}; баллистика ${noBallistic ? 'нет' : 'есть'}`,
  };
}

export function isStrengthMachineAccessoryAllowed(name = '', exerciseCode = '') {
  if (!MACHINE_RE.test(String(name))) return false;
  const code = String(exerciseCode).toUpperCase();
  return /^D|^E|^C2/.test(code);
}
