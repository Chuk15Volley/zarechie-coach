import { useEffect, useState } from 'react';
import { Search, ArrowUpRight, Activity, CheckCircle2, ShieldCheck, Users } from 'lucide-react';
import PremiumSelect from '../PremiumSelect';
import { preventionCall } from './api';
import styles from './Prevention.module.css';

const date = value => value ? new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : 'Ещё не выполнял';
export default function CoachOverview({ workspace, apiKey, reload, onOpen, onAssign }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    preventionCall(`/api/prevention/overview?workspace=${workspace}`, { apiKey, signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [workspace, apiKey, reload]);
  if (error) return <div role="alert" className={styles.error}>{error}</div>;
  if (!data) return <p className={styles.loading} role="status">Собираем прогресс команды…</p>;
  const rows = data.players, assignments = rows.flatMap(row => row.assignments), active = assignments.filter(a => a.status === 'active'), attention = rows.filter(row => row.error || row.assignments.some(a => a.reviewState.needed));
  const shown = rows.filter(row => row.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (filter === 'all' || filter === 'attention' && attention.includes(row) || filter === 'active' && row.assignments.some(a => a.status === 'active') || filter === 'empty' && !row.error && !row.assignments.some(a => a.status === 'active') || filter === 'completed' && row.assignments.some(a => a.status === 'completed')));
  return <div className={styles.overview}>
    <div className={styles.stats}>{[[Users, 'Игроков с курсами', rows.filter(row => row.assignments.some(a => a.status === 'active')).length], [Activity, 'В работе', active.length], [ShieldCheck, 'Проверить', attention.length], [CheckCircle2, 'Завершено', assignments.filter(a => a.status === 'completed').length]].map(([Icon, label, value]) => <div key={label} className={styles.stat}><Icon size={17} aria-hidden="true" /><strong>{value}</strong><span>{label}</span></div>)}</div>
    <div className={styles.card}>
      <div className={styles.row}><div><p className={styles.eyebrow}>Команда</p><h3>Курсы и прогресс</h3></div><span className={styles.source}>Проверено {date(data.checkedAt)} · МСК</span></div>
      <div className={`${styles.grid} ${styles.filters}`}><label className={styles.field}>Поиск игрока<div className={styles.searchField}><Search size={16} aria-hidden="true" /><input className={styles.input} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Имя игрока" /></div></label><label className={styles.field}>Показать<PremiumSelect value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Вся команда</option><option value="active">С активными курсами</option><option value="attention">Нужна проверка</option><option value="empty">Без активных курсов</option><option value="completed">Есть завершённые курсы</option></PremiumSelect></label></div>
      {!shown.length && <p className={styles.empty}>Игроки по этому запросу не найдены.</p>}
      <div className={styles.teamList}>{shown.map(row => <article key={row.playerId} className={styles.teamPlayer}>
        <div className={styles.row}><h4>{row.name}</h4><button type="button" className={styles.textButton} onClick={() => onAssign(row.playerId)}>Назначить курс <ArrowUpRight size={14} aria-hidden="true" /></button></div>
        {row.error ? <p role="alert" className={styles.error}>{row.error}</p> : !row.assignments.length ? <p className={styles.muted}>Профилактика ещё не назначена</p> : <div className={styles.teamCourses}>{row.assignments.map(a => <button type="button" className={styles.courseRow} key={a.id} onClick={() => onOpen(row.playerId, a)}>
          <div className={styles.row}><strong>{a.title}</strong><span className={`${styles.badge} ${a.reviewState.needed ? styles.attention : ''}`}>{a.reviewState.needed ? 'Нужна проверка' : a.status === 'active' ? a.currentDone > 0 ? 'Занятие начато' : 'В работе' : a.status === 'completed' ? 'Завершён' : 'Закрыт'}</span></div>
          <p className={styles.muted}>{a.region} · {a.options.scope === 'phase' ? `${a.phaseTerm || 'Фаза'} ${a.options.phaseLabel || a.options.phase}` : 'Весь курс'}{a.courseId.includes('daily') ? ' · Дополнительный комплекс' : ''}</p>
          <div className={styles.courseProgress}><div className={styles.progress}><div style={{ width: `${a.total ? 100 * a.cursor / a.total : 0}%` }} /></div><span>{a.cursor}/{a.total}</span></div>
          <p className={styles.source}>{a.status === 'active' ? `Сейчас: ${a.phaseTerm || 'Фаза'} ${a.currentPhaseLabel || a.currentPhase || a.options.phase || '—'} · ` : ''}{a.currentDone > 0 ? `Отмечено ${a.currentDone}/${a.currentTotal} подходов · ` : ''}Последнее выполнение: {date(a.lastCompletedAt || a.completedAt)}{a.reviewState.needed ? ` · ${a.reviewState.reason}` : ''}</p>
        </button>)}</div>}
      </article>)}</div>
    </div><p className={styles.notice}>Даты показывают только факт выполнения. У курсов нет пропущенных дней и просрочек. При изменении жалоб или ограничений ReadySix тренер повторно проверяет назначение.</p>
  </div>;
}
