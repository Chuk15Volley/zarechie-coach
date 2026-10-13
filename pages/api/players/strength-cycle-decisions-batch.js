import {isAuthorized,coachAuditActor} from '../../../lib/auth';
import {enforceRateLimit} from '../../../lib/rateLimit';
import {redis} from '../../../lib/redis';
import {getRecentSessionRecords} from '../../../lib/sessionHistory';
import {buildStrengthCycleReview} from '../../../lib/strengthCycleReview.mjs';
import {shiftIsoDate} from '../../../lib/developmentPlan.mjs';
import {saveDecisionBatch} from '../../../lib/strengthDecisionBatch.mjs';
export const config={maxDuration:60,api:{bodyParser:{sizeLimit:'128kb'}}};
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!await enforceRateLimit(req,res,{scope:'strength-decisions-batch',limit:30,windowSeconds:600}))return;
  const {workspace,date,trainingType,requestId,items}=req.body || {};
  if(typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date)return res.status(400).json({error:'Некорректная дата'});
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(new Date()),asOf=date<today?date:today;
  try{
    const result=await saveDecisionBatch({workspace,trainingType,requestId,items,actor:coachAuditActor(req),redis,loadReview:async playerId=>buildStrengthCycleReview(await getRecentSessionRecords(playerId,42,workspace,shiftIsoDate(asOf,1),{strict:true,includeCycleHistory:true,includeStrengthExecution:true}),{asOf})});
    return res.status(200).json(result);
  }catch(error){return res.status(error.status || 503).json({error:error.status?error.message:'Не удалось подтвердить групповое сохранение. Повторите тот же запрос или обновите обзор; решения не будут продублированы.'});}
}
