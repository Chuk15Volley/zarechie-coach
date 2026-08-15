// lib/sessionValidator.js
// Programmatic validation of AI-generated session output.

import { hasRestriction } from './exerciseRestrictions.js';
import { auditDose, buildDosePrescription } from './sessionDose.mjs';
import { SLED_EXERCISE_PATTERN } from './equipmentRestrictions.mjs';

const FORBIDDEN_PATTERNS = [
  SLED_EXERCISE_PATTERN,
  /back squat|классический присед|присед.*со штанг.*спин/i,
  /front squat|присед.*со штанг.*груд|фронтальн.*присед/i,
  /barbell bench press|bench press barbell|жим штанги лёжа/i,
  /barbell deadlift|conventional deadlift|становая.*штанг/i,
  /bent.?over row|тяга.*наклон|barbell row/i,
  /nordic curl|nordic hamstring|нордик/i,
  /olympic lift|clean\b|snatch\b|рывок|толчок.*штанг|power clean|hang clean/i,
  /heavy good morning|good morning/i,
  /barbell overhead press|overhead press.*barbell|military press|жим штанги стоя/i,
  /leg press|жим ногами/i,
  /smith machine|машин[ае].*смита/i,
  /leg extension|разгибание ног/i,
  /(?:seated|lying|machine) hamstring curl|сгибание ног.*тренаж/i,
  /ab wheel|ab roller|ролик.*пресс|rollout/i,
  /broad jump|прыжок в длину/i,
  /floor press|жим.*пол[уе]|жим на полу/i,
  /incline push[ -]?up|наклонн.*отжим/i,
  /wrist stability|стабилизация запястья|band.*wrist/i,
  /jump set drill|прыжок.*передач|имитация передачи/i,
  /kb press|жим.*гир[яеи]\b|kettlebell press/i,
  /tricep.*band.*pushdown|band.*tricep|pushdown.*петл|разгибание.*локт.*петл/i,
];

function normalizeExerciseName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function isMainExercise(exercise) {
  return /^[ABC]1\b/i.test(String(exercise?.code || ''));
}

function isRecoverySession(focus = '', trainingType = '') {
  return trainingType === 'recovery_prehab'
    || /prophylaxis|deload|rehab/i.test(String(focus));
}

function isActivationSession(focus = '', trainingType = '') {
  return trainingType === 'activation_power'
    || /activation|taper|explosive/i.test(String(focus));
}

