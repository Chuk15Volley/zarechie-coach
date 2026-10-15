import {useEffect,useState} from 'react';
import {techniqueSignature} from '../lib/coachAuditPresentation.mjs';
import {teamQueueCall} from '../lib/teamQueueClient.mjs';
const cache=new Map(),listeners=new Map(),pending=[];let active=0;
const keyFor=(apiKey,card)=>JSON.stringify([apiKey,techniqueSignature(card)]);
function publish(key,value){if(cache.size>256)for(const old of cache.keys()){if(!listeners.has(old) && !cache.get(old)?.loading)cache.delete(old);if(cache.size<=192)break;}cache.set(key,{...value,at:Date.now()});for(const fn of listeners.get(key) || [])fn();}
function drain(){while(active<2 && pending.length){const task=pending.shift();active++;task().finally(()=>{active--;drain();});}}
export function rememberTechniqueReview(apiKey,card,data){publish(keyFor(apiKey,card),data?{data}:{error:true});}
export function useTechniqueReview(apiKey,card){
 const signature=techniqueSignature(card),key=keyFor(apiKey,card),[,update]=useState(0);
 useEffect(()=>{if(!apiKey || !card?.canonicalId)return;const fn=()=>update(v=>v+1);let set=listeners.get(key);if(!set){set=new Set();listeners.set(key,set);}set.add(fn);
 const existing=cache.get(key);if(!existing || !existing.loading && Date.now()-existing.at>60000){publish(key,{loading:true});pending.push(async()=>{try{const data=await teamQueueCall(apiKey,'/api/exercises/technique-review?'+new URLSearchParams({id:card.canonicalId,signature}),{timeoutMs:20000});if(cache.get(key)?.loading)publish(key,{data});}catch{if(cache.get(key)?.loading)publish(key,{error:true});}});drain();}
 return()=>{set.delete(fn);if(!set.size)listeners.delete(key);};},[apiKey,key,signature,card?.canonicalId]);
 return apiKey?cache.get(key) || {loading:true}:{error:true};
}
export function techniqueStatusText(state,card,compact=false){
 if(state.error)return 'Проверенность недоступна';
 if(state.loading || !state.data)return 'Проверенность: загружается…';
 const {checks={}}=state.data;
 if(compact)return `Описание ${checks.description?.verified?'✓':'—'} · Видео ${!(card.video || card.autoVideo)?'нет':checks.video?.verified?'✓':'—'}`;
 return `Описание: ${checks.description?.verified?'проверено':'не проверено'} · Видео: ${!(card.video || card.autoVideo)?'нет':checks.video?.verified?'проверено':'не проверено'}`;
}
export default function TechniqueStatus({card,apiKey,compact=false}){const state=useTechniqueReview(apiKey,card);return compact?<small className="coach-technique-status" title={techniqueStatusText(state,card)} aria-label={techniqueStatusText(state,card)} role="status">{techniqueStatusText(state,card,true)}</small>:<small className="coach-technique-status" role="status">{techniqueStatusText(state,card)}</small>;}
