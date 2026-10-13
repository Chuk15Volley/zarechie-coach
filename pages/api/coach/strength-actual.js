import {isAuthorized,coachAuditActor} from '../../../lib/auth';
import {enforceRateLimit} from '../../../lib/rateLimit';
import {validWorkspace} from '../../../lib/teamQueue.mjs';
import {validCoachDate} from '../../../lib/coachAuditQuery.mjs';
import {loadStrengthActual,saveStrengthActual} from '../../../lib/strengthActualStore';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  const input=req.method==='GET'?req.query:req.body || {},{workspace,playerId,date}=input,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(new Date());
  if(!validWorkspace(workspace) || typeof playerId!=='string' || !/^[\w-]{1,100}$/.test(playerId) || !validCoachDate(date) || date>today)return res.status(400).json({error:'Некорректный игрок, пространство или дата выполнения.'});
  if(!await enforceRateLimit(req,res,{scope:'coach-strength-actual',limit:120,windowSeconds:600}))return;
  try{const context=await loadStrengthActual(workspace,playerId,date);if(req.method==='GET')return res.status(200).json({fingerprint:context.fingerprint,...context.editor});
    const result=await saveStrengthActual(context,input,coachAuditActor(req));return res.status(200).json({...result,progressionNeedsReview:true});
  }catch(error){return res.status(error.status || 503).json({error:error.status?error.message:'Не удалось проверить или сохранить выполнение. Правки оставлены на экране.'});}
}
