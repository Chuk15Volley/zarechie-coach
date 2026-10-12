import {generatedDraftKey,generatedDraftRecord} from '../../../lib/generatedDraft.mjs';
import {isAuthorized} from '../../../lib/auth';
import {enforceRateLimit} from '../../../lib/rateLimit';
import {redis,redisPipeline} from '../../../lib/redis';
import {buildGenerationInputs,buildSessionTool} from './generate';
import {loadTeamQueue} from '../../../lib/teamQueueStore';
import {generationJobTTL} from '../../../lib/teamQueue.mjs';
import {observeGenerationResponse} from '../../../lib/generationMonitoring';
import crypto from 'node:crypto';
export const config={maxDuration:60};

export default async function handler(req,res) {
  if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
  try{observeGenerationResponse(res,{workspace:req.body?.workspace || 'zarechie',phase:'submit'});}catch{}
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'OPENAI_API_KEY не настроен'});
  let request=req.body || {},batchId='openai-gen-'+crypto.randomUUID(),teamQueueId=null,lockKey=null,lockToken=null;
  try {
    if(request.teamQueueId){
      const queue=await loadTeamQueue(request.workspace,request.teamQueueId);
      const player=queue?.players.find(player=>player.playerId===String(request.playerId));
      if(!player)return res.status(404).json({error:'Игрок или очередь не найдены в выбранном пространстве'});
      batchId=player.batchId;teamQueueId=queue.id;request={...queue.request,playerId:player.playerId};
      res.generationContext={workspace:queue.workspace,phase:'submit',batchId};
      const raw=await redis('get','coach:batch:'+batchId),existing=typeof raw==='string'?JSON.parse(raw):raw;
      if(existing && existing.status!=='preparing')return res.status(200).json({batchId,reused:true});
      lockKey='coach:team-submit-lock:'+batchId;lockToken=crypto.randomUUID();
      if(await redis('set',lockKey,lockToken,'NX','PX',90000)!=='OK')return res.status(202).json({batchId,preparing:true});
      // Recheck under the lease: another tab may have finished between read and lock.
      const currentRaw=await redis('get','coach:batch:'+batchId),current=typeof currentRaw==='string'?JSON.parse(currentRaw):currentRaw;
      if(current && current.status!=='preparing')return res.status(200).json({batchId,reused:true});
    }
    if(!await enforceRateLimit(req,res,{scope:'ai-generate-async',limit:40,windowSeconds:600}))return;
    const context={teamQueueId,workspace:request.workspace || 'zarechie',playerId:String(request.playerId),date:request.date,coachReview:!!teamQueueId};
    if(teamQueueId)await redis('set','coach:batch:'+batchId,JSON.stringify({...context,status:'preparing',leaseUntil:Date.now()+90000}), 'EX',generationJobTTL(context));
    const inputs=await buildGenerationInputs(request);
    if(inputs.error){
      res.generationContext={workspace:request.workspace || 'zarechie',phase:'submit',batchId,outcomeCode:'PREPARATION_FAILED'};
      if(teamQueueId)await redis('set','coach:batch:'+batchId,JSON.stringify({...context,status:'preparation_failed',error:inputs.error}), 'EX',generationJobTTL(context));
      return res.status(inputs.status || 400).json({error:inputs.error});
    }
    if(inputs.readyResult){
      const result={...inputs.readyResult,...(teamQueueId?context:{}),status:'done',completedAt:new Date().toISOString()};
      if(teamQueueId)result.session={...result.session,teamGeneration:{queueId:teamQueueId,batchId}};
      const draft=generatedDraftRecord(result,request);
      if(draft)await redis('set',generatedDraftKey(context.workspace,context.playerId,draft.date),JSON.stringify({...draft,...(teamQueueId?{teamQueueId,batchId}:{})}));
      await redis('set','coach:batch:'+batchId,JSON.stringify({...result,workspace:context.workspace,playerId:context.playerId}), 'EX',teamQueueId?generationJobTTL(context):3600);
      res.generationContext={workspace:context.workspace,phase:'submit',batchId,outcomeCode:result.quality?.blocking || result.quality?.medicalReviewRequired?'QUALITY_REVIEW':'PREPARED'};
      return res.status(200).json({batchId,estimatedMinutes:0});
    }
    const {userPrompt,systemPrompt,dataSummary,targetDate,playerRestrictions=[],qualityContext={},questionnaireContext={}}=inputs;
    const sessionTool=buildSessionTool({includeImgPrompt:true});
    await redis('set','coach:batch:'+batchId,JSON.stringify({...context,date:targetDate,dayGoal:request.dayGoal || '',focus:request.focus || '',trainingType:request.trainingType || '',autoSave:teamQueueId?false:request.autoSave!==false,
      userPrompt,systemPrompt,dataSummary,playerRestrictions,qualityContext,questionnaireContext,generationRequest:request,sessionTool,status:'pending',submittedAt:new Date().toISOString()}),'EX',teamQueueId?generationJobTTL(context):3600);
    return res.status(200).json({batchId,estimatedMinutes:2});
  }catch(error){
    res.generationContext={workspace:request.workspace || 'zarechie',phase:'submit',batchId,outcomeCode:'PREPARATION_FAILED'};
    if(teamQueueId){
      // Recover a committed result after an ambiguous persistence error; never overwrite it.
      try{const raw=await redis('get','coach:batch:'+batchId);const job=typeof raw==='string'?JSON.parse(raw):raw;if(job && job.status!=='preparing'){res.generationContext={workspace:request.workspace,phase:'submit',batchId};return res.status(200).json({batchId,reused:true});}
        await redis('set','coach:batch:'+batchId,JSON.stringify({teamQueueId,workspace:request.workspace,playerId:String(request.playerId),date:request.date,status:'preparation_failed',error:'Подготовка данных временно недоступна. Повторите подбор.'}),'EX',generationJobTTL({teamQueueId}));}catch{}
    }
    return res.status(503).json({error:'Не удалось поставить генерацию в очередь. Повторите попытку.'});
  }finally{
    if(lockKey && lockToken)try{await redisPipeline([['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",'1',lockKey,lockToken]]);}catch{}
  }
}
