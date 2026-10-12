import {queuePrefix,teamQueueKey,parseQueueJSON} from './teamQueue.mjs';
export const PUBLICATION_CHECK_MAX_AGE=5*60000;
export const PUBLICATION_ATTEMPTS=3;
export const publicationRunKey=(workspace,id)=>teamQueueKey(workspace,id)+':publication-run';
export const publicationIndex=workspace=>queuePrefix(workspace)+':team-publication-active';
export const activePublication=run=>run?.status==='running';
export function freshPublicationCheck(check,batchId,now=Date.now()){
  return check?.batchId===batchId && check.status==='unchanged' && Number.isFinite(Date.parse(check.checkedAt)) && now-Date.parse(check.checkedAt)>=0 && now-Date.parse(check.checkedAt)<PUBLICATION_CHECK_MAX_AGE;
}
export function publicationSummary(run){
  if(!run)return null;
  const counts={queued:0,processing:0,checked:0,published:0,blocked:0,error:0};
  for(const item of run.items || [])if(Object.hasOwn(counts,item.state))counts[item.state]++;
  return {...run,counts,total:run.items.length,processed:counts.checked+counts.published+counts.blocked+counts.error};
}
// Server tick dispatches one persisted row at a time. Browser lifetime is irrelevant.
export async function runPublicationTick({redis,request,now=Date.now()}){
  const requests=[];
  for(const workspace of ['zarechie','nkperf']){
    const index=publicationIndex(workspace),ids=await redis('zrange',index,0,31);
    for(const id of ids || []){
      const run=parseQueueJSON(await redis('get',publicationRunKey(workspace,id)));
      if(!activePublication(run)){await redis('zrem',index,id);continue;}
      const item=run.items.find(row=>['queued','processing'].includes(row.state));
      if(item?.nextAttemptAt>now)continue;
      requests.push(request('/api/programs/team-publication',{workspace,queueId:id,runId:run.id}));break;
    }
  }
  await Promise.all(requests);
}
export async function publicationRuntimeSummary(redis,workspace,now=Date.now()){
  const ids=await redis('zrevrange',queuePrefix(workspace)+':team-queue-watch',0,31),summary={running:0,pending:0,failed:0,stalled:0};
  for(const id of ids || []){
    const run=parseQueueJSON(await redis('get',publicationRunKey(workspace,id)));if(!run)continue;
    const pending=run.items.filter(item=>['queued','processing'].includes(item.state)).length;
    if(activePublication(run)){summary.running++;summary.pending+=pending;if(now-Date.parse(run.updatedAt)>180000)summary.stalled++;}
    summary.failed+=run.items.filter(item=>item.state==='error').length;
  }
  return summary;
}
