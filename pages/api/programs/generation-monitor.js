import {isAuthorized} from '../../../lib/auth';
import {enforceRateLimit} from '../../../lib/rateLimit';
import {generationMonitor,recordGenerationEvent} from '../../../lib/generationMonitoring';
import {loadTeamQueue} from '../../../lib/teamQueueStore';
import {validWorkspace} from '../../../lib/teamQueue.mjs';
export default async function handler(req,res){
  if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
  res.setHeader('Cache-Control','no-store');
  const input=req.method==='GET'?req.query:req.body,workspace=input?.workspace;
  if(!validWorkspace(workspace))return res.status(400).json({error:'Некорректное пространство'});
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!await enforceRateLimit(req,res,{scope:'generation-monitor',limit:180,windowSeconds:600}))return;
  try{
    if(req.method==='POST'){
      const queue=await loadTeamQueue(workspace,input.queueId);
      if(!queue?.players.some(row=>row.batchId===input.batchId) || !['NETWORK_INTERRUPTED','POLL_TIMEOUT','RECOVERED'].includes(input.code))return res.status(400).json({error:'Некорректное событие очереди'});
      await recordGenerationEvent({workspace,phase:'client',code:input.code,batchId:input.batchId});
      return res.status(200).json({ok:true});
    }
    return res.status(200).json(await generationMonitor(workspace));
  }catch{return res.status(503).json({error:'Журнал генерации временно недоступен'});}
}
