// Quality analysis is advisory for the coach. It may trigger one automatic
// correction pass, but it must never discard or prevent saving a usable model
// response. The coach remains the final decision-maker.
export function advisorySessionQuality(quality) {
  const score = Number(quality?.score) || 0;
  const reviewRequired = quality?.valid === false || score < 85;
  return {
    ...(quality || {}),
    score,
    reviewRequired,
    blocking: false,
    reviewMessage: reviewRequired
      ? 'Автоматическая проверка рекомендует просмотреть отмеченные пункты; сохранение разрешено.'
      : '',
  };
}
