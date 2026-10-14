import {useEffect,useRef,useState} from 'react';
import {teamQueueCall,queueResponseGate} from '../lib/teamQueueClient.mjs';
export {teamQueueCall} from '../lib/teamQueueClient.mjs';
const hintKey=workspace=>'gym:team-queue-view:v1:'+workspace;
export default function useTeamGenerationQueue({workspace,date,apiKey}) {
  const [queue,setQueue]=useState(null),[results,setResults]=useState([]),[recovering,setRecovering]=useState(false),[error,setError]=useState(''),[previousQueue,setPreviousQueue]=useState(null);
  const queueRef=useRef(null),scope=useRef(null),restored=useRef(new Set()),controllerRef=useRef(null);
  function apply(next){
    if(next && queueRef.current?.id===next.id && next.revision<queueRef.current.revision)return;
    queueRef.current=next;setQueue(next);setResults(next?.rows || []);
    if(next)try{localStorage.setItem(hintKey(next.workspace),JSON.stringify({id:next.id,date:next.date,revision:next.revision}));}catch{}
  }
  useEffect(()=>{
    const gate=queueResponseGate(),controller=new AbortController();let timer;
    const current={gate,controller,workspace,date};scope.current=current;controllerRef.current=controller;
    apply(null);setPreviousQueue(null);setError('');setRecovering(true);
    async function read(id){return (await teamQueueCall(apiKey,'/api/programs/team-queue?workspace='+workspace+(id?'&queueId='+encodeURIComponent(id):'&date='+date),{signal:controller.signal})).queue;}
    async function poll(){
      if(gate.busy)return;
      const token=gate.read();
      try{
        let hint;
        if(!restored.current.has(workspace) && !new URLSearchParams(window.location.search).has('assignedDate')){restored.current.add(workspace);try{hint=JSON.parse(localStorage.getItem(hintKey(workspace)));}catch{}}
        if(hint?.id && hint.date!==date){let previous;try{previous=await read(hint.id);}catch(failure){if(failure.status!==404)throw failure;}if(previous && gate.accept(token))setPreviousQueue({id:previous.id,date:previous.date,workspace});}
        const next=await read(); // Always follow the latest queue for this date, including another tab's creation.
        if(gate.accept(token)){apply(next);setError('');}
      }catch(failure){if(gate.accept(token))setError(failure.message);}
      finally{if(gate.accept(token))setRecovering(false);}
    }
    current.poll=poll;
    const schedule=()=>{if(!controller.signal.aborted){void poll().finally(()=>{timer=setTimeout(schedule,document.hidden?60000:10000);});}};
    const wake=event=>{if(event.key===hintKey(workspace))void poll();};
    window.addEventListener('storage',wake);
    if(apiKey)schedule();else setRecovering(false);
    return()=>{gate.close();controller.abort();clearTimeout(timer);window.removeEventListener('storage',wake);if(scope.current===current)scope.current=null;};
  },[workspace,date,apiKey]);
  async function mutate(makeBody){
    const current=scope.current,token=current?.gate.begin();if(token==null)return;
    setRecovering(true);setError('');
    try{
      const bodies=makeBody(queueRef.current);if(!bodies)return;
      let response;
      for(const body of bodies){
        const latest=queueRef.current;
        const data=await teamQueueCall(apiKey,'/api/programs/team-queue',{signal:current.controller.signal,body:{...body,...(body.action==='create'?{}:{expectedRevision:latest?.revision})}});
        if(!current.gate.owns(token))return;apply(data.queue);response=data;
      }
      return response;
    }catch(failure){if(current.gate.owns(token)){if(failure.queue)apply(failure.queue);setError(failure.message);}return {error:failure.message};}
    finally{current.gate.finish(token);if(scope.current===current)setRecovering(false);}
  }
  const action=(name,extra={})=>mutate(current=>current?[{action:name,workspace:current.workspace,queueId:current.id,...extra}]:null);
  const running=queue?.state==='running' && results.some(row=>['queued','generating'].includes(row.status));
  return {queue,results,setResults,running,recovering,error,previousQueue,
    start:(players,request)=>mutate(current=>[{action:'create',request,players,expectedLatestId:current?.id || null,expectedRevision:current?.revision || 0}]),
    retry:()=>mutate(current=>current?.rows.filter(row=>row.status==='error').map(row=>({action:'retry',workspace:current.workspace,queueId:current.id,playerId:row.playerId,batchId:row.batchId}))),
    refreshPlayer:row=>action('refresh-player',{playerId:row.playerId,batchId:row.batchId}),
    saveDraft:(row,session,expectedDraftVersion)=>action('save-draft',{playerId:row.playerId,batchId:row.batchId,session,expectedDraftVersion}),
    review:(row,reviewed)=>action('review',{playerId:row.playerId,batchId:row.batchId,reviewed}),
    refresh:()=>scope.current?.poll(),resume:()=>action('resume'),pause:()=>action('pause'),cancel:()=>action('cancel'),checkPublication:()=>action('check-publication'),publish:()=>action('publish'),controllerRef};
}
