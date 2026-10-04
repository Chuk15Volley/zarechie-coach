// Coaching-quality findings remain advisory. Deterministic safety violations
// and unresolved exercise repetitions prevent unattended auto-save, but a coach may manually
// save after reviewing the warning. The manual decision is recorded by the
// persistence route for auditability.
export function advisorySessionQuality(quality) {
  const score = Number(quality?.score) || 0;
  const reviewRequired = quality?.valid === false || score < 85 || quality?.variety?.needsCorrection === true;
  const checks = Array.isArray(quality?.checks) ? quality.checks : [];
  const safetyFailed = checks.some(check => ['safety', 'season_safety'].includes(check.id) && check.ok === false);
  const doseUnsafe = quality?.dose?.safe === false;
  const varietyFailed = quality?.variety?.needsCorrection === true;
  const blocking = safetyFailed || doseUnsafe || varietyFailed;
  return {
    ...(quality || {}),
    score,
    reviewRequired,
    blocking,
    reviewMessage: varietyFailed && !safetyFailed && !doseUnsafe
      ? 'Остались повторы упражнений из предыдущих программ. Автосохранение отключено: замените отмеченные упражнения или подтвердите программу вручную после проверки.'
      : blocking
      ? 'Обнаружено нарушение безопасности или превышен потолок дозы. Проверьте программу: ручное сохранение тренером разрешено.'
      : reviewRequired
        ? 'Автоматическая проверка рекомендует просмотреть отмеченные пункты; сохранение разрешено.'
        : '',
  };
}
