import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import CoachOverlay from '../CoachOverlay';
import { resultFields, resultWeightLabel, normalizeSetResult, sameResultExercise } from '../../lib/prevention/results.mjs';
import { prescriptionText } from '../../lib/prevention/player-view.mjs';
import styles from './Prevention.module.css';

export default function SetResultEditor({ exercise, round, saved, done, timerActual, draftKey, identity, busy, pending, error, hold, onSave, onRetry, onUnmark, onClose }) {
  const fields = resultFields(exercise);
  const initial = () => {
    try { const draft = JSON.parse(localStorage.getItem(draftKey)); if (draft?.sessionIndex === identity.sessionIndex && draft.key === identity.key && sameResultExercise(exercise, draft.expectedExercise) && ['count', 'holds', 'kg'].every(key => typeof draft.values?.[key] === 'string' && draft.values[key].length <= 24)) return { ...draft.values, restored: true }; } catch {}
    return { count: String(saved?.[fields.timed ? 'seconds' : 'reps'] ?? timerActual?.seconds ?? ''), holds: String(saved?.holds ?? timerActual?.holds ?? ''), kg: saved?.weightKg == null ? '' : String(saved.weightKg).replace('.', ',') };
  };
  const [values, setValues] = useState(initial), [issue, setIssue] = useState('');
  useEffect(() => {
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify({ ...identity, values })); } catch {} }, []);
  function change(field, value) {
    const next = { ...values, [field]: value }; setValues(next); setIssue('');
    try { localStorage.setItem(draftKey, JSON.stringify({ ...identity, values: next })); } catch {}
  }
  const numeric = (text, decimal = false) => (decimal ? /^\d{1,3}(?:[.,]\d{1,2})?$/ : /^\d+$/).test(String(text).trim()) ? Number(String(text).trim().replace(',', '.')) : NaN;
  let result, validation = '';
  try { result = normalizeSetResult(exercise, { [fields.timed ? 'seconds' : 'reps']: numeric(values.count), ...(fields.repeated ? { holds: numeric(values.holds) } : {}), ...(values.kg.trim() ? { weightKg: numeric(values.kg, true) } : {}) }); } catch (e) { validation = e.message; }
  const unchanged = done && saved && result && JSON.stringify(result) === JSON.stringify(Object.fromEntries(Object.entries(saved).filter(([key]) => key !== 'updatedAt')));
  const locked = busy || !!pending;
  return <CoachOverlay aria-label="Фактический результат" onClose={onClose} locked={locked} className={styles.playerSheetBackdrop}><section className={`${styles.playerSheet} ${styles.resultSheet}`}>
    <header><div><p className={styles.eyebrow}>Фактический результат</p><h3>{exercise.name}</h3></div><button type="button" className={styles.timerClose} aria-label="Закрыть ввод результата" disabled={locked} onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    <p className={styles.muted}>Подход {round + 1} из {exercise.setCount} · назначено {prescriptionText(exercise.reps)}</p>
    {values.restored && <p className={styles.playerSource} role="status">Восстановлен незаписанный результат. Проверь значения перед сохранением.</p>}
    <form noValidate onSubmit={event => { event.preventDefault(); if (locked || hold || unchanged) return; if (validation) { setIssue(validation); return; } onSave(result); }}>
      <div className={styles.resultInputs}>
        <label className={styles.field}>{fields.timed ? `Фактическое время${fields.repeated ? ' одного удержания' : ''}${fields.bilateral ? ' / сторону' : ''}, сек` : `Фактические повторы${fields.bilateral ? ' / сторону' : ''}`}<input maxLength={12} autoComplete="off" inputMode="numeric" className={styles.input} value={values.count} disabled={locked} placeholder="—" onChange={e => change('count', e.target.value)} /></label>
        {fields.repeated && <label className={styles.field}>Фактическое число удержаний{fields.bilateral ? ' / сторону' : ''}<input maxLength={12} autoComplete="off" inputMode="numeric" className={styles.input} value={values.holds} disabled={locked} placeholder="—" onChange={e => change('holds', e.target.value)} /></label>}
        <label className={styles.field}>{resultWeightLabel(exercise)}{!fields.weightRequired && ' · необязательно'}<input maxLength={12} autoComplete="off" inputMode="decimal" className={styles.input} value={values.kg} disabled={locked} placeholder="—" onChange={e => change('kg', e.target.value)} /></label>
      </div>
      <button type="button" className={styles.textButton} disabled={locked} onClick={() => change('kg', '0')}>Без дополнительного веса · 0 кг</button>
      {fields.bilateral && <p className={styles.playerSource}>Значения на одну сторону. Сохраняй подход после выполнения обеих сторон.</p>}
      <p className={styles.playerSource}>Записывай выполненное. Значения могут отличаться от плана; это не меняет назначенную дозировку.</p>
      {(issue || error || hold) && <p className={styles.playerError} role="alert">{error || issue || hold}</p>}
      {pending ? <button type="button" className={`${styles.button} ${styles.primary} ${styles.full}`} disabled={busy} onClick={onRetry}>{busy ? 'Сохранение…' : 'Повторить сохранение'}</button> : <div className={styles.resultActions}><button type="button" className={styles.button} disabled={busy} onClick={onClose}>Отмена</button><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy || unchanged || !!hold}>{busy ? 'Сохранение…' : done ? 'Сохранить изменения' : 'Сохранить подход'}</button></div>}
      {done && onUnmark && <button type="button" className={styles.textButton} disabled={locked} onClick={onUnmark}>Снять отметку и удалить факт подхода</button>}
    </form>
  </section></CoachOverlay>;
}
