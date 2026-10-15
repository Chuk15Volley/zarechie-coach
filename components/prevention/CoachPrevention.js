import { useEffect, useRef, useState } from 'react';
import { DEFAULT_RESTS } from '../../lib/prevention/model.mjs';
import Exercises from './Exercises';
import RestFields from './RestFields';
import { preventionCall, newRequestId } from './api';
import styles from './Prevention.module.css';

export default function CoachPrevention({ workspace, players = [], initialPlayerId = '', apiKey }) {
  const [course, setCourse] = useState(null), [playerId, setPlayerId] = useState(initialPlayerId), [assignments, setAssignments] = useState([]), [safety, setSafety] = useState(null);
  const [scope, setScope] = useState('phase'), [phase, setPhase] = useState(1), [previewIndex, setPreviewIndex] = useState(0), [stretch, setStretch] = useState(false), [mainSets, setMainSets] = useState(2), [stretchSets, setStretchSets] = useState(2), [rests, setRests] = useState(DEFAULT_RESTS), [note, setNote] = useState(''), [reviewed, setReviewed] = useState(false);
  const [tab, setTab] = useState('assign'), [editor, setEditor] = useState(null), [patch, setPatch] = useState(null), [detail, setDetail] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [reload, setReload] = useState(0), [pending, setPending] = useState(null);
  const alive = useRef(true), detailEpoch = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; detailEpoch.current += 1; }; }, []);
  useEffect(() => { if (initialPlayerId) setPlayerId(initialPlayerId); }, [initialPlayerId]);
  useEffect(() => { if (editor) document.getElementById('prevention-exercise-editor')?.scrollIntoView({ block: 'center', behavior: 'instant' }); }, [editor]);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    preventionCall(`/api/prevention/catalogue?workspace=${workspace}`, { apiKey, signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setCourse(data.course); setRests(data.course.rests); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [workspace, apiKey, reload]);
  useEffect(() => {
    const controller = new AbortController(); setAssignments([]); setSafety(null); setDetail(null); detailEpoch.current += 1;
    if (playerId) preventionCall(`/api/prevention/assignments?workspace=${workspace}&playerId=${encodeURIComponent(playerId)}`, { apiKey, signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setAssignments(data.assignments); setSafety(data.safety); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [workspace, playerId, apiKey, reload]);
  const base = { workspace, playerId }, locked = busy || !!pending;
  const sourceSessions = course?.sessions.filter(s => scope === 'course' || s.phase === phase) || [];
  const selected = sourceSessions[Math.min(previewIndex, sourceSessions.length - 1)];
  const preview = selected && { ...selected, exercises: selected.exercises.filter(e => stretch || e.code[0] !== 'C').map(e => ({ ...e, setCount: e.code[0] === 'A' ? 2 : e.code[0] === 'B' ? mainSets : stretchSets })) };
  const selectedPlayer = players.find(p => String(p.id) === playerId);
  const updateOptions = action => { action(); setReviewed(false); setNotice(''); };
  async function submitAssignment(retry = false) {
    if (busy || !course || !playerId) return;
    const body = retry ? pending : { ...base, action: 'assign', requestId: newRequestId(), expectedCatalogueRevision: course.revision, scope, phase, stretch, mainSets, stretchSets, rests, note, reviewed };
    setPending(body); setBusy(true); setError(''); setNotice('');
    try {
      const data = await preventionCall('/api/prevention/assignments', { body, apiKey });
      if (!alive.current) return;
      setPending(null); setDetail(data.assignment); setAssignments(previous => [{ ...data.assignment, total: data.assignment.sessions.length }, ...previous.filter(a => a.id !== data.assignment.id)]); setNotice('Назначение сохранено. Игрок начинает с первого занятия и продвигается только после полного выполнения.'); setReviewed(false);
    } catch (e) { if (alive.current) { setError(e.message); if (e.status && e.status < 500) setPending(null); } } finally { if (alive.current) setBusy(false); }
  }
  async function openAssignment(id) {
    const epoch = ++detailEpoch.current; setError('');
    try { const data = await preventionCall(`/api/prevention/assignments?workspace=${workspace}&playerId=${encodeURIComponent(playerId)}&assignmentId=${id}`, { apiKey }); if (alive.current && epoch === detailEpoch.current) setDetail(data.assignment); } catch (e) { if (alive.current && epoch === detailEpoch.current) setError(e.message); }
  }
  async function changeAssignment(action) {
    if (!detail || busy) return; setBusy(true); setError('');
    try { const data = await preventionCall('/api/prevention/assignments', { apiKey, body: { ...base, assignmentId: detail.id, expectedRevision: detail.revision, action } }); if (alive.current) { setDetail(data.assignment); setReload(n => n + 1); setNotice(action === 'archive' ? 'Назначение закрыто. История выполнения сохранена.' : 'Обновлены будущие занятия. Завершённые занятия и начатое занятие сохранены в своей версии.'); } } catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setBusy(false); }
  }
  async function savePatch() {
    if (!editor || busy) return; setBusy(true); setError('');
    try { const data = await preventionCall('/api/prevention/catalogue', { apiKey, body: { workspace, expectedRevision: course.revision, sourceId: editor.sourceId, patch } }); if (alive.current) { setCourse(data.course); setEditor(null); setPatch(null); setReviewed(false); setNotice('Правка сохранена в библиотеке этого пространства. Для существующего назначения нажмите «Обновить будущие занятия».'); } } catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setBusy(false); }
  }
  const editExercise = ex => { setEditor(ex); setPatch({ name: ex.name, video: ex.video || '', note: ex.note || '' }); setError(''); };
  return <section className={styles.section} aria-label="Профилактика тренера">
    <header className={styles.heading}><div><p className={styles.eyebrow}>Отдельные курсы · {workspace === 'nkperf' ? 'NK Pro' : 'Заречье'}</p><h2>Профилактика</h2><p>Следующее занятие открывается после выполнения предыдущего.</p></div><button type="button" className={styles.button} disabled={locked || !!editor} onClick={() => { setError(''); setReload(n => n + 1); }}>Обновить раздел</button></header>
    <div className={styles.tabRow}><button className={`${styles.button} ${tab === 'assign' ? styles.selected : ''}`} type="button" aria-pressed={tab === 'assign'} onClick={() => setTab('assign')}>Назначения игрокам</button><button className={`${styles.button} ${tab === 'library' ? styles.selected : ''}`} type="button" aria-pressed={tab === 'library'} onClick={() => setTab('library')}>Библиотека PDF</button></div>
    {!course && !error && <p className={styles.loading}>Загрузка курса…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.success} role="status">{notice}</p>}
    {course && <>
      {tab === 'assign' && <div className={styles.card}>
        <label className={styles.field}>Игрок<select className={styles.select} value={playerId} disabled={locked} onChange={e => { setPlayerId(e.target.value); setReviewed(false); setError(''); setNotice(''); }}><option value="">Выберите игрока</option>{players.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></label>
        <div className={`${styles.grid} mt-4`}>
          <label className={styles.field}>Назначение<select className={styles.select} value={scope} disabled={locked} onChange={e => updateOptions(() => { setScope(e.target.value); setPreviewIndex(0); })}><option value="phase">Отдельная фаза · 12 занятий</option><option value="course">Весь курс · 48 занятий</option></select></label>
          {scope === 'phase' && <label className={styles.field}>Фаза<select className={styles.select} value={phase} disabled={locked} onChange={e => updateOptions(() => { setPhase(Number(e.target.value)); setPreviewIndex(0); })}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>Фаза {n}</option>)}</select></label>}
          <label className={styles.field}>Подходов в основном блоке · PDF 2–4<select className={styles.select} value={mainSets} disabled={locked} onChange={e => updateOptions(() => setMainSets(Number(e.target.value)))}>{[2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <label className={styles.check}><input type="checkbox" checked={stretch} disabled={locked} onChange={e => updateOptions(() => setStretch(e.target.checked))} />Добавить необязательную растяжку</label>
          {stretch && <label className={styles.field}>Подходов растяжки · PDF 2–3<select className={styles.select} value={stretchSets} disabled={locked} onChange={e => updateOptions(() => setStretchSets(Number(e.target.value)))}>{[2, 3].map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
        </div>
        <RestFields value={rests} disabled={locked} onChange={value => updateOptions(() => setRests(value))} />
        <label className={`${styles.field} mt-4`}>Комментарий игроку<textarea className={styles.textarea} maxLength={1600} value={note} disabled={locked} onChange={e => updateOptions(() => setNote(e.target.value))} placeholder="Индивидуальные указания по выполнению" /></label>
        {safety && <details className={styles.details} open={!!safety.hold}><summary>Ограничения · ReadySix</summary><p>{safety.hold || safety.detail}</p>{safety.restrictions.length > 0 && <p>Сохранённые запреты: {safety.restrictions.join(', ')}</p>}<a className={styles.video} href="https://readysix.app" target="_blank" rel="noopener noreferrer">Открыть ReadySix ↗</a></details>}
        <p className={styles.notice}>{course.warning}</p>
        <label className={styles.check}><input type="checkbox" checked={reviewed} disabled={locked} onChange={e => setReviewed(e.target.checked)} />Состав и дозировка проверены с учётом ограничений игрока</label>
        <div className={styles.actions}>{pending && !busy ? <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => submitAssignment(true)}>Повторить сохранение назначения</button> : <button type="button" className={`${styles.button} ${styles.primary}`} disabled={locked || !reviewed || !selectedPlayer || !safety || !!safety.hold} onClick={() => submitAssignment()}>{busy ? 'Сохранение…' : 'Назначить игроку'}</button>}</div>
        {pending && !busy && <p className={styles.notice}>Подтверждение сохранения не получено. Повтор использует тот же запрос и не создаёт второе назначение.</p>}
      </div>}
      {tab === 'assign' && playerId && <div className={styles.card}><h3>Назначения · {selectedPlayer?.name || 'игрок'}</h3>{!assignments.length && <p className={styles.muted}>Курсы пока не назначены.</p>}<div className={styles.list}>{assignments.map(a => <button type="button" className={styles.assignment} key={a.id} disabled={locked} aria-pressed={detail?.id === a.id} onClick={() => openAssignment(a.id)}><strong>{a.title}</strong><div className={styles.muted}>{a.options.scope === 'phase' ? `Фаза ${a.options.phase}` : 'Весь курс'} · выполнено {a.cursor} из {a.total} · {a.status === 'active' ? 'В работе' : a.status === 'completed' ? 'Завершён' : 'Закрыт тренером'}</div></button>)}</div>
        {detail && <div className={styles.block}><h3>Прогресс назначения</h3><p className={styles.muted}>Завершено {detail.cursor} из {detail.sessions.length}. Даты фиксируются только как факт выполнения.</p>{detail.status === 'active' && <div className={styles.actions}><button type="button" className={styles.button} disabled={locked} onClick={() => changeAssignment('refresh')}>Обновить будущие занятия</button><button type="button" className={styles.button} disabled={locked} onClick={() => changeAssignment('archive')}>Закрыть назначение</button></div>}
          {detail.sessions[detail.cursor] && <details className={styles.details}><summary>Текущее занятие · фаза {detail.sessions[detail.cursor].phase}</summary><Exercises session={detail.sessions[detail.cursor]} onEdit={locked ? undefined : editExercise} /><p className={styles.notice}>Отмечено подходов: {Object.values(detail.progress).filter(Boolean).length}. Начатое занятие сохраняет свою версию при обновлении библиотеки.</p></details>}
          <details className={styles.details}><summary>История выполнения ({detail.history.length})</summary>{detail.history.map(h => <details key={h.index} className={styles.history}><summary>Занятие {h.index + 1} · {new Date(h.completedAt).toLocaleString('ru-RU')}</summary><Exercises session={detail.sessions[h.index]} /></details>)}</details>
        </div>}
      </div>}
      <div className={`${styles.card} ${styles.preview}`}>
        <div className={styles.row}><div><p className={styles.eyebrow}>Поясница · E3 Rehab</p><h3>Low Back Resilience</h3></div><span className={styles.badge}>{sourceSessions.length} занятий</span></div>
        {tab === 'library' && <div className={`${styles.grid} mt-3`}><label className={styles.field}>Часть курса<select className={styles.select} value={scope === 'course' ? 'course' : phase} disabled={locked} onChange={e => { if (e.target.value === 'course') setScope('course'); else { setScope('phase'); setPhase(Number(e.target.value)); } setPreviewIndex(0); setReviewed(false); }}><option value="course">Весь курс</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>Фаза {n}</option>)}</select></label><label className={styles.check}><input type="checkbox" checked={stretch} disabled={locked} onChange={e => setStretch(e.target.checked)} />Показать растяжку</label></div>}
        <label className={`${styles.field} mt-3`}>Просмотр занятия<select className={styles.select} disabled={busy} value={Math.min(previewIndex, sourceSessions.length - 1)} onChange={e => setPreviewIndex(Number(e.target.value))}>{sourceSessions.map((s, i) => <option key={s.index} value={i}>{i + 1}. Фаза {s.phase} · занятие {s.phaseSession} из 12</option>)}</select></label>
        <p className={styles.notice}>Без расписания. Состав и порядок сохранены из PDF. В исходнике рекомендованы три занятия в неделю; это справочная рекомендация, а не привязка к календарю.</p>
        <Exercises session={preview} onEdit={locked ? undefined : editExercise} />
        {tab === 'library' && <><RestFields value={rests} disabled={locked} onChange={setRests} /><button className={styles.button} type="button" disabled={locked} onClick={async () => { setBusy(true); setError(''); try { const data = await preventionCall('/api/prevention/catalogue', { apiKey, body: { workspace, expectedRevision: course.revision, rests } }); if (alive.current) { setCourse(data.course); setReviewed(false); setNotice('Паузы сохранены для новых назначений в этом пространстве.'); } } catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setBusy(false); } }}>Сохранить паузы библиотеки</button></>}
      </div>
      <details className={styles.details}><summary>Источник и замечания к переносу</summary><p>PDF E3 Rehab: 4 фазы, 48 занятий; ходьба и индивидуальная цель по шагам — отдельная часть курса. Общая длительность занятия и паузы в PDF не заданы.</p><p>Стр. 35: семь заглушек вместо подсказок, семь отсутствующих видеоссылок; названия Shin Box Rotation No Hands и Hip Hinge Arms Overhead отличаются от предыдущих занятий. Эти поля доступны для ручного исправления. Упоминаемый Supplemental Information PDF не предоставлен.</p></details>
    </>}
    {editor && patch && <section id="prevention-exercise-editor" className={`${styles.card} mt-5`} role="region" aria-label="Редактор упражнения">
      <h3>Исправить упражнение</h3><p className={styles.notice}>Исходное название: {editor.originalName || editor.name}. Правка применяется ко всем появлениям этого упражнения в библиотеке текущего пространства.</p>
      <div className={styles.stack}><label className={styles.field}>Название<input className={styles.input} maxLength={180} value={patch.name} disabled={busy} onChange={e => setPatch({ ...patch, name: e.target.value })} /></label><label className={styles.field}>Ссылка на видео · YouTube или Vimeo<input className={styles.input} type="url" maxLength={600} value={patch.video} disabled={busy} onChange={e => setPatch({ ...patch, video: e.target.value })} /></label><label className={styles.field}>Подсказка<textarea className={styles.textarea} maxLength={1600} value={patch.note} disabled={busy} onChange={e => setPatch({ ...patch, note: e.target.value })} /></label></div>
      <div className={styles.actions}><button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy || !patch.name.trim()} onClick={savePatch}>Сохранить исправление</button><button type="button" className={styles.button} disabled={busy} onClick={() => { setEditor(null); setPatch(null); }}>Отмена</button></div>
    </section>}
  </section>;
}
