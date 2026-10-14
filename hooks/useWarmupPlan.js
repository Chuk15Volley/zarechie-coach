import {useEffect,useRef,useState} from 'react';
import {teamQueueCall} from '../lib/teamQueueClient.mjs';
import {scopedWarmup,warmupScope} from '../lib/coachSimplicity.mjs';
export default function useWarmupPlan({workspace,date,apiKey,enabled}){
 const [record,setRecord]=useState(null),[historyRecord,setHistory]=useState(null),[busy,setBusy]=useState(null),[failure,setFailure]=useState(null),[reload,setReload]=useState(0);
 const scope=warmupScope(workspace,date),latest=useRef(null),epoch=useRef(0),historyEpoch=useRef(0);latest.current={scope,workspace,apiKey};
 async function refreshHistory(){if(!apiKey)return;const id=++historyEpoch.current,ws=workspace;try{const d=await teamQueueCall(apiKey,'/api/warmup/history?workspace='+encodeURIComponent(ws));if(latest.current.workspace===ws && id===historyEpoch.current)setHistory({workspace:ws,dates:d.dates || []});}catch{if(latest.current.workspace===ws && id===historyEpoch.current)setHistory({workspace:ws,dates:[]});}}
 useEffect(()=>{if(enabled)void refreshHistory();return()=>{historyEpoch.current++;};},[workspace,apiKey,enabled]);
 useEffect(()=>{
  const id=++epoch.current,ctrl=new AbortController();if(!enabled || !apiKey)return()=>ctrl.abort();setBusy({scope,kind:'load'});setFailure(null);
  teamQueueCall(apiKey,'/api/warmup/get?'+new URLSearchParams({workspace,date}),{signal:ctrl.signal}).then(d=>{if(d.plan && d.plan.date!==date)throw Error('Получена разминка за другую дату. Повторите загрузку.');if(epoch.current===id && latest.current.scope===scope)setRecord({scope,plan:d.plan || null});}).catch(e=>{if(!ctrl.signal.aborted && epoch.current===id)setFailure({scope,message:e.message});}).finally(()=>{if(epoch.current===id)setBusy(null);});
  return()=>{epoch.current++;ctrl.abort();};
 },[workspace,date,apiKey,enabled,reload]);
 async function generate(){
  if(!apiKey || busy?.scope===scope)return;const id=++epoch.current;setBusy({scope,kind:'generate'});setFailure(null);
  try{const d=await teamQueueCall(apiKey,'/api/warmup/generate',{body:{workspace,date},timeoutMs:120000});if(epoch.current===id && latest.current.scope===scope){setRecord({scope,plan:d.plan});void refreshHistory();}}
  catch(e){if(epoch.current===id && latest.current.scope===scope)setFailure({scope,message:e.message});}
  finally{if(epoch.current===id)setBusy(null);}
 }
 return {plan:scopedWarmup(record,workspace,date),loading:busy?.scope===scope,generating:busy?.scope===scope && busy.kind==='generate',error:failure?.scope===scope?failure.message:'',history:historyRecord?.workspace===workspace?historyRecord.dates:[],generate,refreshHistory,retry:()=>setReload(v=>v+1)};
}
