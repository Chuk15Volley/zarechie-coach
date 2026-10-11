import {useEffect,useState} from 'react';
import {COMMON_PLAYER_TIME_ZONES,playerLocalClock,playerTimeZoneLabel} from '../lib/playerTimeZone.mjs';
export default function PlayerTimeZoneControl({playerId,timeZone,apiKey,disabled,onChange}){
 const [draft,setDraft]=useState(timeZone),[saving,setSaving]=useState(false),[error,setError]=useState(''),[now,setNow]=useState(null),[zones,setZones]=useState([]);
 useEffect(()=>{setDraft(timeZone);setError('');},[playerId,timeZone]);
 useEffect(()=>{const tick=()=>setNow(new Date());tick();const timer=setInterval(tick,30000);setZones(typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('timeZone'):[]);return()=>clearInterval(timer);},[]);
 async function save(){setSaving(true);setError('');try{
  const response=await fetch('/api/players/time-zone',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey},body:JSON.stringify({workspace:'nkperf',playerId,timeZone:draft})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось сохранить часовой пояс.');onChange(data.timeZone);
 }catch(e){setError(e.message);}finally{setSaving(false);}}
 const common=new Set(COMMON_PLAYER_TIME_ZONES.map(([zone])=>zone));
 return <div className="my-3 rounded-xl border border-white/10 bg-black/20 p-3">
  <label className="text-xs font-bold text-slate-400" htmlFor="player-time-zone">Часовой пояс игрока</label>
  <div className="mt-2 flex flex-wrap items-center gap-2">
   <select id="player-time-zone" aria-label="Часовой пояс игрока" value={draft} onChange={e=>setDraft(e.target.value)} disabled={disabled||saving} className="min-h-10 max-w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white">
    {COMMON_PLAYER_TIME_ZONES.map(([zone,label])=><option key={zone} value={zone}>{label} — {zone}</option>)}
    {!common.has(draft)&&!zones.includes(draft)&&<option value={draft}>{draft}</option>}
    {zones.filter(zone=>!common.has(zone)).map(zone=><option key={zone} value={zone}>{zone.replaceAll('_',' ')}</option>)}
   </select>
   <button type="button" onClick={save} disabled={disabled||saving||draft===timeZone} className="min-h-10 rounded-lg bg-cyan-300 px-3 text-xs font-bold text-slate-950 disabled:opacity-40">{saving?'Сохраняю…':'Сохранить часовой пояс'}</button>
   {now&&<span className="text-xs text-slate-300">У игрока {playerLocalClock(timeZone,now)} · {playerTimeZoneLabel(timeZone,now)}</span>}
  </div>
  <p className="mt-2 text-xs text-slate-500">«Сегодня» и даты планирования — по времени игрока. Даты сохранённых программ не меняются.</p>
  {error&&<p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
 </div>;
}
