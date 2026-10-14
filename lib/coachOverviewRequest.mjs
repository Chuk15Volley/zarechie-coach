export async function overviewJson(url,{apiKey,signal,body}={}){
 const response=await fetch(url,{method:body?'POST':'GET',headers:{'x-api-key':apiKey,...body?{'Content-Type':'application/json'}:{}},signal,...body?{body:JSON.stringify(body)}:{}});
 const data=await response.json();if(!response.ok)throw Error(data.error || `Данные недоступны (${response.status})`);return data;
}
export async function requestDailyOverview({apiKey,workspace,date,playerIds,signal,refresh=false}){
 const readiness=await overviewJson(`/api/team/readiness?${new URLSearchParams({workspace,date,...refresh?{refresh:'1'}:{}})}`,{apiKey,signal});
 if(!Array.isArray(readiness.players))throw Error('Состояние ReadySix не получено');
 const status=await overviewJson('/api/programs/team-status',{apiKey,signal,body:{workspace,date,playerIds,readinessPlayers:readiness.players}});
 if(!status.status || typeof status.status!=='object' || Array.isArray(status.status) || (playerIds || []).some(id=>!Object.hasOwn(status.status,String(id)) || typeof status.status[String(id)]?.hasSession!=='boolean'))throw Error('Статус программ получен не полностью');
 return {readiness,status:status.status};
}
