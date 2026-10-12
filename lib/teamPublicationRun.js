import crypto from 'node:crypto';
import {redis,redisPipeline} from './redis';
import {loadTeamQueue,teamQueueView} from './teamQueueStore';
import {TEAM_QUEUE_TTL,teamQueueKey,parseQueueJSON} from './teamQueue.mjs';
import {publicationRunKey,publicationIndex,activePublication,freshPublicationCheck,PUBLICATION_ATTEMPTS} from './teamPublicationPolicy.mjs';
import {checkTeamPublication} from './teamPublicationChecks';
import {publishTeamQueue} from './teamQueuePublication';
export async function startPublicationRun(queue,mode){
  const key=publicationRunKey(queue.workspace,queue.id),previous=parseQueueJSON(await redis('get',key));
  if(activePublication(previous))throw Object.assign(new Error('Проверка или публикация уже выполняется в фоне.'),{status:409});
  const view=await teamQueueView(queue);
  const rows=view.rows.filter(row=>row.status==='done' && !row.saved && (mode==='check' || row.reviewed));
  if(!rows.length)throw Object.assign(new Error(mode==='check'?'Нет готовых несохранённых черновиков.':'Отметьте актуальные черновики после проверки тренером.'),{status:409});
  if(mode==='publish' && rows.some(row=>!freshPublicationCheck(row.readySixCheck,row.batchId)))throw Object.assign(new Error('Сначала проверьте изменения ReadySix. Проверка действует пять минут.'),{status:409});
  const run={id:crypto.randomUUID(),mode,status:'running',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),items:rows.map(row=>({playerId:row.playerId,batchId:row.batchId,state:'queued',attempts:0}))};
  await redisPipeline([['SET',key,JSON.stringify(run),'EX',TEAM_QUEUE_TTL],['ZADD',publicationIndex(queue.workspace),Date.now(),queue.id]]);return run;
}
export async function stepPublicationRun(queue,req,runId){
  const key=publicationRunKey(queue.workspace,queue.id),run=parseQueueJSON(await redis('get',key));
  if(!run || run.id!==runId || !activePublication(run))return;
  if(run.mode==='publish'){const view=await teamQueueView(await loadTeamQueue(queue.workspace,queue.id));for(const item of run.items){const row=view.rows.find(row=>row.playerId===item.playerId && row.batchId===item.batchId);if(row?.saved && row.publication?.runId===run.id && row.publication.status==='published'){item.state='published';item.message=row.publication.message;}}}
  if(Date.now()-Date.parse(run.createdAt)>=30*60000){for(const item of run.items)if(['queued','processing'].includes(item.state)){item.state='error';item.message='Истекли 30 минут. Проверьте результат и повторите оставшиеся программы.';}}
  const item=run.items.find(row=>['queued','processing'].includes(row.state));
  if(item && (!item.nextAttemptAt || item.nextAttemptAt<=Date.now())){
    item.state='processing';item.attempts++;run.updatedAt=new Date().toISOString();await redis('set',key,JSON.stringify(run),'EX',TEAM_QUEUE_TTL);
    try{
      const view=await teamQueueView(await loadTeamQueue(queue.workspace,queue.id)),row=view.rows.find(row=>row.playerId===item.playerId);
      if(!row || row.batchId!==item.batchId || row.status!=='done')throw Object.assign(new Error('Черновик заменён или ещё не готов. Проверьте актуальную версию.'),{status:409});
      if(run.mode==='check'){
        if(row.saved){item.state='blocked';item.message='Программа уже сохранена.';}
        else{const check=await checkTeamPublication(queue,row);item.state=check.status==='unchanged'?'checked':'blocked';item.message=check.message;}
      }else{
        const [outcome]=await publishTeamQueue(queue,req,{playerId:item.playerId,batchId:item.batchId,runId:run.id});
        if(!outcome)throw Object.assign(new Error('Проверка тренера снята. Проверьте черновик заново.'),{status:409});
        if(outcome.retryable)throw Object.assign(new Error(outcome.message),{status:503});
        item.state=outcome.status==='published'?'published':'blocked';item.message=outcome.message;
      }
    }catch(error){
      const transient=!error.status || error.status>=500;
      item.state=transient && item.attempts<PUBLICATION_ATTEMPTS?'queued':transient?'error':'blocked';
      item.message=transient?'Сервис временно недоступен. '+(item.state==='queued'?'Повторим в фоне.':'Автоматические повторы исчерпаны; проверьте и повторите оставшиеся.') : String(error.message).slice(0,300);
      item.nextAttemptAt=Date.now()+30000*item.attempts;
    }
    item.updatedAt=new Date().toISOString();
  }
  run.status=run.items.some(row=>['queued','processing'].includes(row.state))?'running':'completed';run.updatedAt=new Date().toISOString();
  await redis('set',key,JSON.stringify(run),'EX',TEAM_QUEUE_TTL);
  if(run.status==='completed')await redis('zrem',publicationIndex(queue.workspace),queue.id);
}
