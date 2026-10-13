import StrengthMissingActuals from './StrengthMissingActuals';
import StrengthDecisionGroup from './StrengthDecisionGroup';
import CoachAuditPanel from './CoachAuditPanel';
import {useEffect,useState} from 'react';
import {teamQueueCall} from '../lib/teamQueueClient.mjs';
const chains={full_body:'Всё тело',anterior_chain:'Передняя цепь',posterior_chain:'Задняя цепь'};
const actions={increase:'Прибавка кг',increase_reps:'Прибавка повторов',hold:'Удержать',reduce:'Снизить',rpe_only:'Подбор по RPE'};
export default function StrengthTeamNextReview({workspace,players,apiKey,date,onSelectPlayer}){
  const [open,setOpen]=useState(false),[chain,setChain]=useState('anterior_chain'),[mode,setMode]=useState('maintenance'),[rows,setRows]=useState([]),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0),[preferencesReady,setPreferencesReady]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('gym:strength-review:v1:'+workspace));if(['anterior_chain','posterior_chain','full_body'].includes(saved?.chain))setChain(saved.chain);if(['maintenance','development'].includes(saved?.mode))setMode(saved.mode);if(saved?.open)setOpen(true);}catch{}setPreferencesReady(true);},[workspace]);
  useEffect(()=>{if(preferencesReady)try{localStorage.setItem('gym:strength-review:v1:'+workspace,JSON.stringify({chain,mode,open}));}catch{}},[workspace,chain,mode,open,preferencesReady]);
  const identity=players.map(player=>String(player.id)).join(',');
  useEffect(()=>{
    setRows([]);if(!open || !apiKey || !players.length)return;
    const controller=new AbortController();setLoading(true);let cursor=0;
    async function worker(){while(cursor<players.length && !controller.signal.aborted){const player=players[cursor++];let result;
      try{const data=await teamQueueCall(apiKey,'/api/players/strength-next-cycle?'+new URLSearchParams({workspace,playerId:String(player.id),date,trainingType:chain,strengthMode:mode}),{signal:controller.signal,timeoutMs:45000});result={player,data};}
      catch(error){result={player,error:error.message};}
      if(!controller.signal.aborted)setRows(previous=>[...previous.filter(row=>row.player.id!==player.id),result]);
    }}
    void Promise.all([worker(),worker()]).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[open,workspace,apiKey,date,chain,mode,identity,refresh]);
  const ordered=players.map(player=>rows.find(row=>row.player.id===player.id)).filter(Boolean);
  return <details open={open} className="mb-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.025] print:hidden" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-300">Команда · перед следующим силовым циклом</summary>
    {open && <div className="border-t border-white/5 p-4">
      <p className="text-xs text-slate-400">На {date}: фактическое выполнение, текущая нагрузка ReadySix и решения тренера. Ориентир для выбранной цепи и режима; новые программы не сохраняются.</p>
      {notice && <p role="status" className="mt-2 text-xs text-cyan-200">{notice}</p>}
      <div className="my-3 flex flex-wrap gap-2"><select aria-label="Цепь для обзора команды" value={chain} onChange={event=>setChain(event.target.value)} className="rounded-lg bg-slate-900 p-2 text-xs text-slate-200">{Object.entries(chains).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select aria-label="Режим для обзора команды" value={mode} onChange={event=>setMode(event.target.value)} className="rounded-lg bg-slate-900 p-2 text-xs text-slate-200"><option value="maintenance">Поддерживающая</option><option value="development">Развивающая</option></select><button type="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-cyan-200">Обновить обзор команды</button></div>
      <p role="status" className="mb-3 text-xs text-slate-400">{loading?'Проверяю: '+rows.length+' / '+players.length:rows.length+' игроков проверено'} · решений ожидают: {rows.filter(row=>row.data?.decisionNeeded).length} · прибавку не подтверждают данные ReadySix: {rows.filter(row=>row.data && !row.data.load.allowIncrease).length} · ошибок загрузки: {rows.filter(row=>row.error).length}</p>
      <details className="my-3 rounded-xl border border-amber-300/15 p-3"><summary className="cursor-pointer text-xs font-bold text-amber-200">Что не записано · кг, повторы и RPE ({ordered.reduce((sum,row)=>sum+(row.data?.facts.missing?.length || 0),0)} экспозиций)</summary>
        <p className="mt-2 text-xs text-slate-400">Только подтверждённые выполнения основных движений выбранной цепи. Отсутствующие данные не заменяются планом; для работы без отягощения кг не требуются. При неполном цикле проверьте также незавершённые занятия у игрока.</p>
        {!loading && !ordered.some(row=>row.data?.facts.missing?.length) && <p className="mt-2 text-xs text-slate-400">Пропусков среди доступных подтверждённых выполнений нет{ordered.some(row=>!row.data?.facts.completedMainSets)?'; у части игроков ещё нет таких выполнений':''}.{ordered.some(row=>row.error)?' Есть ошибки загрузки — полнота обзора не подтверждена.':''}</p>}
        {ordered.filter(row=>row.data?.facts.missing?.length).map(({player,data})=><div key={player.id} className="mt-3 text-xs text-slate-300"><button type="button" onClick={()=>onSelectPlayer(player)} className="font-bold text-cyan-200 underline">{player.name} · открыть записи</button>{[...new Set(data.facts.missing.map(point=>point.date))].filter(sessionDate=>!data.facts.stale?.some(point=>point.date===sessionDate)).map(sessionDate=><StrengthMissingActuals key={workspace+player.id+sessionDate} workspace={workspace} player={player} date={sessionDate} apiKey={apiKey} onSaved={()=>{setRefresh(value=>value+1);setNotice('Фактические данные сохранены. Пересчитываю ориентир; ранее созданные черновики обновите перед публикацией.');}}/>)}{data.facts.missing.map(point=><p key={point.key+point.date} className="mt-1">{point.date} · {point.code} · {point.name}: {point.sets.map(set=>'подход '+set.set+' — '+set.fields.map(field=>field==='kg'?'кг':'повторы').join(', ')).join('; ')}{point.exerciseRpe?(point.sets.length?'; ':'')+'RPE упражнения':''}.</p>)}</div>)}
      </details>
      {ordered.some(row=>row.data?.facts.stale?.length>0) && <details className="my-3 rounded-xl border border-amber-300/25 p-3"><summary className="cursor-pointer text-xs font-bold text-amber-200">Дополнения требуют повторного подтверждения</summary>{ordered.flatMap(({player,data})=>(data?.facts.stale || []).map(point=><div key={player.id+point.date}>{point.reasons.map(reason=><p key={reason.code} className="mt-2 text-xs text-amber-200">{player.name} · {point.date}: {reason.text}</p>)}<StrengthMissingActuals key={workspace+player.id+point.date} workspace={workspace} player={player} date={point.date} apiKey={apiKey} onSaved={()=>{setRefresh(value=>value+1);setNotice('Подтверждение сохранено. Обновите старые черновики перед публикацией.');}}/></div>))}</details>}
      <StrengthDecisionGroup key={workspace+date+chain} workspace={workspace} date={date} chain={chain} apiKey={apiKey} rows={ordered} loading={loading} onSaved={()=>setRefresh(value=>value+1)}/>
      <CoachAuditPanel key={workspace} workspace={workspace} players={players} apiKey={apiKey} refresh={refresh}/>
      <div className="grid gap-3 lg:grid-cols-2">{ordered.map(({player,data,error})=><article key={player.id} className="rounded-xl border border-white/10 p-3 text-xs text-slate-300">
        <div className="flex items-start justify-between gap-3"><strong>{player.name}</strong><button type="button" onClick={()=>onSelectPlayer(player)} className="text-cyan-200 underline">Открыть игрока и решения</button></div>
        {error?<p role="alert" className="mt-2 text-rose-300">{error}</p>:<>
          <p className="mt-2">{data.cycle?`Цикл ${data.cycle.id}: ${data.cycle.completedCount}/4 полностью выполнено${data.cycle.status==='completed'?' · завершён':''}`:'Нет выполнений цикла новой версии'}</p>
          <p className="mt-1 text-slate-400">Основные подходы выбранной цепи: {data.facts.completedMainSets}; кг и повторы записаны: {data.facts.setsWithKgAndReps}; экспозиций без RPE упражнения: {data.facts.missingExerciseRpe}.</p>
          <p className="mt-2">ReadySix · сегодня и вчера: партии {data.load.playedSets ?? '—'} · площадка {data.load.recentCourtLoad ?? '—'} sRPE×мин · поездки {data.load.travelDates.join(', ') || 'не отмечены'}.</p>
          {data.load.reasons.map(reason=><p key={reason.code} className="mt-1 text-amber-200">{reason.text}</p>)}
          <details className="mt-2"><summary className="cursor-pointer text-cyan-200">Фактическая нагрузка и прогресс</summary>
            {!data.facts.rows.length && <p className="mt-2 text-slate-400">Полных выполнений выбранной цепи пока нет.</p>}
            {data.facts.rows.map(row=>{const latest=row.observations.at(-1),comparison=data.cycle?.comparison?.rows?.find(item=>item.key===row.key);return <div key={row.key} className="mt-2 rounded-lg bg-white/5 p-2"><strong>{row.code} · {row.name}</strong><p>{latest.date}: {latest.sets.filter(set=>set.completed).map(set=>`${set.kg ?? '—'} кг × ${set.reps ?? '—'}${set.perSide?'/стор.':''}`).join('; ')} · RPE упражнения {latest.exerciseRpe ?? '—'}</p>{comparison?.delta?<p className="mt-1 text-slate-400">К соседнему циклу: кг {comparison.delta.kg>0?'+':''}{comparison.delta.kg}; повторы {comparison.delta.reps>0?'+':''}{comparison.delta.reps}{comparison.delta.exerciseRpe!=null?'; RPE при той же работе '+comparison.delta.exerciseRpe:''}.</p>:<p className="mt-1 text-slate-400">Сопоставимое изменение между соседними завершёнными циклами пока не подтверждено.</p>}{comparison?.volumeReview && <p className="mt-1 text-slate-400">Решение по объёму: {comparison.volumeReview.reason}. Подходы {comparison.volumeReview.beforeSets ?? '—'} → {comparison.volumeReview.afterSets ?? '—'}{comparison.volumeReview.status==='lower_volume_observed'?' · снижение подтверждено выполнением':comparison.volumeReview.status==='symptom_deferred'?' · приоритет локальной адаптации':' · результат требует индивидуальной проверки'}.</p>}</div>;})}
          </details>
          <details className="mt-2"><summary className="cursor-pointer text-cyan-200">Мои решения и ориентир нагрузки</summary>
            <p className="mt-2 text-slate-400">{data.decision?`Решения по циклу ${data.decision.cycleId}, сохранены ${new Date(data.decision.savedAt).toLocaleString('ru-RU')}`:data.decisionNeeded?'Завершённый цикл ждёт твоих решений.':'Решения для непосредственного предыдущего цикла не заданы.'}</p>
            {data.decision?.entries.map(entry=><p key={entry.code} className="mt-1">{entry.code} · {entry.name}: {entry.exercise==='keep'?'сохранить':'сменить'}, {entry.progression==='hold'?'удержать нагрузку':'прогрессия по факту'}{entry.volume==='reduce_one'?' · минус один подход: '+entry.volumeReason:''}{entry.note?' · '+entry.note:''}</p>)}
            {data.proposal.error && <p role="alert" className="mt-2 text-rose-300">{data.proposal.error}</p>}{data.proposal.warning && <p className="mt-2 text-amber-200">{data.proposal.warning}</p>}
            {data.proposal.rows.map(row=><div key={row.code} className="mt-2 rounded-lg bg-white/5 p-2"><strong>{row.code} · {row.name}</strong><p>{row.sets?.join(' / ')}{row.kg!=null?' · '+row.kg+' кг':''}{row.rpe!=null?' · RPE до '+row.rpe:''}{row.adapted?' · локальная адаптация':''}</p><p className="mt-1 text-slate-400">{actions[row.action] || row.action}: {row.reason}{row.sourceDate?' Источник: '+row.sourceDate+'.':''}</p></div>)}
          </details>
        </>}
      </article>)}</div>
    </div>}
  </details>;
}
