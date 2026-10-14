import CoachAvatar from './CoachAvatar';
import {coachDraftKey,readCoachDraft,writeCoachDraft,validRestoredDecisions} from '../lib/coachDrafts.mjs';
import {useEffect,useRef,useState} from 'react';
import {teamQueueCall} from '../lib/teamQueueClient.mjs';
function initial(editor){
  return [...new Set(editor.rows.map(row=>row.code))].map(code=>{
    const saved=editor.entries.find(entry=>entry.code===code),row=editor.rows.find(row=>row.key===saved?.key) || editor.rows.filter(row=>row.code===code).at(-1);
    return {key:row.key,code,exercise:saved?.exercise || 'keep',progression:saved?.progression || 'auto',volume:saved?.volume || 'normal',volumeReason:saved?.volumeReason || '',note:saved?.note || ''};
  });
}
export default function StrengthDecisionGroup({workspace,date,chain,apiKey,rows,onSaved,loading=false}){
  const [selected,setSelected]=useState({}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [recoverable,setRecoverable]=useState(null),[localConflict,setLocalConflict]=useState(false);
  const selectedRef=useRef({}),localRevision=useRef(null),draftKey=coachDraftKey(workspace,date,chain);
  const pending=useRef(null),active=useRef(true),controller=useRef(null);
  useEffect(()=>{active.current=true;return()=>{active.current=false;controller.current?.abort();};},[]);
  useEffect(()=>{const saved=readCoachDraft(localStorage,draftKey);localRevision.current=saved?.revision || null;if(validRestoredDecisions(saved,workspace,date,chain))setRecoverable(saved);
    const changed=event=>{if(event.key===draftKey){setLocalConflict(true);setRecoverable(readCoachDraft(localStorage,draftKey));}};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);},[draftKey]);
  function persist(next,pendingBody=pending.current){try{const saved=writeCoachDraft(localStorage,draftKey,localRevision.current,{workspace,date,chain,selected:next,pending:pendingBody});if(saved.conflict){setLocalConflict(true);setRecoverable(saved.current);return;}localRevision.current=saved.revision;setRecoverable(null);}catch(error){setMessage(error.message || 'Браузер не разрешил сохранить правки локально.');}}
  function select(next){selectedRef.current=next;setSelected(next);persist(next);}
  const candidates=rows.filter(row=>row.data?.decisionEditor?.rows.length);
  const update=(id,index,patch)=>{pending.current=null;setMessage('');select({...selectedRef.current,[id]:{...selectedRef.current[id],entries:selectedRef.current[id].entries.map((entry,i)=>i===index?{...entry,...patch}:entry)}});};
  async function save(){
    if(busy)return;setBusy(true);setMessage('Проверяю завершение и версии. Сохраняю выбранные решения вместе…');
    const items=Object.entries(selected).map(([playerId,value])=>({playerId,cycleId:value.editor.cycleId,expectedRevision:value.editor.expectedRevision,entries:value.entries}));
    pending.current ||= {workspace,date,trainingType:chain,requestId:crypto.randomUUID(),items};
    persist(selectedRef.current,pending.current);controller.current=new AbortController();
    try{const result=await teamQueueCall(apiKey,'/api/players/strength-cycle-decisions-batch',{body:pending.current,signal:controller.current.signal,timeoutMs:65000});if(active.current){pending.current=null;select({});setMessage('Сохранено решений игроков: '+result.decisions.length+'. Обновляю ориентир следующего цикла.');onSaved();}}
    catch(error){if(active.current)setMessage(error.message+(error.status===409?' Выбор оставлен на экране. Перечитайте решения, затем выберите игроков заново.':''));}
    finally{if(active.current)setBusy(false);}
  }
  const stale=Object.entries(selected).some(([id,value])=>{const current=candidates.find(row=>String(row.player.id)===id)?.data.decisionEditor;return !current || current.cycleId!==value.editor.cycleId || current.expectedRevision!==value.editor.expectedRevision;});
  const count=Object.keys(selected).length,valid=!loading && !localConflict && (!stale || !!pending.current) && count>0 && Object.values(selected).every(value=>value.entries.every(entry=>entry.note.trim() && (entry.volume!=='reduce_one' || entry.volumeReason.trim())));
  return <details className="my-3 rounded-xl border border-cyan-300/15 p-3"><summary className="cursor-pointer text-xs font-bold text-cyan-200">Решения по завершённым циклам · группой</summary>
    <p className="mt-2 text-xs text-slate-400">Выберите игроков, варианты движений и индивидуальные причины. Сохраняются только решения выбранной цепи; другие цепи сохраняют свои решения. Если версия хотя бы одного игрока изменилась, вся группа остаётся без записи.</p>
    <p className="mt-2 text-xs text-slate-400">Незавершённые правки сохраняются в этом браузере на 14 дней, отдельно по пространству, дате и цепи.</p>
    {recoverable && <div className="mt-2 text-xs text-amber-200"><p>Есть сохранённые правки от {new Date(recoverable.savedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})}.</p><button type="button" disabled={busy} onClick={()=>{if(!validRestoredDecisions(recoverable,workspace,date,chain))return;localRevision.current=recoverable.revision;selectedRef.current=recoverable.selected;setSelected(recoverable.selected);pending.current=recoverable.pending || null;setRecoverable(null);setLocalConflict(false);setMessage('Правки восстановлены. Проверьте актуальность цикла перед сохранением.');}} className="mr-3 mt-2 underline">Восстановить правки</button><button type="button" disabled={busy} onClick={()=>{localRevision.current=recoverable.revision;pending.current=null;select({});setLocalConflict(false);setRecoverable(null);}} className="underline">Удалить локальные правки</button></div>}
    {localConflict && <p role="alert" className="mt-2 text-xs text-amber-200">Локальные правки изменились в другой вкладке. Восстановите сохранённую версию перед записью.</p>}
    {stale && count>0 && !loading && !pending.current && <p role="alert" className="mt-2 text-xs text-amber-200">Цикл или решения на сервере изменились. Сохранение остановлено; перечитайте решения и выберите игроков заново.</p>}
    {loading && <p className="mt-2 text-xs text-slate-400">Проверяю завершённые циклы…</p>}
    {!loading && !candidates.length && <p className="mt-2 text-xs text-slate-400">Нет завершённых циклов выбранной цепи. Частичные тренировки цикл не завершают.</p>}
    {candidates.map(({player,data})=>{const id=String(player.id),value=selected[id];return <div key={id} className="mt-3 rounded-lg bg-white/5 p-3 text-xs text-slate-300">
      <label className="flex gap-2"><input type="checkbox" disabled={busy || !!recoverable || localConflict} checked={!!value} onChange={event=>{pending.current=null;setMessage('');const checked=event.target.checked;const next={...selectedRef.current};if(checked)next[id]={editor:data.decisionEditor,entries:initial(data.decisionEditor)};else delete next[id];select(next);}}/><CoachAvatar player={player}/><span>{player.name} · цикл {data.decisionEditor.cycleId}</span></label>
      {value?.entries.map((entry,index)=><div key={entry.code} className="mt-2 space-y-2 border-t border-white/10 pt-2"><label className="block">{entry.code} · упражнение<select aria-label={player.name+' '+entry.code+' упражнение'} disabled={busy || !!recoverable || localConflict} value={entry.key} onChange={event=>update(id,index,{key:event.target.value})} className="ml-2 max-w-full rounded bg-slate-900 p-2">{value.editor.rows.filter(row=>row.code===entry.code).map(row=><option key={row.key} value={row.key}>{row.name}</option>)}</select></label>
        <div className="flex flex-wrap gap-2"><select aria-label={player.name+' '+entry.code+' выбор упражнения'} disabled={busy || !!recoverable || localConflict} value={entry.exercise} onChange={event=>update(id,index,{exercise:event.target.value})} className="rounded bg-slate-900 p-2"><option value="keep">Сохранить упражнение</option><option value="rotate">Сменить упражнение</option></select><select aria-label={player.name+' '+entry.code+' прогрессия'} disabled={busy || !!recoverable || localConflict} value={entry.progression} onChange={event=>update(id,index,{progression:event.target.value})} className="rounded bg-slate-900 p-2"><option value="auto">Прогрессия по факту</option><option value="hold">Удержать нагрузку</option></select><select aria-label={player.name+' '+entry.code+' объём'} disabled={busy || !!recoverable || localConflict} value={entry.volume} onChange={event=>update(id,index,{volume:event.target.value})} className="rounded bg-slate-900 p-2"><option value="normal">Обычный объём</option><option value="reduce_one">Минус один подход</option></select></div>
        <input aria-label={player.name+' '+entry.code+' причина решения'} disabled={busy || !!recoverable || localConflict} maxLength={300} value={entry.note} onChange={event=>update(id,index,{note:event.target.value})} placeholder="Индивидуальная причина решения (обязательно)" className="w-full rounded bg-slate-900 p-2"/>
        {entry.volume==='reduce_one' && <input aria-label={player.name+' '+entry.code+' причина снижения объёма'} disabled={busy || !!recoverable || localConflict} maxLength={300} value={entry.volumeReason} onChange={event=>update(id,index,{volumeReason:event.target.value})} placeholder="Причина снижения объёма (обязательно)" className="w-full rounded bg-slate-900 p-2"/>}
      </div>)}
    </div>;})}
    <button type="button" disabled={!valid || busy} onClick={save} className="mt-3 rounded-lg border border-cyan-300/20 px-3 py-2 text-xs text-cyan-200 disabled:opacity-40">{busy?'Сохраняю…':'Сохранить решения выбранных игроков ('+count+')'}</button>
    {count>0 && <button type="button" disabled={busy} onClick={()=>{pending.current=null;select({});setMessage('Перечитываю решения; выберите игроков заново.');onSaved();}} className="ml-3 mt-3 text-xs text-slate-400 underline">Перечитать решения и снять выбор</button>}
    {message && <p role="status" className="mt-2 text-xs text-amber-200">{message}</p>}
  </details>;
}
