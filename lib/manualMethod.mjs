// Source complaints and medical evidence are retained; automatic budgets are not prescriptions.
export const MANUAL_METHOD_POLICY = `РУЧНОЙ ВЫБОР МЕТОДА — ПРИОРИТЕТ: генерируй по методике выбранного вида и режима тренировки. Автоматические статусы ReadySix, hard stop, процентные лимиты, Recovery/HRV/DOMS и рекомендации сменить тип НЕ ограничивают дозу и НЕ заменяют выбранный метод. Дозу задают методика и ручной статус тренера. Жалобы, острые травмы, противопоказания врача и запреты тренера сохраняются: адаптируй только затронутые двигательные задачи, не нагружай болезненную область через боль. Для здоровых областей сохраняй задачи выбранного метода. Не называй облегчённую региональную замену тяжёлой развивающей нагрузкой. Описания — два коротких точных предложения о технике; названия упражнений — английские.`;

export function manualMethodRecommendation(recommendation, manual) {
  if (!manual || !recommendation) return recommendation;
  return { ...recommendation, state: { ...recommendation.state, level:'green', hardStop:false, capPercent:100,
    targets:(recommendation.state?.targets || []).map(target=>({...target,capPercent:100,healthCapPercent:100,hardStopSignal:false})),
  } };
}
