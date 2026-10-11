import {redis,redisPipeline} from './redis';
import {playerTimeZone,DEFAULT_PLAYER_TIME_ZONE} from './playerTimeZone.mjs';
export const playerTimeZoneKey=(workspace,playerId)=>`${workspace==='nkperf'?'nkperf':'coach'}:player:time_zone:${String(playerId).replace(/^whoop_/,'')}`;
function configuredZone(raw,fallback){
 try{const record=typeof raw==='string'?JSON.parse(raw):raw;return playerTimeZone(record?.timeZone||fallback);}catch{return playerTimeZone(fallback);}
}
export async function getPlayerTimeZone(playerId,workspace='zarechie'){
 if(workspace!=='nkperf')return DEFAULT_PLAYER_TIME_ZONE;
 return configuredZone(await redis('get',playerTimeZoneKey(workspace,playerId)),DEFAULT_PLAYER_TIME_ZONE);
}
export async function hydratePlayerTimeZones(players,workspace){
 if(workspace!=='nkperf')return players.map(p=>({...p,timeZone:DEFAULT_PLAYER_TIME_ZONE}));
 if(!players.length)return players;
 const records=await redisPipeline(players.map(p=>['get',playerTimeZoneKey(workspace,p.id)]));
 return players.map((p,i)=>({...p,timeZone:configuredZone(records[i],p.timeZone||p.timezone)}));
}
