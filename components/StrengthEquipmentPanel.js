import {useEffect,useRef,useState} from 'react';
import {STRENGTH_EQUIPMENT,STRENGTH_COHORT_EXPERIENCE} from '../lib/strengthEquipment.mjs';
import {inventorySetupFromSaved,strengthInventorySetup,strengthWeightRange,parseStrengthWeightList} from '../lib/strengthInventorySetup.mjs';
import {teamQueueCall} from '../lib/teamQueueClient.mjs';
import useCoachEdits from '../hooks/useCoachEdits';
import CoachEditsRecovery from './CoachEditsRecovery';
const initial=()=>inventorySetupFromSaved({},{}),kg=value=>Number(value).toLocaleString('ru-RU',{maximumFractionDigits:3});
export default function StrengthEquipmentPanel({workspace,apiKey}){
 const [setup,setSetup]=useState(initial),[saved,setSaved]=useState(null),[status,setStatus]=useState('Загрузка…'),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[notice,setNotice]=useState('');
 const pending=useRef(null),alive=useRef(true),saveController=useRef(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;saveController.current?.abort();};},[]);
 const dirty=!!saved && JSON.stringify(setup)!==JSON.stringify(inventorySetupFromSaved(saved.equipment,saved.settings));
 const draft=useCoachEdits({storageKey:'gym:strength-inventory-edits:v1:'+workspace,baseRevision:saved?.fingerprint || null,value:{setup},dirty,onRestore:value=>{if(value.setup && typeof value.setup==='object'){setSetup(value.setup);pending.current=null;}}});
 useEffect(()=>{const controller=new AbortController();setSaved(null);setSetup(initial());setStatus('Загрузка…');pending.current=null;
  teamQueueCall(apiKey,'/api/players/strength-equipment?workspace='+workspace,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted){setSaved(data);setSetup(inventorySetupFromSaved(data.equipment,data.settings));setStatus('');draft.reload();}}).catch(error=>{if(!controller.signal.aborted)setStatus(error.message);});return()=>controller.abort();
 },[workspace,apiKey,reload]);
 const normalized=strengthInventorySetup(setup),locked=busy || !saved || !!draft.recovered || draft.conflict;
 const change=(key,patch)=>{pending.current=null;setSetup(previous=>({...previous,[key]:{...previous[key],...patch}}));setStatus('');};
 async function save(){if(locked || normalized.error)return;setBusy(true);setStatus('');pending.current ||= {workspace,setup,fingerprint:saved.fingerprint,requestId:crypto.randomUUID()};saveController.current=new AbortController();
  try{await teamQueueCall(apiKey,'/api/players/strength-equipment',{body:pending.current,signal:saveController.current.signal});if(alive.current){draft.clear();pending.current=null;setNotice('Сохранено для всех игроков пространства. Обновите ранее созданные силовые черновики перед публикацией.');setReload(value=>value+1);window.dispatchEvent(new CustomEvent('gym-strength-inventory-updated',{detail:{workspace}}));}}
  catch(error){if(alive.current)setStatus(error.message);}finally{if(alive.current)setBusy(false);}
 }
 return <details className="mb-4 rounded-2xl border border-white/10 p-4 print:hidden"><summary className="cursor-pointer text-sm font-bold text-slate-300">Инвентарь силовой · {workspace==='nkperf'?'NK Performance':'Заречье'} · все игроки<span className="mt-1 block text-xs font-normal text-slate-500">{STRENGTH_COHORT_EXPERIENCE.label} · настройка один раз</span></summary>
  <p className="mt-2 text-xs text-slate-400">Заполните один раз для всех игроков этого пространства. Силовой стаж: 5+ лет · подтверждено тренером. Укажите реальные доступные веса: список или минимум, шаг и максимум. Гантели и гири — вес одного снаряда; штанга и трэп-гриф — общий вес с грифом. Пустой список оставляет подбор по истории и RPE без автоматической прибавки.</p>
  <CoachEditsRecovery draft={draft}/><div className="mt-3 grid gap-3 lg:grid-cols-2">{Object.entries(STRENGTH_EQUIPMENT).map(([key,label])=>{const row=setup[key] || {mode:'list',values:''},range=row.mode==='range'?strengthWeightRange(row):null,list=row.mode==='range'?range.weights:parseStrengthWeightList(row.values),weights=(list || []).filter(value=>Number.isFinite(value) && value>0);return <fieldset key={key} disabled={locked} className="rounded-xl border border-white/10 p-3 text-xs text-slate-300"><legend className="px-1 font-bold">{label}</legend>
   <label>Способ ввода<select aria-label={label+' · способ ввода'} value={row.mode} onChange={event=>change(key,{mode:event.target.value})} className="ml-2 rounded bg-slate-900 p-2"><option value="list">Список весов</option><option value="range">Диапазон с шагом</option></select></label>
   {row.mode==='range'?<div className="mt-2 grid grid-cols-3 gap-2">{[['min','Минимум'],['step','Шаг'],['max','Максимум']].map(([field,name])=><label key={field}>{name}, кг<input inputMode="decimal" aria-label={label+' · '+name} value={row[field] ?? ''} onChange={event=>change(key,{[field]:event.target.value})} className="mt-1 w-full rounded border border-white/10 bg-black/20 p-2"/></label>)}</div>:<label className="mt-2 block">Веса через точку с запятой<input aria-label={label} value={row.values || ''} onChange={event=>change(key,{values:event.target.value})} placeholder="20; 22,5; 25" className="mt-1 w-full rounded border border-white/10 bg-black/20 p-2"/></label>}
   {range?.error && <p role="alert" className="mt-2 text-amber-200">{range.error}</p>}
   {weights.length>0 && <p className="mt-2 text-slate-400">{[...new Set(weights)].length} доступных весов · {kg(Math.min(...weights))}–{kg(Math.max(...weights))} кг{row.mode==='range'?' · шаг '+kg(Number(String(row.step).replace(',','.')))+' кг':''}</p>}
   {row.mode==='list' && weights.length===1 && ['barbell','trap_bar'].includes(key) && <p className="mt-2 text-amber-200">Сейчас {kg(weights[0])} кг — единственный доступный вес, а не максимум. Если это предел, выберите диапазон и укажите минимум и шаг.</p>}
   {weights.length>0 && <details className="mt-2"><summary className="cursor-pointer text-cyan-200">Проверить все доступные веса</summary><p className="mt-2 break-words text-slate-300">{[...new Set(weights)].sort((a,b)=>a-b).map(kg).join('; ')} кг</p></details>}
  </fieldset>;})}</div>
  {normalized.error && saved && <p role="alert" className="mt-3 text-xs text-amber-200">{normalized.error}</p>}
  <button type="button" disabled={locked || !!normalized.error || !dirty} onClick={save} className="mt-3 rounded-lg bg-accent/15 px-3 py-2 text-xs font-bold text-accent disabled:opacity-40">{busy?'Сохранение…':'Сохранить инвентарь'}</button><button type="button" disabled={busy} onClick={()=>setReload(value=>value+1)} className="ml-3 text-xs text-slate-400 underline">Перечитать настройки</button>
  {notice && <p role="status" className="mt-2 text-xs text-emerald-200">{notice}</p>}{status && <p role="status" className="mt-2 text-xs text-slate-400">{status}</p>}{saved?.savedAt && <p className="mt-2 text-xs text-slate-500">Подтверждено {new Date(saved.savedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})}.</p>}
 </details>;
}
