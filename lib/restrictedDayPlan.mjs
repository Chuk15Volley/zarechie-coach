// A completed planning result, never an exercise prescription or clearance.
export function restrictedDayPlan({ snapshot, recommendation, date, dayGoal = '' }) {
  const reason = [recommendation.state.label, recommendation.state.detail, ...recommendation.reasons].filter(Boolean);
  const warnings = [...new Set(reason)].join(' ');
  const nextSteps = recommendation.key === 'no_gym'
    ? 'Следовать подтверждённому расписанию дня. Дополнительная тренировка в зале не назначена.'
    : 'Перед выполнением нагрузки согласовать допуск и ограничения со штабом и обновить решение в ReadySix. После обновления повторить генерацию.';
  return {
    session: {
      kind: 'restricted_day_plan', blocks: [],
      assessment: `План дня без тренировочной нагрузки. ${nextSteps}`,
      periodization_note: 'План сформирован с учётом ограничений ReadySix. Упражнения, подходы и рабочие веса не назначены.',
      warnings,
    },
    player: snapshot.player, date, dayGoal, dataSummary: warnings,
    focus: 'recovery_review', trainingType: 'recovery_prehab',
    autoSaved: false, saveWarning: 'План дня готов. Он не является допуском к тренировке и не заменяет ранее сохранённую программу.',
    quality: { valid: true, errors: [], warnings: [warnings], medicalReviewRequired: true,
      medicalReviewReason: nextSteps, readySixState: recommendation.state },
  };
}
