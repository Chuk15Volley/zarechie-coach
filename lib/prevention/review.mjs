// Only explicit ReadySix clinical observations and coach restrictions are compared.
// Daily readiness percentages, calendar and physiological metrics never create a new assessment here.
const stable = value => Array.isArray(value) ? value.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export function clinicalReviewContext(snapshot, restrictions, hold) {
  const decision = snapshot.readySixDecision || {};
  const injuries = (snapshot.injuryLog || []).filter(row => row.status !== 'resolved').map(({ id, date, submittedAt, updatedAt, createdAt, ...clinical }) => clinical);
  const clinicalReason = /pain|complaint|injur|medical|symptom|бол[ьи]|болезн|жалоб|травм|противопоказ|врач|лихорад|температур|невр/i;
  return stable({ restrictions, hold, sourceRestrictions: decision.restrictions || [], observations: decision.observations || [], clinicalReasons: (decision.reasons || []).filter(reason => clinicalReason.test(JSON.stringify(reason))), injuries });
}
export function reviewState(summary, safety) {
  if (summary.status !== 'active') return { needed: false, reason: '' };
  if (safety.hold) return { needed: true, reason: 'Медицинское ограничение ReadySix' };
  if (!safety.available) return { needed: true, reason: 'Уточнить данные ReadySix' };
  if (!summary.reviewFingerprint) return { needed: true, reason: 'Подтвердить актуальность курса' };
  if (summary.reviewFingerprint !== safety.fingerprint) return { needed: true, reason: 'Изменились данные ReadySix для проверки курса' };
  return { needed: false, reason: '' };
}
export function libraryIssues(course) {
  const found = new Map();
  for (const session of course.sessions) for (const exercise of session.exercises) {
    const reasons = [];
    if (!exercise.video) reasons.push('Добавить видео');
    if ((exercise.needsReview && !exercise.note?.trim()) || /техническ.{0,20}заглуш|подсказк.{0,20}уточн/i.test(exercise.note || '')) reasons.push('Уточнить подсказку');
    if (['Shin Box Rotation No Hands', 'Hip Hinge Arms Overhead'].includes(exercise.name)) reasons.push('Проверить название');
    if (exercise.sourceAdaptation) reasons.push('Адаптация по запрету тренера');
    if (!reasons.length) continue;
    if (!found.has(exercise.sourceId)) found.set(exercise.sourceId, { sourceId: exercise.sourceId, name: exercise.name, reasons, sessionIndex: session.index, phase: session.phase, page: session.sourcePage });
  }
  return [...found.values()];
}
