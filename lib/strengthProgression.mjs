import { retainedStrengthReps, strengthRepCeiling, parseStrengthRepTarget } from './strengthRepProgression.mjs';
import { normalizeStrengthEquipment, strengthEquipmentFamily, normalizeStrengthExperience } from './strengthEquipment.mjs';
import { loadUnitsForExercise } from './tonnage.js';

// A small proposal for coach review, never a fabricated 1RM or a transfer
// between variations. The caller supplies exact-exercise completed evidence.
export function proposeStrengthLoad(exercise, evidence, { targetRpeMax = 8, allowIncrease = false, reduced = false, targetDate = '', equipment = {}, experience = 'unknown' } = {}) {
  const empty = { kg: null, action: 'rpe_only', reason: 'Нет сопоставимого выполненного веса.', sourceDate: evidence?.date || null };
  if (!evidence || exercise.symptomAdapted || evidence.pain) return { ...empty, reason: evidence?.pain ? 'Боль в прошлой экспозиции: вес заново после проверки.' : empty.reason };
  const kg = evidence.observedKg;
  if (!(kg > 0)) return empty;
  const age = (Date.parse(`${targetDate}T12:00:00Z`) - Date.parse(`${evidence.date}T12:00:00Z`)) / 86400000;
  const family = strengthEquipmentFamily(exercise);
  const weights = normalizeStrengthEquipment(equipment)[family] || [];
  const available = weights.some(value => Math.abs(value - kg) < 1e-8);
  const nextAvailable = weights.find(value => value > kg + 1e-8);
  const step = nextAvailable ? nextAvailable - kg : null;
  const roundDown = value => weights.filter(weight => weight <= value + 1e-8).at(-1);
  experience = normalizeStrengthExperience(experience);
  const base = { kg, action: 'hold', reason: 'Удержать выполненный вес и проверить целевое усилие.', sourceDate: evidence.date, observedKg: kg, stepKg: step, equipmentFamily: family, inventoryConfigured: weights.length > 0, experience, loadUnits: loadUnitsForExercise(exercise) };
  const specificRpe = evidence.rpeScope === 'exercise' ? evidence.rpe : null;
  if (age >= 14 || specificRpe > targetRpeMax || evidence.rpe >= 9 || !evidence.allRepsMet || reduced) {
    const next = roundDown(kg * (age >= 14 ? 0.9 : 0.95));
    if (!(next > 0) || next >= kg) return { ...empty, reason: 'Снижение требует ручного подбора доступного снаряда.' };
    return { ...base, kg: next, action: 'reduce', reason: age >= 14 ? 'Перерыв от 14 дней: сниженный вход.' : !evidence.allRepsMet ? 'Не все запланированные повторы выполнены.' : reduced ? 'Сегодня сниженная доза: старт ниже прошлого веса.' : 'Прошлое усилие выше текущей цели.' };
  }
  const retainedReps = retainedStrengthReps(exercise,evidence);
  if (retainedReps && evidence.allSetsCompleted && evidence.repsVerified && evidence.allRepsMet && age<=7 && specificRpe!=null && specificRpe<=targetRpeMax) base.targetReps=retainedReps;
  if (weights.length && !available) return { ...empty, reason: 'Прошлый вес отсутствует в доступном инвентаре; подобрать вес по целевому RPE.' };
  if (!weights.length) return { ...base, reason: 'Инвентарь не задан: только подтверждённый вес, без автоматической прибавки.' };
  if (!evidence.allSetsCompleted) return { ...base, reason: 'Выполнение неполное: прибавку отложить.' };
  if (specificRpe == null) return { ...base, reason: 'RPE упражнения отсутствует: RPE сессии не подтверждает прибавку.' };
  if (!evidence.repsVerified) return { ...base, reason: 'Нет подтверждённых фактических повторов: прибавку отложить.' };
  if (age > 7 || !allowIncrease) return { ...base, reason: 'Контекст нагрузки или давность не подтверждают прибавку.' };
  if (experience === 'unknown' || experience === 'novice') return { ...base, reason: experience === 'unknown' ? 'Стаж не задан: автоматическую прибавку отложить.' : 'Начинающий: закрепить технику и выполненный вес; прибавка после решения тренера.' };
  if (specificRpe <= targetRpeMax - 2) {
    const next = nextAvailable;
    if (!next) return { ...base, reason: 'Достигнут максимальный доступный вес.' };
    if (next / kg <= 1.05 + 1e-8) return { ...base, targetReps:undefined, kg: next, action: 'increase', reason: 'Все подходы и повторы выполнены, RPE упражнения ниже цели; минимальный шаг до 5%.' };
    const current=parseStrengthRepTarget(exercise.targetSets?.[0]);
    const ceiling=strengthRepCeiling(exercise.code);
    if (retainedReps && current && retainedReps<ceiling && ['A1','B1','B2','C1'].includes(exercise.code)) {
      return {...base,action:'increase_reps',targetReps:retainedReps+1,perSide:current.perSide,repCeiling:ceiling,
        reason:`Следующий доступный вес больше на 5%: сохранить кг и добавить 1 повтор в каждом рабочем подходе${current.perSide?' на сторону':''}, до ${ceiling}. Целевой RPE и число подходов прежние.`};
    }
    return { ...base, reason: retainedReps>=ceiling ? 'Достигнут предел повторов методики; удержать вес и повторы, обсудить меньший шаг инвентаря.' : 'Шаг веса больше 5%, но подтверждений для прибавки повторов недостаточно: удержать нагрузку.' };
  }
  return base;
}

export function normalizeExerciseEfforts(input, session) {
  if (input == null) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('exerciseRpe must be an object');
  const result = {};
  for (const [key, effort] of Object.entries(input)) {
    if (!/^\d{1,2}-\d{1,2}$/.test(key)) throw new TypeError('Invalid exercise RPE key');
    const [bi, ei] = key.split('-').map(Number);
    const exercise = session?.blocks?.[bi]?.exercises?.[ei];
    if (!exercise || effort?.name !== exercise.name || !Number.isInteger(effort?.rpe) || effort.rpe < 1 || effort.rpe > 10) throw new TypeError('Invalid exercise RPE or changed exercise');
    result[key] = { name: exercise.name, rpe: effort.rpe };
  }
  return result;
}
