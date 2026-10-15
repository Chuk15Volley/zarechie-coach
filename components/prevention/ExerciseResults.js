import { resultLabel } from '../../lib/prevention/results.mjs';
import { prescriptionText } from '../../lib/prevention/player-view.mjs';
import styles from './Prevention.module.css';

export default function ExerciseResults({ exercise, progress = {}, results = {}, onEdit, busy }) {
  return <div className={styles.resultComparison} aria-label={`Результаты: ${exercise.name}`}>
    <div className={styles.resultColumns} aria-hidden="true"><span>Подход</span><span>План</span><span>Факт</span></div>
    {Array.from({ length: exercise.setCount }, (_, round) => {
      const key = `${exercise.code}:${round}`, done = progress[key] === true;
      return <div key={key} className={styles.resultColumns}><span>{round + 1}</span><span>{prescriptionText(exercise.reps)}</span><div>{done ? <><strong>{resultLabel(exercise, results[key])}</strong>{onEdit && <button type="button" disabled={busy} className={styles.textButton} aria-label={`Исправить результат: ${exercise.name}, подход ${round + 1}`} onClick={() => onEdit(key)}>Изменить</button>}</> : <span>Не выполнен</span>}</div></div>;
    })}
  </div>;
}
