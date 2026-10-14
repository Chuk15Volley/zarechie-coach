import {redisPipeline} from './redis';
import {pfx} from './workspacePrefix';
import {gymLoadFacts} from './strengthLoadFacts.mjs';
import {selectGymEdition} from './gymEdition.mjs';
const parse=raw=>{if(!raw)return null;try{return typeof raw==='string'?JSON.parse(raw):raw;}catch{return null;}};
// Read both ReadySix numeric and historical WHOOP aliases, select one program
// edition per date, then join only its own original facts and supplement.
export async function loadGymFacts(workspace,entries){
 const prefix=pfx(workspace),reads=entries.flatMap((entry,index)=>{
  const id=String(entry.playerId),numeric=id.replace(/^whoop_/,''),ids=/^\d+$/.test(numeric)?[...new Set([id,numeric,'whoop_'+numeric])]:[id];
  return ids.map(id=>({index,id,date:entry.date}));
 });
 const raws=[];const commands=reads.flatMap(({id,date})=>['session','session:actual','log','strength:actual-supplement'].map(type=>['GET',`${prefix}:${type}:${id}:${date}`]));
 for(let i=0;i<commands.length;i+=300)raws.push(...await redisPipeline(commands.slice(i,i+300)));
 const candidates=entries.map(()=>[]);
 reads.forEach((read,i)=>{const [record,rawActual,rawLog,supplement]=raws.slice(i*4,i*4+4).map(parse);candidates[read.index].push({record,sourcePlayerId:read.id,rawActual,rawLog,supplement});});
 return candidates.map(items=>{const chosen=selectGymEdition(items);return chosen?{...chosen,...gymLoadFacts(chosen.record,chosen.rawActual,chosen.rawLog,chosen.supplement)}:null;});
}
export async function gymSessionDates(workspace,playerId,start='-inf',end='+inf'){
 const id=String(playerId),numeric=id.replace(/^whoop_/,''),ids=/^\d+$/.test(numeric)?[...new Set([id,numeric,'whoop_'+numeric])]:[id];
 const results=await redisPipeline(ids.map(id=>['ZRANGEBYSCORE',`${pfx(workspace)}:sessions:${id}`,start,end]));
 return [...new Set(results.flatMap(values=>Array.isArray(values)?values:[]))].sort();
}