function recentExerciseContext(summaries = []) {
  const all = new Set();
  const main = new Set();
  const lastTwo = new Set();
  const recent = Array.isArray(summaries) ? summaries : [];

  recent.forEach((summary, summaryIndex) => {
    const matches = String(summary || '').matchAll(/\[([A-E]\d+)\]\s+(.+?)\s+\(/gi);
    for (const match of matches) {
      const normalized = normalizeExerciseName(match[2]);
      if (!normalized) continue;
      all.add(normalized);
      if (/^[ABC]1$/i.test(match[1])) main.add(normalized);
      if (summaryIndex >= Math.max(0, recent.length - 2)) lastTwo.add(normalized);
    }
  });

  return { all, main, lastTwo };
}

export function validateSession(session, playerRestrictions = []) {
  const errors = [];
  const warnings = [];

  if (!session?.blocks?.length) {
    errors.push('Сессия не содержит блоков');
    return { valid: false, errors, warnings };
  }

  const exerciseNames = new Map();
  const exerciseCodes = new Map();

  for (const block of session.blocks) {
    const code = block.code || block.label || '?';
    for (const ex of block.exercises || []) {
      const name = ex.name || '';
      const normalizedName = normalizeExerciseName(name);
      const exerciseCode = String(ex.code || '').trim().toUpperCase();

      if (normalizedName) {
        if (exerciseNames.has(normalizedName)) {
          errors.push(`Упражнение "${name}" повторяется внутри одной сессии`);
        } else {
          exerciseNames.set(normalizedName, code);
        }
      }
      if (exerciseCode) {
        if (exerciseCodes.has(exerciseCode)) {
          errors.push(`Код упражнения ${exerciseCode} используется больше одного раза`);
        } else {
          exerciseCodes.set(exerciseCode, name);
        }
      }

      // Check forbidden exercises
      for (const re of FORBIDDEN_PATTERNS) {
        if (re.test(name)) {
          errors.push(`Запрещённое упражнение в блоке ${code}: "${name}"`);
        }
      }

      // Check player restrictions
      if (playerRestrictions.length && hasRestriction(name, playerRestrictions)) {
        errors.push(`Упражнение "${name}" нарушает ограничения игрока`);
      }

      // Check weight sanity (if 1RM-based)
      if (ex.weightKg && parseFloat(ex.weightKg) > 300) {
        warnings.push(`Подозрительно высокий вес в "${name}": ${ex.weightKg} кг`);
      }
    }
  }

  // Check E-block exists (prophylaxis)
  const hasEBlock = session.blocks.some(
    b => b.code === 'E' || (b.label || '').toUpperCase() === 'E' || (b.label || '').toLowerCase().includes('проф')
  );
  if (!hasEBlock) {
    warnings.push('Отсутствует E-блок профилактики');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Deterministic quality gate for generated sessions. The model designs the
// programme; this function verifies that the result is coach-ready and that
// variation does not destroy the continuity needed for measurable progression.
export function assessSessionQuality(session, {
  playerRestrictions = [],
  focus = '',
  trainingType = '',
  recentSessionSummaries = [],
  dosePrescription = null,
  seasonDecision = null,
  medicalReviewRequired = false,
  medicalReviewReason = '',
} = {}) {
  const validation = validateSession(session, playerRestrictions);
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const exercises = blocks.flatMap(block => (block.exercises || []).map(ex => ({ ...ex, block: block.label || block.code || '' })));
  const mainExercises = exercises.filter(isMainExercise);
  const accessoryExercises = exercises.filter(ex => !isMainExercise(ex));
  const names = exercises.map(ex => normalizeExerciseName(ex.name)).filter(Boolean);
  const uniqueNames = new Set(names);
  const codes = exercises.map(ex => String(ex.code || '').trim().toUpperCase()).filter(Boolean);
  const uniqueCodes = new Set(codes);
  const recovery = isRecoverySession(focus, trainingType);
  const activation = isActivationSession(focus, trainingType);
  const prescription = dosePrescription || buildDosePrescription({ focus, trainingType });
  const doseAudit = auditDose(session, prescription);
  const conservativeDoseAccepted = !doseAudit.valid && doseAudit.safe && doseAudit.minimumViable;
  const doseAcceptable = doseAudit.valid || conservativeDoseAccepted;
  const seasonSafety = (() => {
    const key = seasonDecision?.key;
    if (!key) return { ok: true, detail: 'сезонный safety override не требуется' };
    const actual = doseAudit.actual;
    if (key === 'md_plus_1') {
      const ok = actual.loadedHardSets === 0 && actual.jumpContacts === 0;
      return { ok, detail: ok ? 'MD+1: тяжёлые подходы и прыжки исключены' : `MD+1 нарушен: ${actual.loadedHardSets} нагруженных тяжёлых подходов, ${actual.jumpContacts} прыжковых контактов` };
    }
    if (key === 'travel_day') {
      const ok = actual.loadedHardSets <= 2 && actual.jumpContacts === 0;
      return { ok, detail: ok ? 'доза дня переезда соблюдена' : `день переезда: ${actual.loadedHardSets} нагруженных подходов, ${actual.jumpContacts} прыжковых контактов` };
    }
    if (['match_day', 'md_minus_1'].includes(key)) {
      const ok = actual.hardSets <= 6 && actual.jumpContacts <= 10 && actual.estimatedMinutes <= 28;
      return { ok, detail: ok ? 'лимиты primer соблюдены' : `primer перегружен: ${actual.hardSets} тяжёлых, ${actual.jumpContacts} контактов, ${actual.estimatedMinutes} мин` };
    }
    return { ok: true, detail: 'специальные лимиты микроцикла соблюдены' };
  })();
  const expectedBlocks = recovery || activation ? [3, 5] : [4, 5];
  const recent = recentExerciseContext(recentSessionSummaries);

  const currentMain = new Set(mainExercises.map(ex => normalizeExerciseName(ex.name)).filter(Boolean));
  const currentAccessories = accessoryExercises.map(ex => normalizeExerciseName(ex.name)).filter(Boolean);
  const accessoryOverlap = currentAccessories.length
    ? currentAccessories.filter(name => recent.lastTwo.has(name)).length / currentAccessories.length
    : 0;
  const anchorContinuity = recent.main.size === 0
    || recovery
    || [...currentMain].some(name => recent.main.has(name));
  const variationOk = accessoryOverlap <= 0.4;

  const completeExercises = exercises.filter(ex =>
    ex.name
    && ex.code
    && Array.isArray(ex.targetSets)
    && ex.targetSets.length > 0
    && ex.tempo
    && ex.cue
    && Number(ex.loadUnits || 0) >= 1
  ).length;
  const blocksWithRest = blocks.filter(block => String(block.rest_note || '').trim()).length;
  const mainsWithLoad = mainExercises.filter(ex =>
    ex.weightKg != null || /rpe|вручную|вес тела|%\s*1пм/i.test(String(ex.weightNote || ''))
  ).length;
  const mainsWithAutoreg = mainExercises.filter(ex => String(ex.autoReg || '').trim()).length;
  const hasPrehab = recovery || activation || blocks.some(block =>
    String(block.label || block.code || '').toUpperCase() === 'E'
    || /prehab|проф|mobility|мобил/i.test(String(block.label || block.code || ''))
  );

  const checks = [
    {
      id: 'safety', label: 'Безопасность', maxPoints: 26,
      ok: validation.valid,
      detail: validation.valid ? 'запреты и ограничения соблюдены' : validation.errors.join('; '),
    },
    {
      id: 'season_safety', label: 'Безопасность микроцикла', maxPoints: 0,
      ok: seasonSafety.ok,
      detail: seasonSafety.detail,
    },
    {
      id: 'uniqueness', label: 'Уникальность внутри сессии', maxPoints: 8,
      ok: uniqueNames.size === names.length && uniqueCodes.size === codes.length,
      detail: uniqueNames.size === names.length && uniqueCodes.size === codes.length ? 'нет дублей' : 'есть повтор упражнения или кода',
    },
    {
      id: 'structure', label: 'Структура блоков', maxPoints: 12,
      ok: blocks.length >= expectedBlocks[0] && blocks.length <= expectedBlocks[1] && blocksWithRest === blocks.length,
      detail: `${blocks.length} блоков; отдых задан в ${blocksWithRest}/${blocks.length}`,
    },
    {
      id: 'dose', label: 'Дозировка и время', maxPoints: 20,
      ok: doseAcceptable,
      points: doseAudit.valid ? 20 : conservativeDoseAccepted ? 15 : 0,
      detail: conservativeDoseAccepted ? `безопасная консервативная дозировка; ${doseAudit.detail}` : doseAudit.detail,
    },
    {
      id: 'completeness', label: 'Полнота назначения', maxPoints: 10,
      ok: exercises.length > 0 && completeExercises === exercises.length,
      detail: `${completeExercises}/${exercises.length} упражнений имеют подходы, темп, cue и loadUnits`,
    },
    {
      id: 'progression', label: 'Прогрессия и авторегуляция', maxPoints: 10,
      ok: recovery || (mainExercises.length > 0 && mainsWithLoad === mainExercises.length && mainsWithAutoreg === mainExercises.length),
      detail: recovery ? 'восстановительная сессия' : `${mainsWithLoad}/${mainExercises.length} с нагрузкой; ${mainsWithAutoreg}/${mainExercises.length} с авторегуляцией`,
    },
    {
      id: 'continuity', label: 'Континуитет главных движений', maxPoints: 6,
      ok: anchorContinuity,
      detail: recent.main.size === 0 ? 'история для сравнения ещё не накоплена' : anchorContinuity ? 'сохранён измеримый якорь прогрессии' : 'все основные движения заменены',
    },
    {
      id: 'variation', label: 'Разумная вариативность', maxPoints: 3,
      ok: variationOk,
      detail: recent.lastTwo.size === 0 ? 'история для сравнения ещё не накоплена' : `${Math.round(accessoryOverlap * 100)}% аксессуаров повторяют последние 2 сессии`,
    },
    {
      id: 'prehab', label: 'Профилактика', maxPoints: 5,
      ok: hasPrehab,
      detail: hasPrehab ? 'профилактический компонент присутствует' : 'нет E/prehab-компонента',
    },
  ].map(check => ({ ...check, points: check.points ?? (check.ok ? check.maxPoints : 0) }));

  const score = checks.reduce((sum, check) => sum + check.points, 0);
  const improvements = checks.filter(check => !check.ok).map(check => `${check.label}: ${check.detail}`);
  const criticalChecks = ['safety', 'season_safety', 'uniqueness', 'structure', 'dose', 'completeness'];
  const criticalValid = checks.filter(check => criticalChecks.includes(check.id)).every(check => check.ok);

  return {
    score,
    grade: score >= 90 ? 'elite' : score >= 80 ? 'professional' : score >= 70 ? 'review' : 'reject',
    valid: validation.valid && criticalValid && score >= 85,
    checks,
    improvements,
    errors: validation.errors,
    warnings: [
      ...validation.warnings,
      ...(conservativeDoseAccepted ? [`Консервативная дозировка принята по готовности: ${doseAudit.detail}`] : []),
      ...improvements,
    ],
    dose: doseAudit,
    seasonDecision,
    medicalReviewRequired: !!medicalReviewRequired,
    medicalReviewReason: medicalReviewReason || '',
  };
}

export function qualityCorrectionPrompt(userPrompt, session, quality) {
  const issues = (quality?.improvements || []).map(item => `• ${item}`).join('\n');
  return `${userPrompt}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nПРОФЕССИОНАЛЬНЫЙ КОНТРОЛЬ КАЧЕСТВА: ${quality?.score ?? 0}/100\n${issues || '• Нужна более точная и профессиональная версия программы.'}\n\nПредыдущая версия:\n${JSON.stringify(session)}\n\nИсправь только отмеченные недостатки, сохрани удачные решения и ручной метод тренера. Основные движения не меняй без причины: они являются якорями прогрессии. Верни только улучшенную тренировку через build_session.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
