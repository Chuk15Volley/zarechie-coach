import {redisPipeline} from './redis';
import {pfx} from './workspacePrefix';
import {gymLoadFacts} from './strengthLoadFacts.mjs';
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
 const result=entries.map(()=>null);
 reads.forEach((read,i)=>{const [record,actual,log,supplement]=raws.slice(i*4,i*4+4).map(parse);if(!record?.session?.blocks)return;const old=result[read.index];if(old && String(old.record.savedAt || old.record.generatedAt || '')>=String(record.savedAt || record.generatedAt || ''))return;result[read.index]={record,sourcePlayerId:read.id,...gymLoadFacts(record,actual,log,supplement)};});
 return result;
}
export async function gymSessionDates(workspace,playerId,start='-inf',end='+inf'){
 const id=String(playerId),numeric=id.replace(/^whoop_/,''),ids=/^\d+$/.test(numeric)?[...new Set([id,numeric,'whoop_'+numeric])]:[id];
 const results=await redisPipeline(ids.map(id=>['ZRANGEBYSCORE',`${pfx(workspace)}:sessions:${id}`,start,end]));
 return [...new Set(results.flatMap(values=>Array.isArray(values)?values:[]))].sort();
}
