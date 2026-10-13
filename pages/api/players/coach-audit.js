import {coachAuditPage} from '../../../lib/coachAuditQuery.mjs';
import {isAuthorized} from '../../../lib/auth';
import {redis} from '../../../lib/redis';
import {enforceRateLimit} from '../../../lib/rateLimit';
import {validWorkspace} from '../../../lib/teamQueue.mjs';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!validWorkspace(req.query.workspace))return res.status(400).json({error:'Некорректное пространство'});
  if(!await enforceRateLimit(req,res,{scope:'coach-audit',limit:120,windowSeconds:600}))return;
  try{return res.status(200).json(await coachAuditPage(redis,req.query.workspace,req.query));}
  catch(error){return res.status(error.status || 503).json({error:error.status?error.message:'Не удалось загрузить журнал. Повторите загрузку.'});}
}
