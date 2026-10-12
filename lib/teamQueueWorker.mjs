import crypto from 'node:crypto';
import {teamQueueKey,queuePrefix,parseQueueJSON,validQueueId} from './teamQueue.mjs';
// Persistent manifests, job identities and leases survive process/container restarts.
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
        const key=teamQueueKey(workspace,id),raw=await redis('get',key),queue=raw && parseQueueJSON(raw);
        if(!queue || queue.workspace!==workspace || queue.id!==id){await redis('zrem',index,id);continue;}
        const state=await redis('get',key+':state') || 'running';
        if(state==='cancelled'){await redis('zrem',index,id);continue;}
        if(state==='paused'){await redis('zrem',index,id);continue;}
        let pending=false;
        for(const player of queue.players){
          const batchId=await redis('hget',key+':jobs',player.playerId) || player.batchId;
          const rawJob=await redis('get','coach:batch:'+batchId),job=rawJob && parseQueueJSON(rawJob);
          if(job && ['done','failed','preparation_failed'].includes(job.status))continue;
          pending=true;
          if(Number(await redis('get','coach:team-worker:defer:'+batchId))>now)continue;
          work.push({workspace,id,key,playerId:player.playerId,batchId,submit:!job || job.status==='preparing' && now>job.leaseUntil});
        }
        if(!pending)await redis('zrem',index,id);
      }
    }
    // Alternate spaces and rotate queues so a slow provider job cannot starve its neighbours.
    work.sort((a,b)=>a.batchId.localeCompare(b.batchId));
    const offset=Number(await redis('get','coach:team-worker:cursor')) || 0;
    const selected=Array.from({length:Math.min(3,work.length)},(_,i)=>work[(offset+i)%work.length]);
    await redis('set','coach:team-worker:cursor',String(offset+selected.length),'EX',86400);
    await Promise.all(selected.map(async task=>{
      if((await redis('get',task.key+':state') || 'running')!=='running')return;
      try{
        const result=await request(task.submit?'/api/programs/generate-async':'/api/programs/generate-status?workspace='+task.workspace+'&batchId='+task.batchId,task.submit?{workspace:task.workspace,teamQueueId:task.id,playerId:task.playerId}:undefined);
        if(result.status>=400 && result.data?.code!=='QUEUE_STOPPED')await redis('set','coach:team-worker:defer:'+task.batchId,String(now+Math.max(15000,Math.min(600000,(result.retryAfter || 30)*1000))),'EX',900);
      }catch{await redis('set','coach:team-worker:defer:'+task.batchId,String(now+30000),'EX',900);}
    }));
  }finally{await redis('eval',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,lease,token);}
}
