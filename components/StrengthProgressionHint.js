import {coachDate} from '../lib/coachPresentation.mjs';
import {progressionSummary} from '../lib/coachQuickWork.mjs';
export default function StrengthProgressionHint({proposal,error,loading,onRetry,onApply}) {
 if(error)return null;
 return <section className="coach-progression print:hidden" aria-label="Проверка силовой прогрессии" aria-busy={loading}>
  <div className="coach-progression-heading"><strong>Прогрессия</strong><button type="button" onClick={onRetry} disabled={loading} className="coach-recheck" title="Повторить проверку прогрессии">{loading?'Проверяю…':error?'Повторить проверку':'Перепроверить'}</button></div>
  <div role={error?'alert':'status'} aria-live="polite">
   {error?<p className="coach-progression-error">{error} Подсказка не применяется; вес подбирает тренер по RPE.</p>:loading?<p>Проверяю ReadySix и фактическое выполнение…</p>:proposal?<>
    {proposal.kg!=null && <p className="coach-progression-history">Выполнено: <strong>{proposal.kg} кг на снаряд</strong>{proposal.sourceDate?' · '+coachDate(proposal.sourceDate):''}{proposal.rpe!=null?' · RPE упражнения '+proposal.rpe:' · RPE упражнения не записан'}</p>}
    {proposal.sourceDate && <details><summary>Откуда взят рабочий вес · {coachDate(proposal.sourceDate)}</summary><p>{proposal.evidenceName || 'Точный вариант'} · кг {proposal.evidenceUnits===2?'каждого снаряда из пары':'одного снаряда'} · повторы {proposal.evidencePerSide===true?'суммарно с обеих сторон':'как записаны в журнале'}</p><ol>{(proposal.evidenceSets || []).map((set,index)=><li key={index}>Подход {index+1}: {set.kg ?? '—'} кг × {set.reps ?? '—'}</li>)}</ol><p>RPE упражнения: {proposal.rpe ?? 'не записан'}. Вес другой вариации не переносится.</p></details>}
    {progressionSummary(proposal)?<><p>{progressionSummary(proposal)}</p><details><summary>Обоснование прогрессии</summary><p>{proposal.decision}</p></details></>:<p>{proposal.decision}</p>}
    {proposal.suggestedKg!=null && <p className="coach-progression-proposal">Предложение: <strong>{proposal.suggestedKg} кг</strong>{proposal.targetSets?' · '+proposal.targetSets.join(' / '):''}</p>}
    {proposal.applicable && <button type="button" onClick={onApply} className="coach-progression-apply">Применить предложение генератора</button>}
   </>:<p>Нет актуальной подсказки. Запустите проверку; вес подбирает тренер по RPE.</p>}
  </div>
 </section>;
}
