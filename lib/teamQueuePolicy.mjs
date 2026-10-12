import crypto from 'node:crypto';
import {queuePrefix,parseQueueJSON,TEAM_QUEUE_TTL,teamQueueKey} from './teamQueue.mjs';
export const QUEUE_POLICY={maxRunMs:15*60000,maxWaitMs:30*60000,stalledMs:3*60000,maxFailures:5,maxRequests:80};
export const taskRuntimeKey=batchId=>'coach:team-worker:job:'+batchId;
export function queueActiveMs(queue,clock,state,now=Date.now()){
  const value=clock || {activeMs:0,at:Date.parse(queue.createdAt) || now};
  return Math.max(0,Number(value.activeMs)||0)+(state==='running'?Math.max(0,now-(Number(value.at)||now)):0);
}
export function taskTiming(runtime,activeMs){
  const started=Number.isFinite(runtime?.startedActiveMs);
  const elapsedMs=Math.max(0,activeMs-(started?runtime.startedActiveMs:runtime?.seenActiveMs ?? activeMs));
  return {elapsedMs,stalled:started && !runtime?.stop && activeMs-(runtime.lastProgressActiveMs ?? runtime.startedActiveMs)>=QUEUE_POLICY.stalledMs,
    stop:runtime?.stop || (elapsedMs>=(started?QUEUE_POLICY.maxRunMs:QUEUE_POLICY.maxWaitMs)?started?'WAIT_LIMIT':'QUEUE_WAIT_LIMIT':(runtime?.failures || 0)>=QUEUE_POLICY.maxFailures?'RETRY_LIMIT':(runtime?.attempts || 0)>=QUEUE_POLICY.maxRequests?'REQUEST_LIMIT':null)};
}
export const stopMessage=code=>({WAIT_LIMIT:'Истекли 15 минут обработки. Повторите подбор этого игрока.',QUEUE_WAIT_LIMIT:'Задача ждала запуска более 30 минут. Повторите подбор.',RETRY_LIMIT:'Пять последовательных временных ошибок. Проверьте сервис и повторите подбор.',REQUEST_LIMIT:'Достигнут предел обращений к генерации. Повторите подбор.',REQUEST_TERMINAL:'Запрос отклонён. Проверьте данные игрока и повторите подбор.'}[code] || 'Фоновая задача остановлена. Повторите подбор.');
export async function workerEvent(redis,{workspace,batchId,code,httpStatus=0,now=Date.now()}){
  const prefix=queuePrefix(workspace),identity=crypto.createHash('sha256').update(`worker:${code}:${batchId}`).digest('hex');
  if(await redis('set',prefix+':generation:dedupe:'+identity,'1','NX','EX',86400)!=='OK')return;
  await redis('lpush',prefix+':generation:events',JSON.stringify({at:new Date(now).toISOString(),phase:'worker',code,batchId,httpStatus,durationMs:0}));
  await redis('ltrim',prefix+':generation:events',0,499);await redis('expire',prefix+':generation:events',14*86400);
}
export async function queueRuntimeSummary(redis,workspace,now=Date.now()){
  const ids=await redis('zrevrange',queuePrefix(workspace)+':team-queue-watch',0,31),summary={pending:0,stalled:0,stopped:0,waiting:0};
  for(const id of ids || []){
    const raw=await redis('get',teamQueueKey(workspace,id));if(!raw){await redis('zrem',queuePrefix(workspace)+':team-queue-watch',id);continue;}const queue=parseQueueJSON(raw);if(queue.workspace!==workspace)continue;
    const key=teamQueueKey(workspace,id),state=await redis('get',key+':state') || 'running';if(state!=='running')continue;
    const clock=parseQueueJSON(await redis('get',key+':clock')),activeMs=queueActiveMs(queue,clock,state,now);
    for(const player of queue.players){
      const batchId=await redis('hget',key+':jobs',player.playerId) || player.batchId,job=parseQueueJSON(await redis('get','coach:batch:'+batchId));
      if(job?.status==='done')continue;
      const runtime=parseQueueJSON(await redis('get',taskRuntimeKey(batchId))),timing=taskTiming(runtime,activeMs);
      if(timing.stop){summary.stopped++;continue;}
      if(['failed','preparation_failed'].includes(job?.status))continue;
      summary.pending++;if(timing.stalled)summary.stalled++;if(!Number.isFinite(runtime?.startedActiveMs))summary.waiting++;
    }
  }
  return summary;
}
