import {redis,redisPipeline} from './redis';
import {getPlayerSnapshot} from './playerData';
import {teamQueueKey,queuePrefix,TEAM_QUEUE_TTL,parseQueueJSON} from './teamQueue.mjs';
import {readySixPublicationState,readySixPublicationChanges} from './readySixPublication.mjs';
export async function checkTeamPublication(queue,row){
  const key=teamQueueKey(queue.workspace,queue.id),job=parseQueueJSON(await redis('get','coach:batch:'+row.batchId));
  const snapshot=await getPlayerSnapshot(row.playerId,queue.request.days || 7,queue.date,queue.request.focus==='inseason_strength'?28:queue.request.days || 7,queue.workspace);
  const restrictions=parseQueueJSON(await redis('get',queuePrefix(queue.workspace)+':restrictions:'+row.playerId)) || [];
  const current=readySixPublicationState(snapshot,restrictions);
  if(!current)throw Object.assign(new Error('ReadySix временно недоступен. Повторите проверку.'),{status:503});
  const result={...readySixPublicationChanges(job?.readySixState,current,job?.readySixCheck),batchId:row.batchId,checkedAt:new Date().toISOString()};
  const commands=[['HSET',key+':readysix-checks',row.playerId,JSON.stringify(result)],['EXPIRE',key+':readysix-checks',TEAM_QUEUE_TTL]];
  if(result.status!=='unchanged')commands.push(['HSET',key+':reviews',row.playerId,'']);
  await redisPipeline(commands);return result;
}
