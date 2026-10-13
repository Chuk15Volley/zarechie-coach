import {useEffect,useRef,useState} from 'react';
import {teamQueueCall} from '../lib/teamQueueClient.mjs';
import {historyNeedsFacts} from '../lib/playerHistoryPolicy.mjs';
import {loadEvidenceLabel} from '../lib/coachOverview.mjs';
import {OverviewSignals,OverviewStats} from './CoachOverview';
import StrengthMissingActuals from './StrengthMissingActuals';
import StrengthPerformance from './StrengthPerformance';
import {historyPerformanceSeries} from '../lib/strengthPerformance.mjs';
const kg=value=>Number(value)>=1000?`${(value/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})} т`:`${Number(value || 0).toLocaleString('ru-RU')} кг`;
export default function PlayerHistory({workspace,player,apiKey,factsRefresh,cycleReview,onOpenProgram,targetDate}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[more,setMore]=useState(false),[filter,setFilter]=useState('all'),[section,setSection]=useState('sessions'),[reload,setReload]=useState(0);
 const request=useRef(0),controller=useRef(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 async function read(before=null){
  controller.current?.abort();const ctrl=new AbortController(),id=++request.current;controller.current=ctrl;
  if(before)setMore(true);else setLoading(true);setError('');
  try{const result=await teamQueueCall(apiKey,'/api/players/sessions?'+new URLSearchParams({workspace,playerId:String(player.id),limit:'20',...before?{before}:{}}),{signal:ctrl.signal,timeoutMs:25000});
   if(!Array.isArray(result.sessions))throw Error('История получена не полностью. Повторите загрузку.');
   if(alive.current && request.current===id && !ctrl.signal.aborted)setData(previous=>({...result,sessions:before?[...new Map([...(previous?.sessions || []),...result.sessions].map(row=>[row.date,row])).values()]:result.sessions}));
  }catch(error){if(alive.current && request.current===id && !ctrl.signal.aborted)setError(error.message);}
  finally{if(alive.current && request.current===id){setLoading(false);setMore(false);}}
 }
 useEffect(()=>{setData(null);void read();return()=>{request.current++;controller.current?.abort();};},[workspace,player.id,apiKey,factsRefresh,reload]);
 const sessions=data?.sessions || [],gaps=sessions.filter(historyNeedsFacts),visible=sessions.filter(row=>filter==='all' || filter==='strength' && row.focus==='inseason_strength' || filter==='gaps' && historyNeedsFacts(row));
 return <section className="coach-player-history" aria-label="История игрока и фактические данные">
 <header className="coach-overview-header"><div><p className="coach-overview-eyebrow">{player.name}</p><h2>История и результаты</h2><p>План, выполненная работа и решения по силовым циклам.</p></div><button type="button" disabled={loading || more} onClick={()=>setReload(value=>value+1)}>Обновить историю</button></header>
 <div className="coach-overview-filters" aria-label="Разделы истории">{[['sessions','Тренировки и факт'],['decisions','Результаты моих решений']].map(([id,label])=><button key={id} type="button" aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</button>)}</div>
 {section==='decisions'?cycleReview:<>
 {data && <OverviewStats items={[["Загружено занятий",`${sessions.length}/${data.total ?? sessions.length}`,"Можно открыть более ранние"],["Заполнить факты",gaps.length,"Основные A1 / B1 / B2"],["Полных силовых",sessions.filter(row=>row.factReview?.completed).length,"По подтверждённому выполнению"],["Устаревшие дополнения",sessions.filter(row=>row.factReview?.status==='stale').length,"Нужно повторное подтверждение"]]}/>}
 {data && <StrengthPerformance series={historyPerformanceSeries(sessions)} onOpenDate={date=>onOpenProgram(player,date)} scope={`Загружено ${sessions.length} из ${data.total ?? sessions.length} занятий · графики силовой`} stale={!!error || loading}/>}
 <div className="coach-history-section-heading"><div><p className="coach-overview-eyebrow">ХРОНОЛОГИЯ</p><h3>Тренировки и выполнение</h3></div><div className="coach-overview-filters" aria-label="Фильтры истории">{[['all','Все занятия'],['strength','Силовая'],['gaps','Заполнить факты']].map(([id,label])=><button key={id} type="button" aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div></div>
 {loading && <p role="status" className="coach-overview-empty">Загружаю историю игрока…</p>}
 {error && <p role="alert" className="coach-data-warning">История не обновлена: {error}. Ранее загруженные записи не подтверждают актуальность; повторите обновление.</p>}
 {!loading && data && !visible.length && <p className="coach-overview-empty">{sessions.length?'Нет занятий по выбранному фильтру.':'Сохранённых занятий пока нет.'}</p>}
 <div className="coach-history-list">{visible.map(session=>{const fact=session.factReview,signal=loadEvidenceLabel(session.loadEvidence);return <article className="coach-history-card" key={session.date}>
 <header><div><p className="coach-history-date-code">{session.date}</p><h3>{new Date(session.date+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}</h3><p>{session.trainingLabel || 'Тренировка в зале'}</p></div><div className="coach-history-card-actions"><span className={'coach-studio-badge '+(historyNeedsFacts(session)?'is-warning':'')}>{fact?.status==='stale'?'Перепроверить дополнение':historyNeedsFacts(session)?'Есть пропуски факта':fact?.completed?'Выполнение подтверждено':fact?'Ожидает выполнения':'Сохранённый план'}</span><button type="button" onClick={()=>onOpenProgram(player,session.date)}>Открыть программу ↗</button></div></header>
 <div className="coach-history-dose"><div><span>Фактический тоннаж</span><strong>{signal?.kind==='missing' && !session.tonnage?'Нет факта':kg(session.tonnage)}</strong></div><div><span>Плановый тоннаж</span><strong>{kg(session.plannedTonnage)}</strong></div><div><span>Выполнение силовой</span><strong>{fact?fact.completed?'Полное подтверждено':'Полное не подтверждено':'Другой метод'}</strong></div></div>
 <OverviewSignals issues={[...signal?[signal]:[],...fact && historyNeedsFacts(session)?[{kind:fact.status==='stale'?'stale':'missing',text:`Нет значений: кг ${fact.missing.kg} · повторы ${fact.missing.reps} · RPE упражнения ${fact.missing.rpe}`}]:[]]}/>
 {fact?.rows?.length>0 && <details className="coach-history-exercises"><summary>Выполненные основные движения · кг / повторы / RPE</summary>{fact.rows.map(row=><div className="coach-history-lift" key={row.exercise}><strong>{row.code} · {row.name}</strong><p>{row.loadUnits===2?'Кг одного снаряда из пары':'Кг одного снаряда'} · RPE упражнения {row.rpe ?? 'не записан'}</p><ol>{row.sets.map(set=><li key={set.set}>Подход {set.set+1}: <b>{set.kg ?? '—'} кг × {set.reps ?? '—'}</b>{/\/side/.test(set.target)?' на сторону':''}</li>)}</ol></div>)}</details>}
 {historyNeedsFacts(session) && <StrengthMissingActuals workspace={workspace} player={player} date={session.date} apiKey={apiKey} initialOpen={session.date===targetDate} onSaved={()=>setReload(value=>value+1)}/>}
 {fact && !fact.canConfirm && <p className="coach-history-caption">Дополнение фактов станет доступно после полного выполнения. Пропуски не превращаются в завершённую тренировку.</p>}
 <details className="coach-overview-secondary"><summary>План упражнений · {session.exerciseCount || 0}</summary><p>Это сохранённое задание. Плановые кг не заменяют выполненные веса и RPE.</p>{(session.exercises || []).map((ex,index)=><p key={index}>{ex.name} · план {ex.kg>0?ex.kg+' кг':'по усилию / без отягощения'}</p>)}</details>
 </article>;})}</div>
 {data?.nextCursor && <button type="button" className="coach-history-more" disabled={loading || more} onClick={()=>read(data.nextCursor)}>{more?'Загружаю…':'Загрузить более ранние занятия'}</button>}
 </>}
 </section>;
}
