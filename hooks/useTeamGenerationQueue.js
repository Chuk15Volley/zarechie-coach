import {useEffect,useRef,useState} from 'react';
import {runTeamGeneration} from '../lib/teamGenerationClient.mjs';

export async function teamQueueCall(apiKey,path,{body,signal}={}) {
  const response=await fetch(path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-api-key':apiKey},body:body?JSON.stringify(body):undefined,signal});
  const data=await response.json();
  if(!response.ok){const error=new Error(data.error || 'Не удалось загрузить очередь');error.queue=data.queue;error.status=response.status;throw error;}
  return data;
}
const hintKey=workspace=>'gym:team-queue-view:v1:'+workspace;
function remember(queue){try{localStorage.setItem(hintKey(queue.workspace),JSON.stringify({id:queue.id,date:queue.date}));}catch{}}
export default function useTeamGenerationQueue({workspace,date,apiKey,onRestoreDate}) {
  const [queue,setQueue]=useState(null),[results,setResults]=useState([]),[running,setRunning]=useState(false),[recovering,setRecovering]=useState(false),[error,setError]=useState('');
  const controllerRef=useRef(null),queueRef=useRef(null),restored=useRef(new Set());
  queueRef.current=queue;
  const viewRef=useRef({workspace,date});viewRef.current={workspace,date};
  const active=current=>current?.workspace===viewRef.current.workspace && current?.date===viewRef.current.date;
  function apply(next){setQueue(next);queueRef.current=next;setResults(next?.rows || []);if(next)remember(next);}
  async function load(id,signal){const data=await teamQueueCall(apiKey,'/api/programs/team-queue?workspace='+workspace+(id?'&queueId='+encodeURIComponent(id):'&date='+date),{signal});return data.queue;}
  async function report(current,row,code){try{await teamQueueCall(apiKey,'/api/programs/generation-monitor',{body:{workspace:current.workspace,queueId:current.id,batchId:row.batchId,code}});}catch{}}
  async function execute(current,selected=current.rows.filter(row=>['queued','generating'].includes(row.status)),existingController=null){
    if(!active(current) || (controllerRef.current && controllerRef.current!==existingController))return;
    if(!selected.length)return;
    const controller=existingController || new AbortController();controllerRef.current=controller;setRunning(true);
    const failed=new Set(),interrupted=new Set();
    try{
      await runTeamGeneration(selected.map(row=>({id:row.playerId})),{request:{...current.request,teamQueueId:current.id},apiKey,signal:controller.signal,
        onUpdate:(id,patch)=>{if(controller.signal.aborted || !active(current))return;setResults(previous=>previous.map(row=>row.playerId===id?{...row,...patch}:row));
          const row=current.rows.find(row=>row.playerId===id);
          if(patch.transient && row){interrupted.add(id);void report(current,row,patch.transient);}
          if(patch.status==='done' && interrupted.has(id) && row)void report(current,row,'RECOVERED');
          if(patch.status==='error'){failed.add(id);if(row && ['NETWORK_INTERRUPTED','POLL_TIMEOUT'].includes(patch.errorCode))void report(current,row,patch.errorCode);}
        }});
      if(!controller.signal.aborted){const next=await load(current.id,controller.signal);if(!controller.signal.aborted && active(current)){setQueue(next);queueRef.current=next;setResults(previous=>next.rows.map(row=>failed.has(row.playerId) && row.status!=='done'?previous.find(old=>old.playerId===row.playerId) || row:row));}}
    }catch(failure){if(!controller.signal.aborted && active(current))setError(failure.message);}
    finally{if(controllerRef.current===controller){controllerRef.current=null;setRunning(false);}}
  }
  useEffect(()=>{
    controllerRef.current?.abort();controllerRef.current=null;apply(null);setRunning(false);setRecovering(false);setError('');
    if(!apiKey)return;
    const controller=new AbortController();setRecovering(true);
    (async()=>{
      let hint=null;
      if(!restored.current.has(workspace) && !new URLSearchParams(window.location.search).has('assignedDate')){restored.current.add(workspace);try{hint=JSON.parse(localStorage.getItem(hintKey(workspace)));}catch{}}
      let next;
      if(hint?.id && hint.date!==date){
        try{next=await load(hint.id,controller.signal);}catch(failure){if(failure.status!==404)throw failure;}
        if(next && next.date!==date){if(!controller.signal.aborted)onRestoreDate(next.date);return;}
      }
      next=await load(null,controller.signal);
      if(controller.signal.aborted)return;apply(next);setRecovering(false);
      if(next)await execute(next,next.rows.filter(row=>['queued','generating'].includes(row.status)));
    })().catch(failure=>{if(!controller.signal.aborted)setError(failure.message);}).finally(()=>{if(!controller.signal.aborted)setRecovering(false);});
    return()=>{controller.abort();controllerRef.current?.abort();};
  },[workspace,date,apiKey]);
  async function refresh(){if(running || recovering)return;const view={workspace,date};setRecovering(true);setError('');try{const next=await load(queueRef.current?.id);if(active(view))apply(next);}catch(failure){if(active(view))setError(failure.message);}finally{if(active(view))setRecovering(false);}}
  async function start(players,request){
    if(controllerRef.current || recovering)return;
    const controller=new AbortController();controllerRef.current=controller;setRunning(true);setError('');
    try{
      const data=await teamQueueCall(apiKey,'/api/programs/team-queue',{body:{action:'create',request,players},signal:controller.signal});
      if(controller.signal.aborted || !active(data.queue))return;apply(data.queue);await execute(data.queue,data.queue.rows,controller);
    }catch(failure){if(!controller.signal.aborted && active(request)){setError(failure.message);if(active(failure.queue))apply(failure.queue);}}
    finally{if(controllerRef.current===controller){controllerRef.current=null;setRunning(false);}}
  }
  async function retry(){
    if(running || recovering || !queueRef.current)return;
    const current=queueRef.current,failed=results.filter(row=>row.status==='error');
    if(!failed.length){await execute(current);return;}
    setRecovering(true);setError('');
    try{let next=current;for(const row of failed){const data=await teamQueueCall(apiKey,'/api/programs/team-queue',{body:{action:'retry',workspace:current.workspace,queueId:current.id,playerId:row.playerId,batchId:row.batchId}});next=data.queue;if(!active(next))return;}
      if(!active(next))return;apply(next);await execute(next,next.rows.filter(row=>failed.some(old=>old.playerId===row.playerId) && row.status!=='done'));
    }catch(failure){if(active(current))setError(failure.message);}finally{if(active(current))setRecovering(false);}
  }
  async function review(row,reviewed){const current=queueRef.current;if(!current)return;try{const data=await teamQueueCall(apiKey,'/api/programs/team-queue',{body:{action:'review',workspace:current.workspace,queueId:current.id,playerId:row.playerId,batchId:row.batchId,reviewed}});if(active(data.queue))apply(data.queue);}catch(failure){if(active(current))setError(failure.message);}}
  return {queue,results,setResults,running,recovering,error,start,retry,review,refresh,resume:()=>queueRef.current && execute(queueRef.current),controllerRef};
}
