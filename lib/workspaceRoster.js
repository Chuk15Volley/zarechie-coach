import {redis,redisPipeline} from './redis';
import {rosterKey,pfx} from './workspacePrefix';
import {usesReadySix} from './readySixClient';
import {getCachedReadySixRoster} from './readySixRosterCache';
import {normalizeReadySixRoster} from './readySixSnapshotAdapter';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(new Date());
// Membership always comes from ReadySix on bridged spaces. A temporary bridge
// failure must never quietly replace today's roster with an old local subset.
export async function workspaceRoster(workspace,{date=today(),refresh=false}={}){
 if(!['zarechie','nkperf'].includes(workspace))throw Object.assign(new Error('Некорректное пространство'),{status:400});
 if(usesReadySix(workspace)){
  const result=await getCachedReadySixRoster(workspace,date,{refresh});
  return {players:normalizeReadySixRoster(result.payload),source:'readysix',cache:result.cache,cacheAgeMs:Math.round(result.ageMs),organizationId:result.payload.organizationId,revision:result.payload.revision};
 }
 const raw=await redis('get',rosterKey(workspace)),rows=raw?typeof raw==='string'?JSON.parse(raw):raw:[];
 return {players:(Array.isArray(rows)?rows:[]).filter(player=>player?.id).map(player=>({...player,id:String(player.id)})),source:'legacy'};
}
export const gymIdentityAliases=id=>{id=String(id);const numeric=id.replace(/^whoop_/,'');return /^\d+$/.test(numeric)?[...new Set([id,numeric,'whoop_'+numeric])]:[id];};
export async function rosterLastPlans(workspace,players){
 const reads=players.flatMap((player,index)=>gymIdentityAliases(player.id).map(id=>({index,id}))),rows=await redisPipeline(reads.map(({id})=>['ZREVRANGE',`${pfx(workspace)}:sessions:${id}`,0,0]));
 const dates=players.map(()=>null);reads.forEach((read,i)=>{const date=Array.isArray(rows[i])?rows[i][0]:null;if(date && (!dates[read.index] || date>dates[read.index]))dates[read.index]=date;});return dates;
}
