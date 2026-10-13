export default function StrengthProgressionHint({proposal,error,loading,onRetry,onApply}) {
 return <section className="coach-progression print:hidden" aria-label="Проверка силовой прогрессии" aria-busy={loading}>
  <div className="coach-progression-heading"><strong>Прогрессия</strong><button type="button" onClick={onRetry} disabled={loading} className="coach-recheck">{loading?'Проверяю…':error?'Повторить проверку прогрессии':'Проверить прогрессию заново'}</button></div>
  <div role={error?'alert':'status'} aria-live="polite">
   {error?<p className="coach-progression-error">{error} Подсказка не применяется; вес подбирает тренер по RPE.</p>:loading?<p>Проверяю ReadySix и фактическое выполнение…</p>:proposal?<>
    {proposal.kg!=null && <p className="coach-progression-history">Выполнено: <strong>{proposal.kg} кг на снаряд</strong>{proposal.sourceDate?' · '+proposal.sourceDate:''}{proposal.rpe!=null?' · RPE упражнения '+proposal.rpe:' · RPE упражнения не записан'}</p>}
    <p>{proposal.decision}</p>
    {proposal.suggestedKg!=null && <p className="coach-progression-proposal">Предложение: <strong>{proposal.suggestedKg} кг</strong>{proposal.targetSets?' · '+proposal.targetSets.join(' / '):''}</p>}
    {proposal.applicable && <button type="button" onClick={onApply} className="coach-progression-apply">Применить предложение генератора</button>}
   </>:<p>Нет актуальной подсказки. Запустите проверку; вес подбирает тренер по RPE.</p>}
  </div>
 </section>;
}
