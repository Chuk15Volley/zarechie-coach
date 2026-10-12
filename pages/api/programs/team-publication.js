import {isAuthorized} from '../../../lib/auth';
import {enforceRateLimit} from '../../../lib/rateLimit';
import {validQueueId,validWorkspace} from '../../../lib/teamQueue.mjs';
import {loadTeamQueue,mutateTeamQueue} from '../../../lib/teamQueueStore';
import {stepPublicationRun} from '../../../lib/teamPublicationRun';
export const config={maxDuration:60};
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const {workspace,queueId,runId}=req.body || {};
  if(!validWorkspace(workspace) || !validQueueId(queueId) || !validQueueId(runId))return res.status(400).json({error:'Некорректная задача публикации'});
  if(!await enforceRateLimit(req,res,{scope:'team-publication',limit:180,windowSeconds:600}))return;
  try{
    const queue=await loadTeamQueue(workspace,queueId);if(!queue)return res.status(404).json({error:'Очередь не найдена'});
    const result=await mutateTeamQueue(queue,queue.revision,async current=>{for(let i=0;i<3;i++)await stepPublicationRun(current,req,runId);});return res.status(200).json(result);
  }catch(error){return res.status(error.status || 503).json({error:error.status?error.message:'Публикация временно недоступна. Прогресс сохранён.'});}
}
