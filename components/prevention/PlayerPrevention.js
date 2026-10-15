import { useEffect, useRef, useState } from 'react';
import { currentSession, orderedSets, progressCounts, nextRest } from '../../lib/prevention/model.mjs';
import Exercises, { timedExercise } from './Exercises';
import CourseGuidance from './CourseGuidance';
import { preventionCall, newRequestId } from './api';
import styles from './Prevention.module.css';

export default function PlayerPrevention({ token }) {
  const [assignments, setAssignments] = useState(null), [selectedId, setSelectedId] = useState(''), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const selectionKey = `gym:prevention:selected:v1:${token}`;
  function chooseAssignment(id) { setSelectedId(id); try { localStorage.setItem(selectionKey, id); } catch {} }
  useEffect(() => {
    const controller = new AbortController(); setError(''); setAssignments(null); setSelectedId('');
    preventionCall(`/api/player/prevention?token=${encodeURIComponent(token)}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      let remembered = ''; try { remembered = localStorage.getItem(selectionKey) || ''; } catch {}
      setAssignments(data.assignments); setSelectedId(previous => [previous, remembered].find(id => data.assignments.some(a => a.id === id)) || data.assignments.find(a => a.status === 'active')?.id || data.assignments[0]?.id || '');
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [token, reload]);
  return <main className={`${styles.section} ${styles.player}`} aria-label="Профилактика игрока">
    <header className={styles.heading}><div><p className={styles.eyebrow}>Твои курсы</p><h2>Профилактика</h2>{assignments?.length > 0 && <p>Выполняй по порядку, в согласованное с тренером время.</p>}</div></header>
    {error && <div role="alert" className={styles.error}>{error}<button type="button" className={styles.button} onClick={() => setReload(n => n + 1)}>Повторить загрузку</button></div>}
    {!assignments && !error && <p className={styles.loading}>Загрузка назначений…</p>}
    {assignments?.length === 0 && <section className={styles.card}><h3>Пока нет назначений</h3><p className={styles.muted}>Когда тренер назначит курс профилактики, он появится здесь отдельно от тренировок зала.</p><button type="button" className={styles.button} onClick={() => setReload(n => n + 1)}>Проверить назначения</button></section>}
    {assignments?.length > 1 && <label className={`${styles.field} mb-4`}>Курс<select className={styles.select} value={selectedId} onChange={e => chooseAssignment(e.target.value)}>{assignments.map(a => <option key={a.id} value={a.id}>{a.region || 'Поясница'} · {a.title} · {a.options.scope === 'phase' ? `фаза ${a.options.phaseLabel || a.options.phase}` : 'весь курс'} · {a.cursor}/{a.total}{a.status === 'completed' ? ' · завершён' : a.status === 'archived' ? ' · закрыт' : ''}</option>)}</select></label>}
    {selectedId && <PlayerAssignment key={`${token}:${selectedId}`} token={token} id={selectedId} onChange={a => setAssignments(previous => previous?.map(old => old.id === a.id ? { ...old, cursor: a.cursor, status: a.status, revision: a.revision } : old))} />}
  </main>;
}
function PlayerAssignment({ token, id, onChange }) {
  const [assignment, setAssignment] = useState(null), [safety, setSafety] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [pending, setPending] = useState(null);
  const [timer, setTimer] = useState(null), [timerReady, setTimerReady] = useState(''), [clock, setClock] = useState(Date.now()), [workSetup, setWorkSetup] = useState(null);
  const alive = useRef(true), controller = useRef(null), mutationLock = useRef(false);
  const pendingKey = `gym:prevention:pending:v1:${token}:${id}`, timerKey = assignment ? `gym:prevention:timer:v1:${token}:${id}:${assignment.cursor}` : '';
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  async function load() {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    const data = await preventionCall(`/api/player/prevention?token=${encodeURIComponent(token)}&assignmentId=${id}`, { signal: request.signal });
    if (!request.signal.aborted && alive.current) { setAssignment(data.assignment); setSafety(data.safety); onChange(data.assignment); }
    return data;
  }
  useEffect(() => {
    load().catch(e => { if (alive.current && e.name !== 'AbortError') setError(e.message); });
    try { const saved = JSON.parse(localStorage.getItem(pendingKey)); if (saved?.assignmentId === id && saved.token === token && ['mark', 'complete'].includes(saved.action)) { setPending(saved); setError('Есть неподтверждённое сохранение. Повторите его, чтобы сверить прогресс с сервером.'); } } catch {}
    return () => controller.current?.abort();
  }, [token, id]);
  useEffect(() => {
    if (!timerKey) return; setTimer(null); setClock(Date.now());
    try { const saved = JSON.parse(localStorage.getItem(timerKey)); if (saved && ['rest', 'work', 'side'].includes(saved.type) && Number.isFinite(saved.seconds) && saved.seconds > 0 && saved.seconds <= 600 && (saved.deadline === null || Number.isFinite(saved.deadline))) setTimer(saved); } catch {}
    setTimerReady(timerKey);
  }, [timerKey]);
  useEffect(() => { if (!timerKey || timerReady !== timerKey) return; try { if (timer) localStorage.setItem(timerKey, JSON.stringify(timer)); else localStorage.removeItem(timerKey); } catch {} }, [timer, timerKey, timerReady]);
  useEffect(() => { if (!timer?.deadline) return; const tick = () => setClock(Date.now()); tick(); const interval = setInterval(tick, 400); document.addEventListener('visibilitychange', tick); return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); }; }, [timer?.deadline]);
  const remaining = timer ? timer.deadline ? Math.max(0, Math.ceil((timer.deadline - clock) / 1000)) : timer.remaining : 0;
  useEffect(() => {
    if (!timer?.deadline || remaining > 0) return;
    if (timer.type === 'rest') setTimer(null);
    else if (timer.type === 'side') { setClock(Date.now()); setTimer({ ...timer.nextWork, deadline: Date.now() + timer.nextWork.seconds * 1000 }); }
  }, [remaining, timer]);
  async function mutate(body) {
    if (mutationLock.current) return; mutationLock.current = true; setBusy(true); setError(''); setNotice(''); setPending(body);
    try { localStorage.setItem(pendingKey, JSON.stringify(body)); } catch {}
    const previous = assignment;
    try {
      const data = await preventionCall('/api/player/prevention', { body }); if (!alive.current) return;
      setAssignment(data.assignment); onChange(data.assignment); setPending(null); try { localStorage.removeItem(pendingKey); } catch {}
      if (body.action === 'complete') { setTimer(null); setWorkSetup(null); setNotice(data.assignment.status === 'completed' ? 'Курс завершён. Все занятия сохранены.' : 'Занятие завершено. Следующее готово к выполнению.'); }
      else if (body.done && previous && previous.cursor === data.assignment.cursor && data.assignment.status === 'active' && progressCounts(data.assignment).done < progressCounts(data.assignment).total) {
        const rest = nextRest(previous, body.key); setClock(Date.now()); setTimer(rest?.seconds > 0 ? { type: 'rest', ...rest, deadline: Date.now() + rest.seconds * 1000 } : null);
      } else setTimer(null);
    } catch (e) {
      if (!alive.current) return; setError(e.message);
      if (e.status && e.status < 500) { setPending(null); try { localStorage.removeItem(pendingKey); } catch {} if (e.status === 409) await load().catch(() => {}); }
    } finally { mutationLock.current = false; if (alive.current) setBusy(false); }
  }
  const command = (action, extra = {}) => ({ token, assignmentId: id, requestId: newRequestId(), expectedRevision: assignment.revision, sessionIndex: assignment.cursor, action, ...extra });
  const mark = (key, done) => mutate(command('mark', { key, done }));
  const session = currentSession(assignment), count = assignment ? progressCounts(assignment) : { total: 0, done: 0 }, next = session && orderedSets(session).find(s => !assignment.progress[s.key]);
  const locked = busy || !!pending || !!safety?.hold;
  function startWorkSetup(ex) {
    const row = orderedSets(session).find(s => s.exercise.code === ex.code && !assignment.progress[s.key]);
    if (!row) { setNotice('Все подходы этого упражнения уже отмечены.'); return; }
    setWorkSetup({ ...timedExercise(ex), name: ex.name, key: row.key, seconds: timedExercise(ex).min });
  }
  function beginWork() {
    if (!workSetup || !Number.isInteger(workSetup.seconds) || workSetup.seconds < workSetup.min || workSetup.seconds > workSetup.max) return;
    setClock(Date.now()); setTimer({ type: 'work', seconds: workSetup.seconds, name: workSetup.name, key: workSetup.key, side: 1, sides: workSetup.sides, repeat: 1, repeats: workSetup.repeats,  deadline: Date.now() + workSetup.seconds * 1000 }); setWorkSetup(null);
  }
  const pauseTimer = () => { setClock(Date.now()); setTimer(t => t.deadline ? { ...t, deadline: null, remaining } : { ...t, deadline: Date.now() + t.remaining * 1000 }); };
  return <>
    {error && <div className={styles.error} role="alert">{error}</div>}{notice && <div className={styles.success} role="status">{notice}</div>}
    {pending && <div className={styles.actions}><button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={() => mutate(pending)}>{busy ? 'Сохранение…' : 'Повторить сохранение'}</button></div>}
    {!assignment ? <div className={styles.loading}>Загрузка курса…{error && <button type="button" className={styles.button} onClick={() => load().catch(e => setError(e.message))}>Повторить загрузку</button>}</div> : <>
      <section className={styles.card}>
        <div className={styles.row}><span className={styles.badge}>{assignment.region || 'Поясница'}</span><span className={styles.source}>{assignment.options.scope === 'phase' ? `Фаза ${assignment.options.phaseLabel || assignment.options.phase}` : 'Весь курс'}</span></div>
        <h3 className="mt-3">{assignment.title}</h3><p className={styles.muted}>Завершено {assignment.cursor} из {assignment.sessions.length} занятий</p>
        <div className={styles.progress} role="progressbar" aria-label="Прогресс курса" aria-valuemin="0" aria-valuemax={assignment.sessions.length} aria-valuenow={assignment.cursor}><div style={{ width: `${assignment.cursor / assignment.sessions.length * 100}%` }} /></div>
        {assignment.options.note && <p className={styles.notice}>Тренер: {assignment.options.note}</p>}
        <details className={styles.details} open={!!safety?.hold}><summary>Ограничения и указания</summary><p>{assignment.warning}</p><p>{safety?.hold || safety?.detail}</p></details>
        <CourseGuidance guidance={assignment.guidance} />
        {assignment.status !== 'active' && <p className={styles.success}>{assignment.status === 'completed' ? 'Курс полностью выполнен.' : 'Назначение закрыто тренером. История сохранена.'}</p>}
      </section>
      {session && <section className={styles.card}>
        <div className={styles.row}><h3>Занятие {assignment.cursor + 1} из {assignment.sessions.length}</h3><span className={styles.badge}>Фаза {session.phaseLabel || session.phase} · {session.phaseSession}/{session.phaseTotal || 12}</span></div>
        {assignment.phaseReviewNote && session.phaseSession === 1 && <p className={styles.notice}>{assignment.phaseReviewNote}</p>}
        <p className={styles.muted}>{count.done} из {count.total} подходов · блоки по порядку, упражнения внутри блока — по кругу</p>
        {next && <p className={styles.notice}>Далее: {next.exercise.code} · {next.exercise.name} · подход {next.round + 1}</p>}
        {timer && <section className={styles.timer} aria-label={timer.type === 'rest' ? 'Отдых' : 'Таймер выполнения'}><div className={styles.row}><strong role="timer" aria-live="off">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</strong><span className={styles.timerCount}>{timer.type === 'rest' ? timer.kind : timer.type === 'side' ? 'Смена стороны' : `Выполнение${timer.repeats > 1 ? ` · удержание ${timer.repeat}/${timer.repeats}` : ''}${timer.sides === 2 ? ` · сторона ${timer.side}/2` : ''}`}{!timer.deadline && ' · пауза'}</span></div><p>{timer.type === 'rest' ? `Далее: ${timer.next}` : timer.name}</p>
          <div className={styles.actions}>{remaining > 0 && <button className={styles.button} type="button" onClick={pauseTimer}>{timer.deadline ? 'Пауза' : 'Продолжить'}</button>}{timer.type === 'rest' && <button className={styles.button} type="button" onClick={() => { setClock(Date.now()); setTimer(t => t.deadline ? { ...t, deadline: t.deadline + 15000 } : { ...t, remaining: t.remaining + 15 }); }}>+15 сек</button>}
            {timer.type === 'work' && remaining === 0 && (timer.repeat || 1) < (timer.repeats || 1) && <button className={`${styles.button} ${styles.primary}`} type="button" disabled={locked} onClick={() => { setClock(Date.now()); setTimer(t => ({ ...t, repeat: (t.repeat || 1) + 1, deadline: Date.now() + t.seconds * 1000 })); }}>Следующее удержание ({(timer.repeat || 1) + 1}/{timer.repeats})</button>}
            {timer.type === 'work' && remaining === 0 && (timer.repeat || 1) === (timer.repeats || 1) && timer.side < timer.sides && <button className={`${styles.button} ${styles.primary}`} type="button" onClick={() => { const nextWork = { ...timer, side: timer.side + 1, repeat: 1, deadline: null }; const seconds = assignment.options.rests.side; setClock(Date.now()); setTimer(seconds > 0 ? { type: 'side', seconds, name: timer.name, deadline: Date.now() + seconds * 1000, nextWork } : { ...nextWork, deadline: Date.now() + nextWork.seconds * 1000 }); }}>Другая сторона</button>}
            {timer.type === 'work' && remaining === 0 && (timer.repeat || 1) === (timer.repeats || 1) && timer.side === timer.sides && <button className={`${styles.button} ${styles.primary}`} type="button" disabled={locked || !!assignment.progress[timer.key]} onClick={() => mark(timer.key, true)}>Подход выполнен</button>}
            <button className={styles.button} type="button" onClick={() => setTimer(null)}>{timer.type === 'rest' ? 'Закончить отдых' : 'Закрыть таймер'}</button>
          </div>
        </section>}
        {workSetup && <section className={styles.timer} aria-label="Настройка таймера"><label className={styles.field}>{workSetup.name} · {workSetup.min === workSetup.max ? `${workSetup.min} сек` : `${workSetup.min}–${workSetup.max} сек по PDF`}{workSetup.repeats > 1 ? ` · ${workSetup.repeats} отдельных удержаний` : ''}<input type="number" className={styles.input} min={workSetup.min} max={workSetup.max} value={workSetup.seconds} onChange={e => setWorkSetup({ ...workSetup, seconds: e.target.value === '' ? '' : Number(e.target.value) })} /></label><div className={styles.actions}><button type="button" className={`${styles.button} ${styles.primary}`} disabled={locked || !Number.isInteger(workSetup.seconds) || workSetup.seconds < workSetup.min || workSetup.seconds > workSetup.max} onClick={beginWork}>Начать таймер</button><button type="button" className={styles.button} onClick={() => setWorkSetup(null)}>Отмена</button></div></section>}
        <Exercises session={session} progress={assignment.progress} currentKey={next?.key} busy={locked} onMark={mark} onWorkTimer={startWorkSetup} />
        <div className={styles.actions}><button type="button" className={`${styles.button} ${styles.primary} ${styles.full}`} disabled={locked || count.done !== count.total || !count.total} onClick={() => mutate(command('complete'))}>Завершить занятие{assignment.cursor + 1 < assignment.sessions.length ? ' и открыть следующее' : ''}</button></div>
        <p className={styles.notice}>Отметки сохраняются на сервере. Частичное выполнение остаётся в текущем занятии; переход требует подтверждения завершения.</p>
      </section>}
      <section className={styles.card}><h3>История профилактики</h3>{!assignment.history.length && <p className={styles.muted}>Здесь появятся выполненные занятия.</p>}{assignment.history.slice().reverse().map(h => <details key={h.index} className={styles.history}><summary>Занятие {h.index + 1} · {new Date(h.completedAt).toLocaleDateString('ru-RU')}</summary><Exercises session={assignment.sessions[h.index]} /><p className={styles.source}>Завершено: {new Date(h.completedAt).toLocaleString('ru-RU')}</p></details>)}</section>
    </>}
  </>;
}
