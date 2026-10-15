import styles from './Prevention.module.css';
export const doseLabel = e => `${e.setCount || e.sets} × ${e.reps.replaceAll('sec', 'сек').replace(/each|ea/g, 'на сторону').replaceAll('-', '–')}${e.rir !== '-' ? ` · RIR ${e.rir}` : ''}`;
export function timedExercise(ex) { const match = /^(\d+)(?:-(\d+))? sec/.exec(ex.reps); return match ? { min: Number(match[1]), max: Number(match[2] || match[1]), sides: /each|ea\b/.test(ex.reps) ? 2 : 1 } : null; }
export default function Exercises({ session, progress = {}, onMark, onWorkTimer, busy = false, currentKey = '', onEdit }) {
  return <div>{['A', 'B', 'C'].map(block => {
    const exercises = session?.exercises?.filter(e => e.code[0] === block) || [];
    if (!exercises.length) return null;
    return <section className={styles.block} key={block}>
      <div className={styles.row}><h4>{block === 'A' ? 'A · Движение и контроль' : block === 'B' ? 'B · Основной блок' : 'C · Растяжка'}</h4><span className={styles.source}>По кругу</span></div>
      {exercises.map(ex => <article key={ex.code} className={styles.exercise}>
        <div className={styles.exerciseTop}><span className={styles.code}>{ex.code}</span><div className="min-w-0 flex-1"><div className={styles.exerciseName}>{ex.name}</div><div className={styles.dose}>{doseLabel(ex)}</div>
          {onMark && <><div className={styles.sets}>{Array.from({ length: ex.setCount }, (_, round) => { const key = `${ex.code}:${round}`; return <button type="button" key={key} className={`${styles.set} ${currentKey === key ? styles.setCurrent : ''}`} aria-label={`${ex.name} · подход ${round + 1}${timedExercise(ex)?.sides === 2 || /each|ea\b/.test(ex.reps) ? ' на обе стороны' : ''}`} aria-pressed={!!progress[key]} disabled={busy} onClick={() => onMark(key, !progress[key])}>{progress[key] ? '✓ ' : ''}{round + 1}</button>; })}</div>{/each|ea\b/.test(ex.reps) && <p className={styles.source}>Отмечайте подход после выполнения обеих сторон.</p>}</>}
          <details className={styles.details}><summary>Техника и видео</summary><p>{ex.note || 'Подсказку уточнит тренер.'}</p>{ex.video ? <a className={styles.video} href={ex.video} target="_blank" rel="noopener noreferrer">Демонстрация ↗</a> : <p>Видео пока не добавлено тренером.</p>}<p className={styles.source}>Источник: стр. {session.sourcePage}{ex.originalName && ex.originalName !== ex.name ? ` · в PDF: ${ex.originalName}` : ''}</p></details>
          {onWorkTimer && timedExercise(ex) && <button type="button" className={styles.button} disabled={busy} onClick={() => onWorkTimer(ex)}>Таймер выполнения</button>}
          {onEdit && <button type="button" className={styles.libraryLink} onClick={() => onEdit(ex)}>Исправить название, подсказку или видео</button>}
        </div></div>
      </article>)}
    </section>;
  })}</div>;
}
