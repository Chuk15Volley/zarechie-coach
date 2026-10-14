import {isAuthorized} from '../../../lib/auth';
import {workspaceRoster} from '../../../lib/workspaceRoster';
import {gymSessionDates,loadGymFacts} from '../../../lib/gymLoadStore';
import {playerHistoryFacts,historyNeedsFacts} from '../../../lib/playerHistoryFacts.mjs';
import {validFactPeriod,factTasks} from '../../../lib/factPeriod.mjs';
import {calendarToday} from '../../../lib/coachCalendar.mjs';
export default async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store');
 if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const {workspace,from,to}=req.query;
 if(!['zarechie','nkperf'].includes(workspace) || !validFactPeriod(from,to) || to>calendarToday())return res.status(400).json({error:'Проверьте пространство и период до сегодняшнего дня, не более 366 дней.'});
 try {
  const roster=await workspaceRoster(workspace),entries=[];
  for(const player of roster.players){const dates=await gymSessionDates(workspace,String(player.id),Number(from.replaceAll('-','')),Number(to.replaceAll('-','')));for(const date of dates.filter(date=>date>=from && date<=to))entries.push({playerId:String(player.id),date});}
  if(entries.length>4000)return res.status(422).json({error:'Слишком много занятий для одного обзора. Сократите период.'});
  const facts=await loadGymFacts(workspace,entries),players=roster.players.map(player=>({id:String(player.id),name:player.name,position:player.position || '',completed:0,awaiting:0,missingFields:0,stale:0,sessions:[]})),byId=new Map(players.map(player=>[player.id,player]));
  if(!Array.isArray(facts) || facts.length!==entries.length || facts.some(source=>!source?.record))throw Error('Incomplete facts');
  facts.forEach((source,index)=>{const fact=playerHistoryFacts(source.record,source.rawActual,source.rawLog,source.supplement);if(!fact)return;const player=byId.get(entries[index].playerId);if(fact.completed)player.completed++;else player.awaiting++;
   if(!historyNeedsFacts({factReview:fact}))return;
   const tasks=factTasks(fact);player.missingFields+=tasks.reduce((sum,row)=>sum+row.fields.length,0);if(fact.status==='stale')player.stale++;
   player.sessions.push({trainingType:source.record?.trainingType || null,date:entries[index].date,canConfirm:fact.canConfirm,status:fact.status,missing:fact.missing,rows:tasks.map(({exercise,code,name,fields})=>({exercise,code,name,fields}))});
  });
  for(const player of players)player.sessions.sort((a,b)=>b.date.localeCompare(a.date));
  return res.status(200).json({workspace,from,to,players,rosterSource:roster.source,rosterCache:roster.cache || null,updatedAt:new Date().toISOString()});
 }catch{return res.status(503).json({error:'Не удалось проверить полный состав и факты. Обзор не подтверждён; повторите загрузку.'});}
}
