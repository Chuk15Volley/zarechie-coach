// Coaching-quality findings remain advisory. Deterministic safety violations
// still prevent unattended auto-save, but an authenticated coach may manually
// save after reviewing the warning. The manual decision is recorded by the
// persistence route for auditability.
export function advisorySessionQuality(quality) {
  const score = Number(quality?.score) || 0;
  const reviewRequired = quality?.valid === false || score < 85;
  const checks = Array.isArray(quality?.checks) ? quality.checks : [];
  const safetyFailed = checks.some(check => ['safety', 'season_safety'].includes(check.id) && check.ok === false);
  const doseUnsafe = quality?.dose?.safe === false;
  const blocking = safetyFailed || doseUnsafe;
  return {
    ...(quality || {}),
    score,
    reviewRequired,
    blocking,
    reviewMessage: blocking
      ? 'Обнаружено нарушение безопасности или превышен потолок дозы. Проверьте программу: ручное сохранение тренером разрешено.'
      : reviewRequired
        ? 'Автоматическая проверка рекомендует просмотреть отмеченные пункты; сохранение разрешено.'
        : '',
  };
}
