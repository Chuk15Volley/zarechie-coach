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
  if(queue.request.focus==='inseason_strength'){const actualKey=queuePrefix(queue.workspace)+':strength:actual-updated:'+String(row.playerId).replace(/^whoop_/,''),actualVersion=await redis('get',actualKey),updated=parseQueueJSON(actualVersion);result.actualKey=actualKey;result.actualVersion=actualVersion || '';
    if(updated && Date.parse(updated.savedAt)>=Date.parse(job?.strengthFactsStartedAt || job?.submittedAt || job?.generatedAt || job?.completedAt || queue.createdAt)){result.status='changed';result.changes=[...(result.changes || []),'Фактические результаты силовой'];result.message='После генерации дополнены фактические результаты. Обновите черновик игрока, затем проверьте ReadySix и программу заново.';}
  }
  if(queue.request.focus==='inseason_strength'){
    const inventoryKey=queuePrefix(queue.workspace)+':strength:equipment-updated',inventoryVersion=await redis('get',inventoryKey),updated=parseQueueJSON(inventoryVersion);result.inventoryKey=inventoryKey;result.inventoryVersion=inventoryVersion || '';
    if(updated && Date.parse(updated.savedAt)>=Date.parse(job?.strengthFactsStartedAt || job?.submittedAt || job?.generatedAt || job?.completedAt || queue.createdAt)){result.status='changed';result.changes=[...(result.changes || []),'Доступные веса инвентаря'];result.message='После генерации изменён инвентарь. Обновите черновик игрока, затем проверьте ReadySix и программу заново.';}
  }
  const commands=[['HSET',key+':readysix-checks',row.playerId,JSON.stringify(result)],['EXPIRE',key+':readysix-checks',TEAM_QUEUE_TTL]];
  if(result.status!=='unchanged')commands.push(['HSET',key+':reviews',row.playerId,'']);
  await redisPipeline(commands);return result;
}
