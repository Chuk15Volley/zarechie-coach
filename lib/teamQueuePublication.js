import crypto from 'node:crypto';
import {redis,redisPipeline} from './redis';
import {teamQueueKey,TEAM_QUEUE_TTL} from './teamQueue.mjs';
import {loadTeamQueue,teamQueueView,teamQueueProgram} from './teamQueueStore';
import {checkTeamPublication} from './teamPublicationChecks';
import {saveProgram} from '../pages/api/programs/save';
export async function publishTeamQueue(queue,req,selection={}){
  const key=teamQueueKey(queue.workspace,queue.id),token=crypto.randomUUID(),lock=key+':publish-lock';
  if(await redis('set',lock,token,'NX','PX',300000)!=='OK')throw Object.assign(new Error('Публикация этой очереди уже выполняется'),{status:409});
  try{
    const view=await teamQueueView(await loadTeamQueue(queue.workspace,queue.id));
    const targets=view.rows.filter(row=>!selection.playerId || row.playerId===selection.playerId && row.batchId===selection.batchId);
    const recovered=targets.filter(row=>row.saved && row.publication?.status==='published' && row.publication.batchId===row.batchId && row.publication.runId===selection.runId);
    const selected=targets.filter(row=>row.reviewed && row.status==='done' && !row.saved);
    const results=recovered.map(row=>({playerId:row.playerId,...row.publication}));
    if(selection.playerId && !selected.length && !recovered.length && targets.some(row=>row.saved))return [{playerId:selection.playerId,status:'blocked',message:'Программа уже сохранена отдельно. Проверьте её у игрока.'}];
    for(const row of selected){
      const [owned]=await redisPipeline([['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],300000) else return 0 end",1,lock,token]]);
      if(!Number(owned))throw Object.assign(new Error('Публикация прервана. Обновите очередь перед повтором.'),{status:409});
      let outcome;
      try{
        const record=await teamQueueProgram(queue,row.playerId);
        if(!record?.session || record.quality?.valid!==true || record.quality?.blocking || record.quality?.medicalReviewRequired || record.session.methodology?.medicalHold)throw Object.assign(new Error('Требуется индивидуальная проверка и сохранение у игрока.'),{status:409});
        const check=await checkTeamPublication(queue,row);
        if(check.status!=='unchanged')throw Object.assign(new Error(check.message),{status:409});
        const latest=await loadTeamQueue(queue.workspace,queue.id);
        if(latest.players.find(player=>player.playerId===row.playerId)?.batchId!==row.batchId)throw Object.assign(new Error('Черновик заменён. Проверьте новую версию.'),{status:409});
        const response={code:200,status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
        const rawReviewer=await redis('hget',key+':reviews:actors',row.playerId),reviewer=rawReviewer?JSON.parse(rawReviewer):null;
        const receipt={actor:selection.actor || null,reviewer:reviewer?.batchId===row.batchId && reviewer.reviewed?reviewer:null,status:'published',batchId:row.batchId,runId:selection.runId || null,at:new Date().toISOString(),message:'Опубликовано после проверки ReadySix'};
        await saveProgram({...req,method:'POST',body:{...record,workspace:queue.workspace,playerId:row.playerId,date:queue.date,saveRequestId:row.batchId}},response,{key,batchId:row.batchId,lock,token,receipt,actualKey:check.actualKey || '',actualVersion:check.actualVersion || '',auditEvent:{type:'program_published',playerId:row.playerId,date:queue.date,queueId:queue.id,batchId:row.batchId,runId:selection.runId || null,actor:selection.actor || null,reviewer:receipt.reviewer,revision:row.batchId,readySixCheckedAt:check.checkedAt,at:receipt.at}});
        if(response.code!==200)throw Object.assign(new Error(response.data?.error || 'Сохранение не подтверждено'),{status:response.code});
        outcome=receipt;
      }catch(error){outcome={status:'blocked',batchId:row.batchId,runId:selection.runId || null,retryable:!error.status || error.status>=500,at:new Date().toISOString(),message:error.status===503?'ReadySix или хранилище временно недоступны. Повторите проверку.':String(error.message || 'Публикация не подтверждена').slice(0,300)};}
      await redisPipeline([['HSET',key+':publication',row.playerId,JSON.stringify(outcome)],['EXPIRE',key+':publication',TEAM_QUEUE_TTL]]);
      results.push({playerId:row.playerId,...outcome});
    }
    return results;
  }finally{await redisPipeline([['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,lock,token]]);}
}
