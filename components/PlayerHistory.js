import {missingFactText} from '../lib/coachFastWork.mjs';
import CoachAvatar from './CoachAvatar';
import useViewPreference from '../hooks/useViewPreference';
import {sessionFactAmount,factAmount,trainingTitle} from '../lib/coachPresentation.mjs';
import FactPeriod from './FactPeriod';
import {factPeriod,validFactPeriod} from '../lib/factPeriod.mjs';
import {useEffect,useRef,useState} from 'react';
import {teamQueueCall} from '../lib/teamQueueClient.mjs';
import {historyNeedsFacts} from '../lib/playerHistoryPolicy.mjs';
import {loadEvidenceLabel} from '../lib/coachOverview.mjs';
import {OverviewSignals,OverviewStats} from './CoachOverview';
import StrengthMissingActuals from './StrengthMissingActuals';
import StrengthPerformance from './StrengthPerformance';
import {historyPerformanceSeries} from '../lib/strengthPerformance.mjs';
const kg=value=>Number(value)>=1000?`${(value/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})} т`:`${Number(value || 0).toLocaleString('ru-RU')} кг`;
export default function PlayerHistory({workspace,player,apiKey,factsRefresh,cycleReview,onOpenProgram,targetDate,focusTarget,onClearTarget}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[more,setMore]=useState(false),[visibleLimit,setVisibleLimit]=useState(12),[reload,setReload]=useState(0);
 const contextKey=`gym:view:history:${workspace}:${player.id}`;
 const [period,setPeriod]=useViewPreference(contextKey+':period',factPeriod(90)),[filter,setFilter]=useViewPreference(contextKey+':filter','all'),[section,setSection]=useViewPreference(contextKey+':section','sessions'),[fillTarget,setFillTarget]=useState(null),focusPanel=useRef(null),historyRoot=useRef(null),scrollRestored=useRef(false);
 const rememberOpen=(player,date)=>{try{sessionStorage.setItem(contextKey+':scroll',String(historyRoot.current?.closest('.workspace-main')?.scrollTop || 0));}catch{}onOpenProgram(player,date);};
 useEffect(()=>{if(!data || loading || scrollRestored.current)return;scrollRestored.current=true;if(focusTarget)return;let scroll=0;try{scroll=Number(sessionStorage.getItem(contextKey+':scroll')) || 0;}catch{}const frame=requestAnimationFrame(()=>{const main=historyRoot.current?.closest('.workspace-main');if(main)main.scrollTop=scroll;});return()=>cancelAnimationFrame(frame);},[data,loading,contextKey]);
 useEffect(()=>{if(focusTarget)setFillTarget(focusTarget);},[focusTarget]);
 useEffect(()=>{if(fillTarget){setSection('sessions');requestAnimationFrame(()=>focusPanel.current?.scrollIntoView({block:'start'}));}},[fillTarget]);
 const request=useRef(0),controller=useRef(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 async function read(){
  controller.current?.abort();const ctrl=new AbortController(),id=++request.current;controller.current=ctrl;setLoading(true);setError('');
  try{let cursor=null,result,rows=[];const deadline=Date.now()+25000;
   for(let page=0;page<10;page++){
    if(Date.now()>=deadline)throw Error('Период не загружен полностью. Сократите период или повторите.');
    result=await teamQueueCall(apiKey,'/api/players/sessions?'+new URLSearchParams({workspace,playerId:String(player.id),limit:'40',...period,...cursor?{before:cursor}:{}}),{signal:ctrl.signal,timeoutMs:Math.max(1,deadline-Date.now())});
    if(!Array.isArray(result.sessions))throw Error('История получена не полностью. Повторите загрузку.');
    rows.push(...result.sessions);if(!result.nextCursor)break;if(result.nextCursor===cursor)throw Error('Не удалось продолжить период истории');cursor=result.nextCursor;
   }
   if(result.nextCursor)throw Error('Период не загружен полностью. Сократите период.');
   const sessions=[...new Map(rows.map(row=>[row.date,row])).values()];
   if(Number.isFinite(result.total) && sessions.length!==result.total)throw Error('Не все занятия периода доступны. Повторите проверку.');
   if(alive.current && request.current===id && !ctrl.signal.aborted)setData({...result,sessions});
  }catch(error){if(alive.current && request.current===id && !ctrl.signal.aborted)setError(error.message);}
  finally{if(alive.current && request.current===id){setLoading(false);setMore(false);}}
 }
 useEffect(()=>{setData(null);if(validFactPeriod(period.from,period.to))void read();else setLoading(false);return()=>{request.current++;controller.current?.abort();};},[workspace,player.id,apiKey,factsRefresh,reload,period.from,period.to]);
 useEffect(()=>setVisibleLimit(12),[workspace,player.id,period.from,period.to,filter]);
 const sessions=data?.sessions || [],gaps=sessions.filter(historyNeedsFacts),visible=sessions.filter(row=>filter==='all' || filter==='strength' && row.focus==='inseason_strength' || filter==='gaps' && historyNeedsFacts(row));
 return <section ref={historyRoot} className="coach-player-history" aria-label="История игрока и фактические данные">
 <header className="coach-overview-header"><div className="coach-history-player-heading"><CoachAvatar player={player}/><div><p className="coach-overview-eyebrow">{player.name}</p><h2>История и результаты</h2><p>План и выполненная работа.</p></div></div><button type="button" disabled={loading || more} onClick={()=>setReload(value=>value+1)}>Обновить историю</button></header>
 <div className="coach-overview-filters" aria-label="Разделы истории">{[['sessions','Тренировки и факт'],['decisions','Результаты моих решений']].map(([id,label])=><button key={id} type="button" aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</button>)}</div>
 {section==='decisions'?cycleReview:<>
 <FactPeriod value={period} onChange={setPeriod}/>
 {fillTarget && <section className="coach-focused-facts" ref={focusPanel} aria-label="Заполнение выбранного пропуска"><header><h3>{fillTarget.date} · заполнить факты</h3><button type="button" onClick={()=>{setFillTarget(null);onClearTarget?.();}}>Закрыть заполнение</button></header><StrengthMissingActuals key={`${workspace}:${player.id}:${fillTarget.date}`} workspace={workspace} player={player} date={fillTarget.date} apiKey={apiKey} initialOpen focusField={fillTarget} onSaved={()=>setReload(value=>value+1)}/></section>}

 {data && <OverviewStats items={[["Загружено занятий",`${sessions.length}/${data.total ?? sessions.length}`,"Весь выбранный период"],["Заполнить факты",gaps.length,"Все силовые упражнения",()=>setFilter('gaps'),filter==='gaps'],["Полных силовых",sessions.filter(row=>row.factReview?.completed).length,"По подтверждённому выполнению"],["Устаревшие дополнения",sessions.filter(row=>row.factReview?.status==='stale').length,"Нужно повторное подтверждение"]]}/>}
 {data && <details className="coach-history-charts"><summary>Графики · кг, повторы и RPE</summary><StrengthPerformance contextKey={contextKey} series={historyPerformanceSeries(sessions)} onOpenDate={date=>rememberOpen(player,date)} onFill={target=>setFillTarget({...target,token:Date.now()})} scope={`${period.from} → ${period.to} · загружено ${sessions.length} из ${data.total ?? sessions.length} занятий`} stale={!!error || loading}/></details>}
 <div className="coach-history-section-heading"><div><p className="coach-overview-eyebrow">ХРОНОЛОГИЯ</p><h3>Тренировки и выполнение</h3></div><div className="coach-overview-filters" aria-label="Фильтры истории">{[['all','Все занятия'],['strength','Силовая'],['gaps','Заполнить факты']].map(([id,label])=><button key={id} type="button" aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div></div>
 {loading && <p role="status" className="coach-overview-empty">Загружаю историю игрока…</p>}
 {error && <p role="alert" className="coach-data-warning">История не обновлена: {error}. Ранее загруженные записи не подтверждают актуальность; повторите обновление.</p>}
 {!loading && data && !visible.length && <p className="coach-overview-empty">{sessions.length?'Нет занятий по выбранному фильтру.':'Сохранённых занятий пока нет.'}</p>}
 <div className="coach-history-list">{visible.slice(0,visibleLimit).map(session=>{const fact=session.factReview,signal=loadEvidenceLabel(session.loadEvidence);return <article className="coach-history-card" key={session.date}>
 <header><div><h3>{new Date(session.date+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}</h3><p>{trainingTitle(session.trainingLabel)}</p></div><div className="coach-history-card-actions"><span className={'coach-studio-badge '+(historyNeedsFacts(session)?'is-warning':'')}>{fact?.status==='stale'?'Перепроверить дополнение':historyNeedsFacts(session)?'Есть пропуски факта':fact?.completed || session.execution?.completed?'Выполнение подтверждено':fact?'Ожидает выполнения':'Сохранённый план'}</span><button type="button" onClick={()=>rememberOpen(player,session.date)}>Открыть программу ↗</button></div></header>
 <div className="coach-history-dose"><div><span>Фактический тоннаж</span><strong>{sessionFactAmount(session.tonnage,session.loadEvidence,session.execution || {completed:fact?.completed})}</strong></div><div><span>Плановый тоннаж</span><strong>{kg(session.plannedTonnage)}</strong></div></div>
 <OverviewSignals issues={[...signal && (signal.kind==='stale' || !(fact && historyNeedsFacts(session))) && (fact?.completed || session.execution?.completed || session.execution?.completedSets>0)?[signal]:[],...fact && historyNeedsFacts(session)?[{kind:fact.status==='stale'?'stale':'missing',text:`Не записано: ${missingFactText(fact.missing)}`}]:[]]}/>
 {fact?.rows?.length>0 && <details className="coach-history-exercises"><summary>Выполненные упражнения · кг / повторы / RPE</summary>{fact.rows.map(row=><div className="coach-history-lift" key={row.exercise}><strong>{row.code} · {row.name}</strong><p>{row.loadUnits===2?'Кг одного снаряда из пары':'Кг одного снаряда'} · RPE упражнения {row.rpe ?? 'не записан'}</p><ol>{row.sets.map(set=><li key={set.set}>Подход {set.set+1}: <b>{set.kg ?? '—'} кг × {set.reps ?? '—'}</b>{/\/side/.test(set.target)?' на сторону':''}</li>)}</ol></div>)}</details>}
 {historyNeedsFacts(session) && fillTarget?.date!==session.date && <StrengthMissingActuals workspace={workspace} player={player} date={session.date} apiKey={apiKey} initialOpen={session.date===targetDate} onSaved={()=>setReload(value=>value+1)}/>}
 {fact && !fact.canConfirm && <p className="coach-history-caption">Дополнение фактов станет доступно после полного выполнения. Пропуски не превращаются в завершённую тренировку.</p>}
 <details className="coach-overview-secondary"><summary>План упражнений · {session.exerciseCount || 0}</summary><p>Это сохранённое задание. Плановые кг не заменяют выполненные веса и RPE.</p>{(session.exercises || []).map((ex,index)=><p key={index}>{ex.name} · план {ex.kg>0?ex.kg+' кг':'по усилию / без отягощения'}</p>)}</details>
 </article>;})}</div>
 {visibleLimit<visible.length && <button type="button" className="coach-history-more" onClick={()=>setVisibleLimit(v=>v+12)}>Ещё занятия · {visible.length-visibleLimit}</button>}
 {data?.nextCursor && <button type="button" className="coach-history-more" disabled={loading || more} onClick={()=>read(data.nextCursor)}>{more?'Загружаю…':'Загрузить более ранние занятия'}</button>}
 </>}
 </section>;
}
