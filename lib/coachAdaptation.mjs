import { medicalHoldReason } from './medicalHold.mjs';
export { medicalHoldReason } from './medicalHold.mjs';
import { buildPrehabResult, prehabSymptoms } from './prehabMethodology.mjs';
import { restrictedDayPlan } from './restrictedDayPlan.mjs';

// Automatic readiness is a planning signal. Medical contraindications remain binding.

export function buildCoachAdaptation({ snapshot, recommendation, date, dayGoal = '', focus, strengthMode = 'maintenance', playerRestrictions = [], recentSessions = [], historyAvailable = true, coachRecovery = 'green' }) {
  if (!recommendation?.state) return null;
  const hold = medicalHoldReason(snapshot, recommendation.state, date);
  if (hold) {
    const result = restrictedDayPlan({ snapshot, recommendation, date, dayGoal, allowRegionalDraft: false });
    result.focus = focus;
    result.strengthMode = strengthMode;
    result.session.methodology = { requestedFocus: focus, requestedStrengthMode: strengthMode, medicalHold: true };
    result.session.assessment = hold;
    result.session.warnings = `${hold} ${result.session.warnings}`;
    result.quality.medicalReviewReason = hold;
    return result;
  }
  if (focus === 'inseason_prophylaxis') return null;
  const symptoms = prehabSymptoms(snapshot, recommendation.state, date);
  const automatic = recommendation.state.hardStop || Number(recommendation.state.capPercent) < 100 || recommendation.state.level !== 'green' || (recommendation.state.targets || []).some(t => t.hardStopSignal === true || (t.healthCapPercent != null && Number(t.healthCapPercent) < 100));
  if (!automatic && !symptoms.zones.length && !playerRestrictions.length) return null;
  const result = buildPrehabResult({ snapshot, recommendation, date, dayGoal, playerRestrictions, recentSessions, historyAvailable, coachRecovery, rotateAll: focus === 'inseason_strength' });
  if (!result) {
    const review = restrictedDayPlan({ snapshot, recommendation: { ...recommendation, reasons: [...recommendation.reasons, 'Недостаточно безопасных новых вариантов: требуется подбор тренером; тяжёлая генерация не разрешена.'] }, date, dayGoal, allowRegionalDraft: false });
    review.focus = focus; review.strengthMode = strengthMode;
    review.session.methodology = { requestedFocus: focus, requestedStrengthMode: strengthMode, adaptationUnavailable: true };
    return review;
  }
  const label = focus === 'inseason_strength' ? `Силовая · ${strengthMode === 'development' ? 'развивающая' : 'поддерживающая'}` : 'Выбранный вид тренировки';
  const review = `${label}: адаптированный черновик по жалобам ReadySix. Автоматический статус не обнуляет программу. Медицинские ограничения сохранены; болезненные области — только комфортные движения без веса после проверки тренером. Это облегчённая адаптация, не тяжёлая развивающая нагрузка.`;
  result.focus = focus;
  result.strengthMode = strengthMode;
  result.trainingType = 'recovery_prehab';
  result.session.methodology = { ...result.session.methodology, requestedFocus: focus, requestedStrengthMode: strengthMode, coachAutomaticStatusOverride: true, adaptedMethodDraft: true, developmentStimulus: false };
  if (focus === 'inseason_strength') result.session.methodology.progression = 'Сохранять освоенные двигательные задачи при еженедельной смене безопасных вариантов. Боль не преодолевать; сопротивление и прогрессию согласовать с тренером.';
  result.session.warnings = result.session.warnings.replace(/черновик профилактики/g, 'черновик выбранного метода');
  result.session.draftPolicy = { requiresReview: true, medicalOverride: false };
  result.session.assessment = review;
  result.session.periodization_note = `50 минут занятия с индивидуальной лёгкой активной дозой, настройкой, паузами и контролем техники. Разминка отдельно. 10–12 упражнений; RPE 2–4, без отказа, прыжков и тяжёлой эксцентрики. ${review}`;
  result.session.warnings = `${review} ${result.session.warnings}`;
  result.saveWarning = review;
  result.quality.medicalReviewRequired = true;
  result.quality.medicalReviewReason = review;
  return result;
}
