import styles from './Prevention.module.css';
export const doseLabel = e => `${e.setCount || e.sets} × ${e.reps.replaceAll('sec lower', 'сек на опускание').replaceAll('sec', 'сек').replace(/each|ea/g, 'на сторону').replaceAll('-', '–')}${e.rir && e.rir !== '-' ? ` · RIR ${e.rir}` : ''}${e.rpe && e.rpe !== '-' ? ` · RPE ${e.rpe}` : ''}`;
export { timedExercise } from '../../lib/prevention/timing.mjs';
import { timedExercise } from '../../lib/prevention/timing.mjs';
export default function Exercises({ session, progress = {}, onMark, onWorkTimer, busy = false, currentKey = '', onEdit }) {
  return <div>{[...new Set((session?.exercises || []).map(e => e.code[0]))].map(block => {
    const exercises = session?.exercises?.filter(e => e.code[0] === block) || [];
    if (!exercises.length) return null;
    return <section className={styles.block} key={block}>
      <div className={styles.row}><h4>{block} · {session.blockLabels?.[block] || ({ A: 'Движение и контроль', B: 'Основной блок', C: 'Растяжка', D: 'Подвижность колена' })[block]}</h4><span className={styles.source}>{exercises.length > 1 ? 'По кругу' : 'Все подходы по порядку'}</span></div>
      {exercises.map(ex => <article key={ex.code} className={styles.exercise}>
        <div className={styles.exerciseTop}><span className={styles.code}>{ex.code}</span><div className="min-w-0 flex-1"><div className={styles.exerciseName}>{ex.name}</div><div className={styles.dose}>{doseLabel(ex)}</div>{session.restMode === 'source' && <p className={styles.source}>{ex.restSeconds != null ? `Пауза: ${ex.restSeconds} сек · PDF ${ex.rest}` : 'Пауза не задана в PDF · настройка тренера'}</p>}
          {onMark && <><div className={styles.sets}>{Array.from({ length: ex.setCount }, (_, round) => { const key = `${ex.code}:${round}`; return <button type="button" key={key} className={`${styles.set} ${currentKey === key ? styles.setCurrent : ''}`} aria-label={`${ex.name} · подход ${round + 1}${timedExercise(ex)?.sides === 2 || /each|ea\b/.test(ex.reps) ? ' на обе стороны' : ''}`} aria-pressed={!!progress[key]} disabled={busy} onClick={() => onMark(key, !progress[key])}>{progress[key] ? '✓ ' : ''}{round + 1}</button>; })}</div>{/each|ea\b/.test(ex.reps) && <p className={styles.source}>Отмечайте подход после выполнения обеих сторон.</p>}</>}
          <details className={styles.details}><summary>Техника и видео</summary><p>{ex.note || 'Подсказку уточнит тренер.'}</p>{ex.video ? <a className={styles.video} href={ex.video} target="_blank" rel="noopener noreferrer">Демонстрация ↗</a> : <p>Видео пока не добавлено тренером.</p>}<p className={styles.source}>Источник: стр. {session.sourcePage}{ex.originalName && ex.originalName !== ex.name ? ` · в PDF: ${ex.originalName}` : ''}</p></details>
          {onWorkTimer && timedExercise(ex) && <button type="button" className={styles.button} disabled={busy} onClick={() => onWorkTimer(ex)}>Таймер выполнения</button>}
          {onEdit && <button type="button" className={styles.libraryLink} onClick={() => onEdit(ex)}>Исправить название, подсказку или видео</button>}
        </div></div>
      </article>)}
    </section>;
  })}</div>;
}
