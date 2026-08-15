// Coaching-quality findings remain advisory. Deterministic safety violations
// (forbidden/restricted exercises, an exceeded dose ceiling or a protected
// match-day rule) block persistence until corrected.
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
      ? 'Обнаружено нарушение безопасности или превышен потолок дозы. Исправьте программу перед сохранением.'
      : reviewRequired
        ? 'Автоматическая проверка рекомендует просмотреть отмеченные пункты; сохранение разрешено.'
      : '',
  };
}
