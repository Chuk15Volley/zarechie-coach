import {useEffect,useRef,useState} from 'react';
export async function teamQueueCall(apiKey,path,{body,signal}={}) {
  const response=await fetch(path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-api-key':apiKey},body:body?JSON.stringify(body):undefined,signal});
  const data=await response.json();
  if(!response.ok){const error=new Error(data.error || 'Не удалось загрузить очередь');error.queue=data.queue;error.status=response.status;throw error;}
  return data;
}
const hintKey=workspace=>'gym:team-queue-view:v1:'+workspace;
export default function useTeamGenerationQueue({workspace,date,apiKey,onRestoreDate}) {
  const [queue,setQueue]=useState(null),[results,setResults]=useState([]),[recovering,setRecovering]=useState(false),[error,setError]=useState('');
  const queueRef=useRef(null),viewRef=useRef({workspace,date}),restored=useRef(new Set()),controllerRef=useRef(null);
  viewRef.current={workspace,date};
  const active=view=>view?.workspace===viewRef.current.workspace && view?.date===viewRef.current.date;
  function apply(next){queueRef.current=next;setQueue(next);setResults(next?.rows || []);if(next)try{localStorage.setItem(hintKey(next.workspace),JSON.stringify({id:next.id,date:next.date}));}catch{}}
  async function load(id,signal){return (await teamQueueCall(apiKey,'/api/programs/team-queue?workspace='+workspace+(id?'&queueId='+encodeURIComponent(id):'&date='+date),{signal})).queue;}
  useEffect(()=>{
    const controller=new AbortController();controllerRef.current=controller;apply(null);setError('');setRecovering(true);let timer;
    async function poll(){
      try{
        let hint;
        if(!restored.current.has(workspace) && !new URLSearchParams(window.location.search).has('assignedDate')){restored.current.add(workspace);try{hint=JSON.parse(localStorage.getItem(hintKey(workspace)));}catch{}}
        if(hint?.id && hint.date!==date){let previous;try{previous=await load(hint.id,controller.signal);}catch(failure){if(failure.status!==404)throw failure;}if(previous && !controller.signal.aborted){onRestoreDate(previous.date);return;}}
        const next=await load(queueRef.current?.id,controller.signal);
        if(!controller.signal.aborted){apply(next);setError('');}
      }catch(failure){if(!controller.signal.aborted)setError(failure.message);}
      finally{if(!controller.signal.aborted){setRecovering(false);timer=setTimeout(poll,document.hidden?60000:queueRef.current?.state==='running' && queueRef.current?.rows.some(row=>['queued','generating'].includes(row.status))?10000:30000);}}
    }
    if(apiKey)void poll();else setRecovering(false);return()=>{controller.abort();clearTimeout(timer);if(controllerRef.current===controller)controllerRef.current=null;};
  },[workspace,date,apiKey]);
  async function refresh(){const view={workspace,date};try{const next=await load(queueRef.current?.id);if(active(view))apply(next);}catch(failure){if(active(view))setError(failure.message);}}
  async function action(name,extra={}){
    const current=queueRef.current;if(!current || recovering)return;
    setRecovering(true);setError('');
    try{const data=await teamQueueCall(apiKey,'/api/programs/team-queue',{body:{action:name,workspace:current.workspace,queueId:current.id,...extra}});if(active(current))apply(data.queue);}
    catch(failure){if(active(current))setError(failure.message);}finally{if(active(current))setRecovering(false);}
  }
  async function start(players,request){if(recovering)return;setRecovering(true);setError('');try{const data=await teamQueueCall(apiKey,'/api/programs/team-queue',{body:{action:'create',request,players}});if(active(request))apply(data.queue);}catch(failure){if(active(request)){setError(failure.message);if(active(failure.queue))apply(failure.queue);}}finally{if(active(request))setRecovering(false);}}
  async function retry(){const current=queueRef.current;if(!current || recovering)return;setRecovering(true);try{for(const row of current.rows.filter(row=>row.status==='error')){const data=await teamQueueCall(apiKey,'/api/programs/team-queue',{body:{action:'retry',workspace:current.workspace,queueId:current.id,playerId:row.playerId,batchId:row.batchId}});if(!active(current))return;apply(data.queue);}setError('');}catch(failure){if(active(current))setError(failure.message);}finally{if(active(current))setRecovering(false);}}
  const running=queue?.state==='running' && results.some(row=>['queued','generating'].includes(row.status));
  return {queue,results,setResults,running,recovering,error,start,retry,review:(row,reviewed)=>action('review',{playerId:row.playerId,batchId:row.batchId,reviewed}),refresh,resume:()=>action('resume'),pause:()=>action('pause'),cancel:()=>action('cancel'),publish:()=>action('publish'),controllerRef};
}
