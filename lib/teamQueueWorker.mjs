import crypto from 'node:crypto';
import {teamQueueKey,queuePrefix,parseQueueJSON,validQueueId,TEAM_QUEUE_TTL} from './teamQueue.mjs';
import {taskRuntimeKey,taskTiming,queueActiveMs,workerEvent} from './teamQueuePolicy.mjs';
export async function runQueueTick({redis,request,now=Date.now()}){
  const token=crypto.randomUUID(),lease='coach:team-worker:lease';
  if(await redis('set',lease,token,'NX','PX',90000)!=='OK')return;
  try{
    await redis('set','coach:team-worker:heartbeat',String(now),'EX',180);
    const work=[];
    for(const workspace of ['zarechie','nkperf']){
      const index=queuePrefix(workspace)+':team-queue-active',ids=await redis('zrange',index,0,31);
      for(const id of ids || []){
        if(!validQueueId(id)){await redis('zrem',index,id);continue;}
        const key=teamQueueKey(workspace,id),queue=parseQueueJSON(await redis('get',key));
        if(!queue || queue.workspace!==workspace || queue.id!==id){await redis('zrem',index,id);continue;}
        const state=await redis('get',key+':state') || 'running';
        if(state!=='running'){await redis('zrem',index,id);continue;}
        const activeMs=queueActiveMs(queue,parseQueueJSON(await redis('get',key+':clock')),state,now);
        await redis('zadd',queuePrefix(workspace)+':team-queue-watch',Date.parse(queue.createdAt)||now,id);
        let pending=false;
        for(const player of queue.players){
          const batchId=await redis('hget',key+':jobs',player.playerId) || player.batchId,job=parseQueueJSON(await redis('get','coach:batch:'+batchId));
          if(job && ['done','failed','preparation_failed'].includes(job.status))continue;
          const runtime=parseQueueJSON(await redis('get',taskRuntimeKey(batchId))) || {seenActiveMs:activeMs,attempts:0,failures:0};
          const timing=taskTiming(runtime,activeMs);
          if(timing.stop){if(!runtime.stop){runtime.stop=timing.stop;await redis('set',taskRuntimeKey(batchId),JSON.stringify(runtime),'EX',TEAM_QUEUE_TTL);await workerEvent(redis,{workspace,batchId,code:timing.stop,now});}continue;}
          pending=true;
          await redis('set',taskRuntimeKey(batchId),JSON.stringify(runtime),'EX',TEAM_QUEUE_TTL);
          if(timing.stalled)await workerEvent(redis,{workspace,batchId,code:'TASK_STALLED',now});
          if(Number(runtime.nextAttemptAt)>now)continue;
          work.push({workspace,id,key,playerId:player.playerId,batchId,activeMs,runtime,submit:!job || job.status==='preparing' && now>job.leaseUntil});
        }
        if(!pending)await redis('zrem',index,id);
      }
    }
    work.sort((a,b)=>a.batchId.localeCompare(b.batchId));
    const offset=Number(await redis('get','coach:team-worker:cursor')) || 0;
    const selected=Array.from({length:Math.min(3,work.length)},(_,i)=>work[(offset+i)%work.length]);
    await redis('set','coach:team-worker:cursor',String(offset+selected.length),'EX',86400);
    await Promise.all(selected.map(async task=>{
      if((await redis('get',task.key+':state') || 'running')!=='running' || (await redis('hget',task.key+':jobs',task.playerId) || task.batchId)!==task.batchId)return;
      const runtime={...task.runtime,attempts:task.runtime.attempts+1,startedActiveMs:task.runtime.startedActiveMs ?? task.activeMs,lastProgressActiveMs:task.runtime.lastProgressActiveMs ?? task.activeMs,lastAttemptAt:now};
      await redis('set',taskRuntimeKey(task.batchId),JSON.stringify(runtime),'EX',TEAM_QUEUE_TTL);
      let result;
      try{result=await request(task.submit?'/api/programs/generate-async':'/api/programs/generate-status?workspace='+task.workspace+'&batchId='+task.batchId,task.submit?{workspace:task.workspace,teamQueueId:task.id,playerId:task.playerId}:undefined);}catch{result={status:503,data:{}};}
      if(['QUEUE_STOPPED','QUEUE_SUPERSEDED'].includes(result.data?.code))return;
      if(result.status<400){
        const phase=result.data?.status+':'+(result.data?.processing_status || (task.submit?'submitted':''));
        if(phase!==runtime.phase){runtime.lastProgressActiveMs=task.activeMs;runtime.lastProgressAt=now;runtime.phase=phase;}
        runtime.failures=0;runtime.nextAttemptAt=0;
      }else{
        runtime.failures++;runtime.lastHttpStatus=result.status;
        const transient=[408,425,429].includes(result.status) || result.status>=500;
        runtime.stop=transient?taskTiming(runtime,task.activeMs).stop:'REQUEST_TERMINAL';
        runtime.nextAttemptAt=now+Math.max(15000,Math.min(600000,(result.retryAfter || Math.min(120,15*2**(runtime.failures-1)))*1000));
        await workerEvent(redis,{workspace:task.workspace,batchId:task.batchId,code:runtime.stop || 'WORKER_RETRY',httpStatus:result.status,now});
      }
      await redis('set',taskRuntimeKey(task.batchId),JSON.stringify(runtime),'EX',TEAM_QUEUE_TTL);
    }));
  }finally{await redis('eval',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,lease,token);}
}
