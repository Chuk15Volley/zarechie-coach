import crypto from 'node:crypto';
import {redis,redisPipeline} from './redis';
import {teamQueueKey,TEAM_QUEUE_TTL,parseQueueJSON,queuePrefix} from './teamQueue.mjs';
import {loadTeamQueue,teamQueueView,teamQueueProgram} from './teamQueueStore';
import {getPlayerSnapshot} from './playerData';
import {readySixPublicationCheck} from './readySixPublication.mjs';
import {saveProgram} from '../pages/api/programs/save';
export async function publishTeamQueue(queue,req){
  const key=teamQueueKey(queue.workspace,queue.id),token=crypto.randomUUID(),lock=key+':publish-lock';
  if(await redis('set',lock,token,'NX','PX',300000)!=='OK')throw Object.assign(new Error('Публикация этой очереди уже выполняется'),{status:409});
  try{
    const view=await teamQueueView(await loadTeamQueue(queue.workspace,queue.id));
    const selected=view.rows.filter(row=>row.reviewed && row.status==='done' && !row.saved);
    const results=[];
    for(const row of selected){
      const [owned]=await redisPipeline([['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],300000) else return 0 end",1,lock,token]]);
      if(!Number(owned))throw Object.assign(new Error('Публикация прервана. Обновите очередь перед повтором.'),{status:409});
      let outcome;
      try{
        const record=await teamQueueProgram(queue,row.playerId);
        if(!record?.session || record.quality?.valid!==true || record.quality?.blocking || record.quality?.medicalReviewRequired || record.session.methodology?.medicalHold)throw new Error('Требуется индивидуальная проверка и сохранение у игрока.');
        const job=parseQueueJSON(await redis('get','coach:batch:'+row.batchId));
        const snapshot=await getPlayerSnapshot(row.playerId,queue.request.days || 7,queue.date,queue.request.focus==='inseason_strength'?28:queue.request.days || 7,queue.workspace);
        const restrictions=parseQueueJSON(await redis('get',`${queuePrefix(queue.workspace)}:restrictions:${row.playerId}`)) || [];
        const current=readySixPublicationCheck(snapshot,restrictions);
        if(!current || !job?.readySixCheck || current!==job.readySixCheck){
          await redis('hset',key+':reviews',row.playerId,'');
          throw new Error('Данные ReadySix изменились или не были зафиксированы. Обновите черновик и проверьте ограничения повторно.');
        }
        const latest=await loadTeamQueue(queue.workspace,queue.id);
        if(latest.players.find(player=>player.playerId===row.playerId)?.batchId!==row.batchId)throw new Error('Черновик заменён. Проверьте новую версию.');
        const response={code:200,status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
        await saveProgram({...req,method:'POST',body:{...record,workspace:queue.workspace,playerId:row.playerId,date:queue.date,saveRequestId:row.batchId}},response,{key,batchId:row.batchId,lock,token});
        if(response.code!==200)throw new Error(response.data?.error || 'Сохранение не подтверждено');
        outcome={status:'published',at:new Date().toISOString(),message:'Опубликовано после проверки ReadySix'};
      }catch(error){outcome={status:'blocked',at:new Date().toISOString(),message:error.status===503?'ReadySix или хранилище временно недоступны. Повторите проверку.':String(error.message || 'Публикация не подтверждена').slice(0,300)};}
      await redisPipeline([['HSET',key+':publication',row.playerId,JSON.stringify(outcome)],['EXPIRE',key+':publication',TEAM_QUEUE_TTL]]);
      results.push({playerId:row.playerId,...outcome});
    }
    return results;
  }finally{await redisPipeline([['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,lock,token]]);}
}
