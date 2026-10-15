import { Check, Timer, ChevronDown } from 'lucide-react';
import { timedExercise } from '../../lib/prevention/timing.mjs';
import { prescriptionText, exerciseView, exerciseElementId, blockElementId } from '../../lib/prevention/player-view.mjs';
import { resultLabel } from '../../lib/prevention/results.mjs';
import PlayerExerciseMedia from './PlayerExerciseMedia';
import styles from './Prevention.module.css';

export default function PlayerExercises({ session, progress, results = {}, currentKey, busy, hold, timerActive, onOpenResult, onWorkTimer, idPrefix }) {
  const blocks = [...new Set(session.exercises.map(e => e.code[0]))];
  return <div className={styles.playerExerciseList}>{blocks.map(block => {
    const exercises = session.exercises.filter(e => e.code[0] === block);
    return <section key={block} id={blockElementId(idPrefix, block)} tabIndex={-1} className={styles.playerBlock} aria-label={`Блок ${block}`}>
      <header className={styles.playerBlockHeading}><span>{block}</span><div><h4>{session.blockLabels?.[block] || `Блок ${block}`}</h4><p>{exercises.length > 1 ? 'По кругу · подходы по порядку' : 'Все подходы по порядку'}</p></div></header>
      {exercises.map(ex => {
        const view = exerciseView(ex, progress, currentKey), timed = timedExercise(ex);
        return <article key={ex.code} id={exerciseElementId(idPrefix, ex.code)} tabIndex={-1} aria-label={`${ex.code} · ${ex.name}`} className={`player-exercise-card ${styles.playerExercise}`} data-current={view.current || undefined} data-complete={view.complete || undefined}>
          <div className={styles.playerExerciseHeading}><span className={styles.playerCode}>{ex.code}</span><div><span className={styles.exerciseState}>{view.complete ? <><Check size={12} aria-hidden="true" />Выполнено</> : view.current ? 'Сейчас выполняем' : `${view.done} / ${view.total} подходов`}</span><h4>{ex.name}</h4></div></div>
          <PlayerExerciseMedia key={ex.name} exercise={ex} />
          <div className={styles.prescriptionGrid}><div><span>Подходы</span><strong>{ex.setCount}</strong></div><div><span>{timed ? 'Время' : 'Повторы'}</span><strong>{prescriptionText(ex.reps)}</strong></div>{ex.rir && ex.rir !== '-' && <div><span>RIR</span><strong>{prescriptionText(ex.rir)}</strong></div>}{ex.rpe && ex.rpe !== '-' && <div><span>RPE</span><strong>{prescriptionText(ex.rpe)}</strong></div>}</div>
          {ex.tempo && ex.tempo !== '-' && <p className={styles.playerSource}>Темп PDF: {ex.tempo}</p>}
          {session.restMode === 'source' && ex.restSeconds != null && <p className={styles.playerSource}>Пауза из PDF: {ex.restSeconds} сек</p>}
          {ex.sourceAdaptation && <p className={styles.adaptation}>Адаптация по запрету тренера: {ex.sourceAdaptation.original.name} → {ex.name}. Вариант из PDF, стр. {ex.sourceAdaptation.replacementSourcePage}.</p>}
          <div className={styles.setLabel}><span>Отметь выполненные подходы</span><span>{view.done}/{view.total}</span></div>
          <div className={styles.playerSets}>{Array.from({ length: ex.setCount }, (_, round) => {
            const key = `${ex.code}:${round}`, done = !!progress[key];
            return <div key={key} className={`gym-set ${done ? 'is-done' : ''} ${currentKey === key ? 'is-current' : ''}`}><button type="button" className={`gym-set-heading ${styles.playerSet}`} aria-label={`${ex.name} · подход ${round + 1}${view.bilateral ? ' на обе стороны' : ''}`} aria-pressed={done} title={done ? 'Изменить фактический результат' : 'Записать фактический результат'} disabled={busy || hold && !done} onClick={() => onOpenResult(key)}><span className="gym-set-caption">{done && <Check size={13} aria-hidden="true" />}Подход {round + 1} из {ex.setCount}</span><strong>{done ? `Факт: ${resultLabel(ex, results[key])}` : `Назначено: ${prescriptionText(ex.reps)}`}</strong><span>{done ? 'Изменить результат' : 'Записать результат'}</span></button></div>;
          })}</div>
          {view.bilateral && <p className={styles.sideHint}>Одна отметка — после обеих сторон.</p>}
          {timed && <div className={styles.exerciseTools}><button type="button" className={styles.exerciseTool} disabled={busy || hold || timerActive || view.complete} onClick={() => onWorkTimer(ex)}><Timer size={16} aria-hidden="true" />Таймер выполнения</button></div>}
          <details className={styles.playerTechnique}><summary>Как выполнять<ChevronDown size={15} aria-hidden="true" /></summary><p>{ex.note || 'Подсказку уточнит тренер.'}</p>{ex.originalDose && <p className={styles.playerSource}>Дозировка PDF: {ex.originalDose}</p>}{session.restMode === 'source' && <p className={styles.playerSource}>{ex.restSeconds != null ? `Исходная пауза: ${ex.rest}` : 'Пауза не задана в PDF · настройка тренера'}</p>}<p className={styles.playerSource}>Источник: стр. {session.sourcePage}{ex.originalName && ex.originalName !== ex.name ? ` · в PDF: ${ex.originalName}` : ''}</p></details>
        </article>;
      })}
    </section>;
  })}</div>;
}
