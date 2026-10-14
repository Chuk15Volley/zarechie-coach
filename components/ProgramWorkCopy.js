import {useEffect,useRef,useState} from 'react';
import {workCopyKey,workCopyBasis,recoverableWorkCopy,WORK_COPY_TTL} from '../lib/editorWorkflow.mjs';
export default function ProgramWorkCopy({context,record,session,onRestore}){
 const key=workCopyKey(context),basis=workCopyBasis(record),[offer,setOffer]=useState(null),[status,setStatus]=useState(''),ready=useRef(false),latest=useRef(null);
 latest.current={session,basis,base:record.session};
 useEffect(()=>{ready.current=false;setOffer(null);try{
  for(const k of Object.keys(localStorage).filter(k=>k.startsWith('gym-program-work-v1:'))){try{const c=JSON.parse(localStorage.getItem(k));if(!c || Date.now()-c.at>WORK_COPY_TTL)localStorage.removeItem(k);}catch{localStorage.removeItem(k);}}
  const copy=JSON.parse(localStorage.getItem(key) || 'null');
  if(recoverableWorkCopy(copy,basis) && JSON.stringify(copy.session)!==JSON.stringify(record.session)){setOffer(copy);setStatus('Есть рабочая копия с этого устройства.');}
  else {if(copy)localStorage.removeItem(key);ready.current=true;setStatus('Правки автоматически сохраняются на этом устройстве на 7 дней.');}
 }catch{ready.current=true;setStatus('Хранилище устройства недоступно. Сохраните черновик на сервере.');}
 // Scope and the exact saved base, not callback identity, control recovery.
 },[key,basis]);
 useEffect(()=>{const flush=()=>{if(!ready.current)return;const value=latest.current;try{
  if(JSON.stringify(value.session)===JSON.stringify(value.base)){localStorage.removeItem(key);return;}
  const copy={basis:value.basis,session:value.session,at:Date.now()};const serialized=JSON.stringify(copy);if(serialized.length>500000)throw Error('size');localStorage.setItem(key,serialized);setStatus('Рабочая копия сохранена на этом устройстве · игроку не выдана.');
 }catch{setStatus('Не удалось сохранить рабочую копию. Сохраните черновик на сервере.');}};
 flush();window.addEventListener('pagehide',flush);return()=>window.removeEventListener('pagehide',flush);
 },[key,basis,session,offer]);
 function resolve(restore){ready.current=true;if(restore)onRestore(offer.session);else try{localStorage.removeItem(key);}catch{}setOffer(null);setStatus(restore?'Рабочая копия восстановлена · проверьте и сохраните программу.':'Рабочая копия удалена с устройства.');}
 return <aside className="coach-work-copy print:hidden" role="status"><span>{status}</span>{offer && <><button type="button" onClick={()=>resolve(true)}>Восстановить правки</button><button type="button" onClick={()=>resolve(false)}>Оставить серверную версию</button></>}</aside>;
}
