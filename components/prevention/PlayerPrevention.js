import PremiumSelect from '../PremiumSelect';
import { useEffect, useRef, useState } from 'react';
import { currentSession, orderedSets, progressCounts, nextRest } from '../../lib/prevention/model.mjs';
import Exercises, { timedExercise } from './Exercises';
import CourseGuidance from './CourseGuidance';
import PlayerExercises from './PlayerExercises';
import SetResultEditor from './SetResultEditor';
import { resultExerciseIdentity, sameResultExercise } from '../../lib/prevention/results.mjs';
import CoachOverlay from '../CoachOverlay';
import { ArrowDown, ArrowRight, Check, CheckCircle2, ChevronDown, History, Layers3, Pause, Play, Plus, RefreshCw, Shield, Timer, WifiOff, X } from 'lucide-react';
import { durationText, prescriptionText, exerciseElementId, blockElementId } from '../../lib/prevention/player-view.mjs';
import { preventionCall, newRequestId } from './api';
import styles from './Prevention.module.css';

export default function PlayerPrevention({ token }) {
  const [executionBusy, setExecutionBusy] = useState(false);
  const [assignments, setAssignments] = useState(null), [selectedId, setSelectedId] = useState(''), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const selectionKey = `gym:prevention:selected:v1:${token}`;
  function chooseAssignment(id) { setSelectedId(id); try { localStorage.setItem(selectionKey, id); } catch {} }
  useEffect(() => {
    const controller = new AbortController(); setError(''); setAssignments(null); setSelectedId('');
    preventionCall(`/api/player/prevention?token=${encodeURIComponent(token)}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      let remembered = ''; try { remembered = localStorage.getItem(selectionKey) || ''; } catch {}
      setAssignments(data.assignments); setSelectedId(previous => [previous, remembered].find(id => data.assignments.some(a => a.id === id)) || (data.assignments.find(a => a.status === 'active' && !a.courseId?.includes('daily')) || data.assignments.find(a => a.status === 'active'))?.id || data.assignments[0]?.id || '');
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [token, reload]);
  return <section className={`${styles.section} ${styles.player}`} aria-label="Профилактика игрока">
    <header className={styles.playerHeading}><div><p className={styles.eyebrow}>Назначено тренером</p><h2>Профилактика</h2></div><button type="button" className={styles.refreshButton} aria-label="Обновить назначения" disabled={executionBusy || !assignments && !error} onClick={() => setReload(n => n + 1)}><RefreshCw size={17} aria-hidden="true" /></button></header>
    {error && <div role="alert" className={styles.playerError}>{error}<button type="button" className={styles.button} onClick={() => setReload(n => n + 1)}>Повторить загрузку</button></div>}
    {!assignments && !error && <div className={styles.playerLoading} role="status"><span /><span /><p>Загрузка назначений…</p></div>}
    {assignments?.length === 0 && <section className={styles.playerEmpty}><span className={styles.emptyIcon}><Shield size={27} aria-hidden="true" /></span><h3>Твой курс появится здесь</h3><p>Тренер назначит профилактику отдельно от зала. Каждое занятие откроется после выполнения предыдущего.</p><button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => setReload(n => n + 1)}>Проверить назначения <RefreshCw size={15} aria-hidden="true" /></button></section>}
    {assignments?.length > 1 && <label className={styles.coursePicker}><span>Назначенные курсы</span><PremiumSelect title="Курс" value={selectedId} disabled={executionBusy} options={assignments.map(a => ({ value: a.id, label: a.title, sub: `${a.region || 'Поясница'} · ${a.options.scope === 'phase' ? `${a.phaseTerm || 'Фаза'} ${a.options.phaseLabel || a.options.phase}` : 'Весь курс'} · ${a.cursor}/${a.total}${a.status === 'completed' ? ' · завершён' : a.status === 'archived' ? ' · закрыт' : a.courseId?.includes('daily') ? ' · дополнительный комплекс' : ''}` }))} onChange={chooseAssignment} /></label>}
    {selectedId && <PlayerAssignment key={`${token}:${selectedId}`} token={token} id={selectedId} onBusyChange={setExecutionBusy} onChange={a => setAssignments(previous => previous?.map(old => old.id === a.id ? { ...old, cursor: a.cursor, status: a.status, revision: a.revision } : old))} />}
  </section>;
}

function PlayerAssignment({ token, id, onChange, onBusyChange }) {
  const [assignment, setAssignment] = useState(null), [safety, setSafety] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [pending, setPending] = useState(null);
  const [timer, setTimer] = useState(null), [timerReady, setTimerReady] = useState(''), [clock, setClock] = useState(Date.now()), [workSetup, setWorkSetup] = useState(null), [resultSet, setResultSet] = useState(null);
  const dock = useRef(null), lessonHeading = useRef(null), [dockHeight, setDockHeight] = useState(0);
  const alive = useRef(true), controller = useRef(null), mutationLock = useRef(false);
  const resultDraftKey = `gym:prevention:result-draft:v1:${token}:${id}`;
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
    try { const saved = JSON.parse(localStorage.getItem(pendingKey)); if (saved?.assignmentId === id && saved.token === token && ['mark', 'complete', 'result'].includes(saved.action)) { setPending(saved); setError('Есть неподтверждённое сохранение. Повторите его, чтобы сверить прогресс с сервером.'); } } catch {}
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
      if (!data.assignment || data.assignment.id !== id) throw new Error('Нет подтверждённой записи назначения.');
      setAssignment(data.assignment); onChange(data.assignment); setPending(null); try { localStorage.removeItem(pendingKey); } catch {}
      if (body.action === 'complete') { setTimeout(() => { if (alive.current) lessonHeading.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); }, 0); setTimer(null); setWorkSetup(null); setNotice(data.assignment.status === 'completed' ? 'Курс завершён. Все занятия сохранены.' : 'Занятие завершено. Следующее готово к выполнению.'); }
      else if ((body.action === 'mark' && body.done || body.action === 'result') && !previous?.progress?.[body.key] && body.sessionIndex === previous?.cursor && previous && previous.cursor === data.assignment.cursor && data.assignment.status === 'active') {
        const rest = progressCounts(data.assignment).done < progressCounts(data.assignment).total ? nextRest(previous, body.key) : null; setClock(Date.now()); setTimer(rest?.seconds > 0 ? { type: 'rest', ...rest, deadline: Date.now() + rest.seconds * 1000 } : null);
      } else if (body.action === 'mark') setTimer(null);
      return true;
    } catch (e) {
      if (!alive.current) return; setError(e.status ? e.message : 'Подтверждение сохранения не получено. Проверь соединение и повтори сохранение.');
      if (e.status && e.status < 500) { setPending(null); try { localStorage.removeItem(pendingKey); } catch {} if (e.status === 409) await load().catch(() => {}); }
      return false;
    } finally { mutationLock.current = false; if (alive.current) setBusy(false); }
  }
  const command = (action, extra = {}) => ({ token, assignmentId: id, requestId: newRequestId(), expectedRevision: assignment.revision, sessionIndex: assignment.cursor, action, ...extra });
  const mark = (key, done) => mutate(command('mark', { key, done }));
  const openResult = (key, index = assignment.cursor, timerActual = null) => {
    if (busy || pending) return;
    const row = orderedSets(assignment.sessions[index]).find(row => row.key === key);
    if (row) setResultSet({ key, index, exercise: row.exercise, round: row.round, timerActual });
  };
  const closeResult = () => { try { localStorage.removeItem(resultDraftKey); } catch {} setResultSet(null); };
  async function saveResult(result) { if (await mutate(command('result', { key: resultSet.key, sessionIndex: resultSet.index, result, expectedExercise: resultExerciseIdentity(resultSet.exercise) }))) closeResult(); }
  async function retryResult() { if (await mutate(pending)) closeResult(); }
  useEffect(() => {
    if (!assignment) return;
    try { const draft = JSON.parse(localStorage.getItem(resultDraftKey)); if (draft) {
      const row = orderedSets(assignment.sessions[draft.sessionIndex]).find(row => row.key === draft.key);
      const editable = assignment.status === 'active' && draft.sessionIndex === assignment.cursor || assignment.history.some(h => h.index === draft.sessionIndex && h.progress?.[draft.key]);
      if (row && editable && sameResultExercise(row.exercise, draft.expectedExercise)) setResultSet({ key: row.key, index: draft.sessionIndex, exercise: row.exercise, round: row.round });
      else if (row && editable) setNotice('Состав упражнения изменился. Незаписанные значения не перенесены в другое упражнение; открой подход заново.');
    } } catch {}
  }, [!!assignment]);
  const session = currentSession(assignment), count = assignment ? progressCounts(assignment) : { total: 0, done: 0 }, next = session && orderedSets(session).find(s => !assignment.progress[s.key]);
  const locked = busy || !!pending || !!safety?.hold;
  const domPrefix = `prevention-${id}-${assignment?.cursor || 0}`;
  useEffect(() => { onBusyChange(busy || !!resultSet); return () => onBusyChange(false); }, [busy, !!resultSet, onBusyChange]);
  useEffect(() => {
    const element = dock.current; if (!element) { setDockHeight(0); return; }
    const measure = () => setDockHeight(Math.ceil(element.getBoundingClientRect().height));
    measure(); const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, [!!session]);
  useEffect(() => {
    if (!workSetup) return; const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; };
  }, [!!workSetup]);
  const scrollTo = elementId => {
    const element = document.getElementById(elementId); if (!element) return;
    element.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); element.focus({ preventScroll: true });
  };

  function startWorkSetup(ex) {
    if (timer) { setNotice('Сначала закройте текущий таймер или завершите отдых.'); return; }
    const row = orderedSets(session).find(s => s.exercise.code === ex.code && !assignment.progress[s.key]);
    if (!row) { setNotice('Все подходы этого упражнения уже отмечены.'); return; }
    setWorkSetup({ ...timedExercise(ex), name: ex.name, key: row.key, seconds: timedExercise(ex).min });
  }
  function beginWork() {
    if (!workSetup || !Number.isInteger(workSetup.seconds) || workSetup.seconds < workSetup.min || workSetup.seconds > workSetup.max) return;
    setClock(Date.now()); setTimer({ type: 'work', seconds: workSetup.seconds, name: workSetup.name, key: workSetup.key, side: 1, sides: workSetup.sides, repeat: 1, repeats: workSetup.repeats,  deadline: Date.now() + workSetup.seconds * 1000 }); setWorkSetup(null);
  }
  const pauseTimer = () => { setClock(Date.now()); setTimer(t => t.deadline ? { ...t, deadline: null, remaining } : { ...t, deadline: Date.now() + t.remaining * 1000 }); };
  const canComplete = !!session && count.total > 0 && count.done === count.total;
  return <div className={styles.playerAssignment} style={{ paddingBottom: session ? dockHeight + 24 : 0 }}>
    {!session && pending && <button type="button" className={`${styles.button} ${styles.primary} ${styles.full}`} disabled={busy} onClick={() => mutate(pending)}>{busy ? 'Сохранение…' : 'Повторить сохранение'}</button>}
    {!session && error && <div className={styles.playerError} role="alert">{error}</div>}
    {notice && <div className={styles.playerNotice} role="status"><CheckCircle2 size={16} aria-hidden="true" /><span>{notice}</span></div>}
    {!assignment ? <div className={styles.playerLoading} role="status">Загрузка курса…{error && <button type="button" className={styles.button} onClick={() => load().catch(e => setError(e.message))}>Повторить загрузку</button>}</div> : <>
      <section className={styles.courseHero} aria-label="Текущий курс">
        <div className={styles.courseMeta}><span><Shield size={13} aria-hidden="true" />{assignment.region || 'Поясница'}</span><span>{assignment.courseId?.includes('daily') ? 'Дополнительный комплекс' : assignment.options.scope === 'phase' ? `${assignment.phaseTerm || 'Фаза'} ${assignment.options.phaseLabel || assignment.options.phase}` : 'Весь курс'}</span></div>
        <h3>{assignment.title}</h3>
        <div className={styles.courseProgressLabel}><span>Прогресс курса</span><strong>{assignment.cursor}<small> / {assignment.sessions.length}</small></strong></div>
        <div className={styles.progress} role="progressbar" aria-label="Прогресс курса" aria-valuemin="0" aria-valuemax={assignment.sessions.length} aria-valuenow={assignment.cursor}><div style={{ width: `${assignment.cursor / assignment.sessions.length * 100}%` }} /></div>
        <div className={styles.courseFootnote}><span><Layers3 size={12} aria-hidden="true" />По факту выполнения</span><span>Без расписания</span></div>
        {assignment.options.note && <div className={styles.coachNote}><span>От тренера</span><p>{assignment.options.note}</p></div>}
        <details className={styles.playerGuidance} open={!!safety?.hold}><summary><Shield size={14} aria-hidden="true" />Ограничения и указания<ChevronDown size={14} aria-hidden="true" /></summary><p>{assignment.warning}</p><p>{safety?.hold || safety?.detail}</p><CourseGuidance guidance={assignment.guidance} /></details>
        {safety?.hold && <p className={styles.playerHold} role="alert">{safety.hold}</p>}
        {!safety?.available && !safety?.hold && <p className={styles.sourceUnavailable}><WifiOff size={14} aria-hidden="true" /><span>Данные ReadySix недоступны. Уточни ограничения у тренера.</span></p>}
        {assignment.status !== 'active' && <div className={styles.courseFinished}><CheckCircle2 size={22} aria-hidden="true" /><div><strong>{assignment.status === 'completed' ? 'Курс завершён' : 'Назначение закрыто'}</strong><p>{assignment.status === 'completed' ? 'Все занятия выполнены и сохранены.' : 'Тренер закрыл курс. История выполнения сохранена.'}</p></div></div>}
      </section>
      {session && <section className={styles.playerSession} aria-label="Текущее занятие">
        <header className={styles.lessonHeading} ref={lessonHeading}><p className={styles.eyebrow}>{assignment.courseOnly ? `Комплекс ${session.phaseSession}/${session.phaseTotal}` : `${assignment.phaseTerm || 'Фаза'} ${session.phaseLabel || session.phase} · ${session.phaseSession}/${session.phaseTotal || 12}`}</p><h3>Занятие {assignment.cursor + 1} из {assignment.sessions.length}</h3><div className={styles.sessionFacts}><span>{session.exercises.length} упражнений</span><span>Подходы {count.done}/{count.total}</span></div></header>
        {assignment.phaseReviewNote && session.phaseSession === 1 && <details className={styles.phaseReminder}><summary>Перед первым занятием {assignment.courseOnly ? 'комплекса' : 'фазы'}<ChevronDown size={14} aria-hidden="true" /></summary><p>{assignment.phaseReviewNote}</p></details>}
        <nav className={styles.blockNavigation} aria-label="Блоки профилактики">{[...new Set(session.exercises.map(e => e.code[0]))].map(block => {
          const rows = orderedSets(session).filter(row => row.block === block), done = rows.filter(row => assignment.progress[row.key]).length;
          return <button type="button" key={block} aria-label={`Перейти к блоку ${block}: ${done} из ${rows.length} подходов`} aria-current={next?.block === block ? 'step' : undefined} data-complete={done === rows.length || undefined} onClick={() => scrollTo(blockElementId(domPrefix, block))}><span>{done === rows.length ? <Check size={14} aria-hidden="true" /> : block}</span><small>{done}/{rows.length}</small></button>;
        })}</nav>
        <PlayerExercises session={session} progress={assignment.progress} results={assignment.results} currentKey={next?.key || ''} busy={busy || !!pending} hold={!!safety?.hold} timerActive={!!timer} onOpenResult={openResult} onWorkTimer={startWorkSetup} idPrefix={domPrefix} />
      </section>}
      <details className={styles.playerHistory}><summary><History size={16} aria-hidden="true" /><span>История профилактики</span><small>{assignment.history.length}</small><ChevronDown size={15} aria-hidden="true" /></summary>{!assignment.history.length && <p className={styles.muted}>Здесь появятся выполненные занятия.</p>}{assignment.history.slice().reverse().map(h => <details key={h.index} className={styles.history}><summary>Занятие {h.index + 1} · {new Date(h.completedAt).toLocaleDateString('ru-RU')}</summary><Exercises session={assignment.sessions[h.index]} showResults progress={h.progress} results={h.results} onEditResult={key => openResult(key, h.index)} busy={busy || !!pending} /><p className={styles.source}>Завершено: {new Date(h.completedAt).toLocaleString('ru-RU')}</p></details>)}</details>
      {session && <aside ref={dock} className={styles.executionDock} aria-label="Управление профилактикой">
        {error && <div className={styles.dockError} role="alert">{error}</div>}
        {timer && <section className={styles.playerTimer} aria-label={timer.type === 'rest' ? 'Отдых' : 'Таймер выполнения'}>
          <div className={styles.timerHeading}><div><span className={styles.eyebrow}>{timer.type === 'rest' ? 'Отдых' : timer.type === 'side' ? 'Смена стороны' : 'Выполнение'}{!timer.deadline && ' · пауза'}</span><strong role="timer" aria-live="off">{durationText(remaining)}</strong></div><button type="button" className={styles.timerClose} aria-label={timer.type === 'rest' ? 'Закончить отдых' : 'Закрыть таймер'} onClick={() => setTimer(null)}><X size={18} aria-hidden="true" /></button></div>
          <p className={styles.timerContext}>{timer.type === 'rest' ? `Далее: ${timer.next}` : `${timer.name}${timer.repeats > 1 ? ` · удержание ${timer.repeat}/${timer.repeats}` : ''}${timer.sides === 2 ? ` · сторона ${timer.side}/2` : ''}`}</p>
          <div className={styles.timerActions}>{remaining > 0 && <button className={styles.button} type="button" onClick={pauseTimer}>{timer.deadline ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}{timer.deadline ? 'Пауза' : 'Продолжить'}</button>}{timer.type === 'rest' && <button className={styles.button} type="button" onClick={() => { setClock(Date.now()); setTimer(t => t.deadline ? { ...t, deadline: t.deadline + 15000 } : { ...t, remaining: t.remaining + 15 }); }}><Plus size={14} aria-hidden="true" />15 сек</button>}
            {timer.type === 'work' && remaining === 0 && (timer.repeat || 1) < (timer.repeats || 1) && <button className={`${styles.button} ${styles.primary}`} type="button" disabled={locked} onClick={() => { setClock(Date.now()); setTimer(t => ({ ...t, repeat: (t.repeat || 1) + 1, deadline: Date.now() + t.seconds * 1000 })); }}>Следующее удержание ({(timer.repeat || 1) + 1}/{timer.repeats})</button>}
            {timer.type === 'work' && remaining === 0 && (timer.repeat || 1) === (timer.repeats || 1) && timer.side < timer.sides && <button className={`${styles.button} ${styles.primary}`} type="button" disabled={locked} onClick={() => { const nextWork = { ...timer, side: timer.side + 1, repeat: 1, deadline: null }; const seconds = assignment.options.rests.side; setClock(Date.now()); setTimer(seconds > 0 ? { type: 'side', seconds, name: timer.name, deadline: Date.now() + seconds * 1000, nextWork } : { ...nextWork, deadline: Date.now() + nextWork.seconds * 1000 }); }}>Другая сторона <ArrowRight size={14} aria-hidden="true" /></button>}
            {timer.type === 'work' && remaining === 0 && (timer.repeat || 1) === (timer.repeats || 1) && timer.side === timer.sides && <button className={`${styles.button} ${styles.primary}`} type="button" disabled={locked || !!assignment.progress[timer.key]} onClick={() => openResult(timer.key, assignment.cursor, { seconds: timer.seconds, ...(timer.repeats > 1 ? { holds: timer.repeats } : {}) })}><Check size={16} aria-hidden="true" />Подход выполнен</button>}
          </div>
        </section>}
        <div className={styles.dockProgress}><span>{busy ? 'Сохраняем…' : pending ? 'Ожидает подтверждения' : canComplete ? 'Все подходы отмечены' : 'Подходы'}<strong>{count.done}<small>/{count.total}</small></strong></span><div className={styles.progress}><div style={{ width: `${count.total ? 100 * count.done / count.total : 0}%` }} /></div></div>
        {pending ? <button type="button" className={`${styles.button} ${styles.primary} ${styles.full}`} disabled={busy} onClick={() => mutate(pending)}>{busy ? 'Сохранение…' : 'Повторить сохранение'}</button> : safety?.hold ? <p className={styles.playerHold}>{safety.hold}</p> : canComplete ? <button type="button" className={`${styles.button} ${styles.primary} ${styles.full}`} disabled={locked} aria-label={`Завершить занятие${assignment.cursor + 1 < assignment.sessions.length ? ' и открыть следующее' : ''}`} onClick={() => mutate(command('complete'))}>Завершить занятие <CheckCircle2 size={18} aria-hidden="true" /></button> : !timer && next && <div className={styles.currentApproach}><p>{next.exercise.code} · {next.exercise.name}</p><strong>Подход {next.round + 1} из {next.exercise.setCount} · {prescriptionText(next.exercise.reps)}</strong><div className={styles.currentApproachActions}><button type="button" className={`${styles.button} ${styles.primary}`} disabled={locked} onClick={() => openResult(next.key)}><Check size={16} aria-hidden="true" />Подход выполнен</button>{timedExercise(next.exercise) && <button type="button" className={styles.timerClose} disabled={locked} aria-label={`Таймер: ${next.exercise.name}`} onClick={() => startWorkSetup(next.exercise)}><Timer size={18} aria-hidden="true" /></button>}<button type="button" className={styles.timerClose} aria-label="К текущему упражнению" onClick={() => scrollTo(exerciseElementId(domPrefix, next.exercise.code))}><ArrowDown size={18} aria-hidden="true" /></button></div></div>}

        {canComplete && !pending && <p className={styles.dockFootnote}>Следующее занятие откроется после подтверждения.</p>}
      </aside>}
      {resultSet && <SetResultEditor key={`${resultSet.index}:${resultSet.key}`} exercise={resultSet.exercise} round={resultSet.round} saved={resultSet.index === assignment.cursor ? assignment.results?.[resultSet.key] : assignment.history.find(h => h.index === resultSet.index)?.results?.[resultSet.key]} done={resultSet.index === assignment.cursor ? !!assignment.progress[resultSet.key] : true} timerActual={resultSet.timerActual} hold={!sameResultExercise(orderedSets(assignment.sessions[resultSet.index]).find(row => row.key === resultSet.key)?.exercise, resultExerciseIdentity(resultSet.exercise)) ? 'Состав упражнения изменился. Закрой окно и открой подход заново.' : resultSet.index === assignment.cursor && !assignment.progress[resultSet.key] ? safety?.hold : ''} draftKey={resultDraftKey} identity={{ sessionIndex: resultSet.index, key: resultSet.key, expectedExercise: resultExerciseIdentity(resultSet.exercise) }} busy={busy} pending={pending} error={error} onSave={saveResult} onRetry={retryResult} onUnmark={assignment.status === 'active' && resultSet.index === assignment.cursor ? async () => { if (await mark(resultSet.key, false)) closeResult(); } : null} onClose={closeResult} />}
      {workSetup && <CoachOverlay onClose={() => setWorkSetup(null)} locked={busy} aria-label="Настройка таймера" className={styles.playerSheetBackdrop}><section className={styles.playerSheet}><header><span className={styles.emptyIcon}><Timer size={22} aria-hidden="true" /></span><button type="button" className={styles.timerClose} aria-label="Закрыть настройку таймера" onClick={() => setWorkSetup(null)}><X size={18} aria-hidden="true" /></button></header><p className={styles.eyebrow}>Таймер выполнения</p><h3>{workSetup.name}</h3><p className={styles.muted}>{workSetup.min === workSetup.max ? `${workSetup.min} сек` : `${workSetup.min}–${workSetup.max} сек по PDF`}{workSetup.repeats > 1 ? ` · ${workSetup.repeats} отдельных удержаний` : ''}{workSetup.sides === 2 ? ' · на каждую сторону' : ''}</p><label className={styles.field}>Длительность · секунды<input type="number" inputMode="numeric" className={styles.input} min={workSetup.min} max={workSetup.max} value={workSetup.seconds} onChange={e => setWorkSetup({ ...workSetup, seconds: e.target.value === '' ? '' : Number(e.target.value) })} /></label><div className={styles.actions}><button type="button" className={`${styles.button} ${styles.primary} ${styles.full}`} disabled={locked || !Number.isInteger(workSetup.seconds) || workSetup.seconds < workSetup.min || workSetup.seconds > workSetup.max} onClick={beginWork}><Play size={16} aria-hidden="true" />Начать таймер</button><button type="button" className={`${styles.button} ${styles.full}`} onClick={() => setWorkSetup(null)}>Отмена</button></div></section></CoachOverlay>}
    </>}
  </div>;
}
