import {isAuthorized} from '../../../lib/auth';
import {enforceRateLimit} from '../../../lib/rateLimit';
import {redis} from '../../../lib/redis';
import {getPlayerSnapshot} from '../../../lib/playerData';
import {getRecentSessionRecords} from '../../../lib/sessionHistory';
import {buildStrengthNextReview} from '../../../lib/strengthNextReview.mjs';
import {buildStrengthCycle} from '../../../lib/strengthCycle.mjs';
import {previousCycleId} from '../../../lib/strengthCycleDecisions.mjs';
import {shiftIsoDate} from '../../../lib/developmentPlan.mjs';
import {queuePrefix,parseQueueJSON,validWorkspace} from '../../../lib/teamQueue.mjs';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const {workspace,playerId,date,trainingType='full_body',strengthMode='maintenance'}=req.query;
  if(!validWorkspace(workspace) || typeof playerId!=='string' || !/^[\w-]{1,100}$/.test(playerId) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || !['anterior_chain','posterior_chain','full_body'].includes(trainingType) || !['maintenance','development'].includes(strengthMode))return res.status(400).json({error:'Некорректные параметры обзора'});
  if(!await enforceRateLimit(req,res,{scope:'strength-next-review',limit:120,windowSeconds:600}))return;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(new Date()),asOf=date<today?date:today,prefix=queuePrefix(workspace);
  try{
    const [records,snapshot,equipment,developmentPlan,restrictions]=await Promise.all([
      getRecentSessionRecords(playerId,42,workspace,shiftIsoDate(asOf,1),{strict:true,includeCycleHistory:true,includeStrengthExecution:true}),
      getPlayerSnapshot(playerId,7,date,28,workspace),redis('get',prefix+':strength:equipment'),redis('get',prefix+':development_plan:'+playerId),redis('get',prefix+':restrictions:'+playerId),
    ]);
    if(!snapshot?.readySixMeta || !snapshot?.readySixDecision)return res.status(503).json({error:'Нет актуального контекста ReadySix. Повторите обзор.'});
    const next=buildStrengthCycle(records,{targetDate:date,trainingType}),source=previousCycleId(records,next.id);
    const decision=source?parseQueueJSON(await redis('get',prefix+':strength:cycle-decision:'+playerId+':'+source)):null;
    return res.status(200).json(buildStrengthNextReview({records,snapshot,date,asOf,trainingType,strengthMode,equipment:parseQueueJSON(equipment) || {},developmentPlan:parseQueueJSON(developmentPlan),restrictions:parseQueueJSON(restrictions) || [],decision}));
  }catch{return res.status(503).json({error:'Не удалось проверить нагрузку и выполнение. Повторите обзор игрока.'});}
}
