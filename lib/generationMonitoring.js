import crypto from 'node:crypto';
import {redis,redisPipeline} from './redis';
import {queuePrefix,validWorkspace,parseQueueJSON} from './teamQueue.mjs';
const codes=new Set(['SUBMITTED','PREPARED','QUALITY_REVIEW','PREPARATION_FAILED','GENERATION_FAILED','RATE_LIMIT','SERVICE_UNAVAILABLE','REQUEST_REJECTED','NETWORK_INTERRUPTED','POLL_TIMEOUT','RECOVERED']);
export async function recordGenerationEvent({workspace,phase='submit',code,batchId='',httpStatus=0,durationMs=0}) {
  if(!validWorkspace(workspace) || !codes.has(code) || !['submit','poll','client'].includes(phase))return;
  const prefix=queuePrefix(workspace),dedupePhase=['PREPARED','QUALITY_REVIEW'].includes(code)?'result':phase,identity=crypto.createHash('sha256').update(`${dedupePhase}:${code}:${batchId || crypto.randomUUID()}`).digest('hex');
  if(await redis('set',`${prefix}:generation:dedupe:${identity}`,'1','NX','EX',86400)!=='OK')return;
  const event={at:new Date().toISOString(),phase,code,batchId:String(batchId).slice(0,70),httpStatus:Number(httpStatus)||0,durationMs:Math.max(0,Math.min(600000,Number(durationMs)||0))};
  await redisPipeline([['LPUSH',`${prefix}:generation:events`,JSON.stringify(event)],['LTRIM',`${prefix}:generation:events`,0,499],['EXPIRE',`${prefix}:generation:events`,14*86400]]);
}
export function observeGenerationResponse(res,context) {
  const status=res.status.bind(res),json=res.json.bind(res),started=Date.now();let httpStatus=200;
  res.status=code=>{httpStatus=code;status(code);return res;};
  res.json=async data=>{
    const ctx=res.generationContext || context;
    const code=ctx.outcomeCode || (httpStatus===429?'RATE_LIMIT':data?.status==='failed'?'GENERATION_FAILED':httpStatus>=500?'SERVICE_UNAVAILABLE':httpStatus>=400?'REQUEST_REJECTED':data?.status==='done'?(data?.quality?.blocking || data?.quality?.medicalReviewRequired?'QUALITY_REVIEW':'PREPARED'):data?.batchId?'SUBMITTED':null);
    try{
      const event={...ctx,batchId:ctx.batchId || data?.batchId,durationMs:Date.now()-started,httpStatus};
      if(ctx.phase==='submit' && httpStatus<400 && data?.batchId && code!=='SUBMITTED')await recordGenerationEvent({...event,code:'SUBMITTED'});
      if(code)await recordGenerationEvent({...event,code});
    }catch{}
    return json(data);
  };
}
export async function generationMonitor(workspace) {
  const raw=await redis('lrange',`${queuePrefix(workspace)}:generation:events`,0,499);
  const events=(raw || []).map(row=>{try{return parseQueueJSON(row);}catch{return null;}}).filter(Boolean);
  const recent=events.filter(event=>Date.parse(event.at)>Date.now()-86400000),counts={};
  for(const event of recent)counts[event.code]=(counts[event.code] || 0)+1;
  const failures=recent.filter(event=>['GENERATION_FAILED','SERVICE_UNAVAILABLE','PREPARATION_FAILED','NETWORK_INTERRUPTED','POLL_TIMEOUT','RATE_LIMIT'].includes(event.code));
  const incidents=await Promise.all(failures.map(async event=>{
    let id=event.batchId,resolved=false;
    // A failed job is resolved only by its own successful result or a successful explicit retry.
    for(let depth=0;id && depth<20;depth++){
      const raw=await redis('get','coach:batch:'+id),job=raw && parseQueueJSON(raw);
      if(job?.workspace!==workspace)break;
      if(job.status==='done'){resolved=true;break;}
      if(!job.supersededBy)break;id=job.supersededBy;
    }
    if(!resolved)resolved=events.some(next=>next.batchId===event.batchId && Date.parse(next.at)>=Date.parse(event.at) && ['PREPARED','QUALITY_REVIEW','RECOVERED'].includes(next.code));
    return {...event,state:resolved?'resolved':'active'};
  }));
  const active=incidents.filter(event=>event.state==='active'),resolved=incidents.filter(event=>event.state==='resolved');
  const heartbeat=Number(await redis('get','coach:team-worker:heartbeat')) || 0;
  return {checkedAt:new Date().toISOString(),counts,events:events.slice(0,30),sampleLimit:500,
    incidents:{active:active.slice(0,30),resolved:resolved.slice(0,30),activeCount:active.length,resolvedCount:resolved.length},
    worker:{lastSeenAt:heartbeat?new Date(heartbeat).toISOString():null,available:Date.now()-heartbeat<180000},needsAttention:active.length>0};
}
