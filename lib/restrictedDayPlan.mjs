// A review draft when an explicit regional permission exists; otherwise a day plan.
export function restrictedDayPlan({ snapshot, recommendation, date, dayGoal = '', playerRestrictions = [], allowRegionalDraft = true }) {
  const draft = allowRegionalDraft && restrictedUpperDraft({ snapshot, recommendation, date, dayGoal, playerRestrictions });
  if (draft) return draft;
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


// Separate health permission from the combined health/calendar cap. This is a
// coach-review draft, not a change to ReadySix's stop or the official rest day.
function restrictedUpperDraft({ snapshot, recommendation, date, dayGoal, playerRestrictions }) {
  const targets = recommendation.state.targets || [];
  const upper = targets.filter(item => item.target === 'strength_upper');
  if (upper.length !== 1 || upper[0].hardStopSignal !== false
      || upper[0].healthRecommendation !== 'full' || Number(upper[0].healthCapPercent) !== 100) return null;
  // No inference from missing targets, overall percentages, or free-text pain.
  if (!targets.some(item => item.target === 'strength_lower' && item.hardStopSignal === true)) return null;
  if (!Array.isArray(playerRestrictions) || playerRestrictions.some(id => !['JUMP', 'AXIAL', 'KNEE_HIGH', 'ANKLE'].includes(id))) return null;
  const stop = 'При появлении или усилении боли — прекратить упражнение и обратиться к специалисту.';
  const exercises = [
    ['Chest-Supported DB Row', '8', 'Грудь опирается на наклонную скамью; корпус неподвижен, без разгибания поясницы.'],
    ['Chest-Supported Reverse Fly', '10', 'Грудь опирается на скамью; короткая комфортная амплитуда, без движения корпусом.'],
    ['Seated DB Curl (Back Supported)', '10', 'Спина опирается на спинку скамьи; без раскачивания и помощи ногами.'],
    ['Seated Band External Rotation (Back Supported)', '10', 'Спина с опорой; локти у корпуса, движение в комфортной амплитуде.'],
  ].map(([name, reps, cue], index) => ({
    code: `${index < 2 ? 'A' : 'B'}${index % 2 + 1}`, name, targetSets: [reps, reps],
    weightNote: 'Черновик: сопротивление подбирает тренер после проверки; без прогрессии, ориентир RPE 3–4.',
    tempo: 'контролируемый', cue: `Плавное движение в обе стороны, без рывка. ${cue}`,
    autoReg: stop, alternatives: [], loadUnits: index < 3 ? 2 : 1,
  }));
  const review = 'Черновик для согласования: ReadySix разрешает верх тела по здоровью, но сохраняет общий стоп и ограничения календаря. До выполнения согласовать упражнения и допуск со штабом.';
  const warnings = [review, recommendation.state.detail, ...recommendation.reasons,
    'Без нагрузки на низ, прыжков, спринта, осевой нагрузки, работы стоя и упражнений на корпус.', stop].filter(Boolean).join(' ');
  return {
    session: { kind: 'restricted_training_draft',
      blocks: [{label:'A', rest_note:'60–90 сек между подходами; упражнения последовательно.', exercises:exercises.slice(0,2)},
        {label:'B', rest_note:'60–90 сек между подходами; упражнения последовательно.', exercises:exercises.slice(2)}],
      assessment: review,
      periodization_note: 'Адаптированный шаблон: только верх тела с опорой. Четыре упражнения по два лёгких подхода; рабочие веса не назначены. Это черновик для тренера, а не допуск к выполнению.',
      warnings, triggers:[stop],
      draftPolicy:{allowedTarget:'strength_upper',healthCapPercent:100,calendarOverride:false,requiresReview:true},
    }, player:snapshot.player,date,dayGoal,dataSummary:warnings,
    focus:'recovery_review',trainingType:'upper_body',autoSaved:false,
    saveWarning:review,
    quality:{valid:true,errors:[],warnings:[review],medicalReviewRequired:true,medicalReviewReason:review,readySixState:recommendation.state},
  };
}
