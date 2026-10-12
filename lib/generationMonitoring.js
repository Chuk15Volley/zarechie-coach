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
  return {checkedAt:new Date().toISOString(),counts,events:events.slice(0,30),sampleLimit:500,
    needsAttention:recent.some(event=>['GENERATION_FAILED','SERVICE_UNAVAILABLE','PREPARATION_FAILED','NETWORK_INTERRUPTED','POLL_TIMEOUT'].includes(event.code))};
}
