import {publishTeamQueue} from '../../../lib/teamQueuePublication';
import {isAuthorized} from '../../../lib/auth';
import {redis} from '../../../lib/redis';
import {enforceRateLimit} from '../../../lib/rateLimit';
import {validWorkspace,validQueueId,teamQueueLatestKey} from '../../../lib/teamQueue.mjs';
import {createTeamQueue,loadTeamQueue,teamQueueView,retryTeamPlayer,markTeamPlayerReviewed,teamQueueProgram,controlTeamQueue,mutateTeamQueue} from '../../../lib/teamQueueStore';
export const config={maxDuration:60};
export default async function handler(req,res) {
  if(!isAuthorized(req))return res.status(401).json({error:'Unauthorized'});
  res.setHeader('Cache-Control','no-store');
  const input=req.method==='GET'?req.query:req.body,workspace=input?.workspace || input?.request?.workspace;
  if(!validWorkspace(workspace))return res.status(400).json({error:'Некорректное пространство'});
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!await enforceRateLimit(req,res,{scope:'team-queue',limit:180,windowSeconds:600}))return;
  try {
    if(req.method==='POST' && input.action==='create'){const queue=await createTeamQueue(input);return res.status(200).json({queue:await teamQueueView(queue)});}
    if(!input.queueId && !/^\d{4}-\d{2}-\d{2}$/.test(input.date || ''))return res.status(400).json({error:'Укажите дату или очередь'});
    const id=input.queueId || await redis('get',teamQueueLatestKey(workspace,input.date));
    if(!id)return res.status(200).json({queue:null});
    if(!validQueueId(id))return res.status(400).json({error:'Некорректная очередь'});
    let queue=await loadTeamQueue(workspace,id);
    if(!queue)return res.status(404).json({error:'Очередь не найдена или истекла'});
    if(req.method==='GET' && input.playerId){const record=await teamQueueProgram(queue,input.playerId);return record?res.status(200).json({record}):res.status(404).json({error:'Готовый черновик не найден в этой очереди'});}
    if(req.method==='POST'){
      const result=await mutateTeamQueue(queue,input.expectedRevision,async current=>{
        if(['pause','resume','cancel'].includes(input.action))await controlTeamQueue(current,input.action);
        else if(input.action==='publish')return {publication:await publishTeamQueue(current,req)};
        else if(['retry','refresh-player'].includes(input.action))await retryTeamPlayer(current,input.playerId,input.batchId,input.action==='refresh-player');
        else if(input.action==='review')await markTeamPlayerReviewed(current,input.playerId,input.batchId,input.reviewed===true);
        else throw Object.assign(new Error('Неизвестное действие'),{status:400});
        return {};
      });
      return res.status(200).json(result);
    }
    return res.status(200).json({queue:await teamQueueView(queue)});
  }catch(error){return res.status(error.status || 503).json({error:error.status?error.message:'Не удалось восстановить очередь. Повторите проверку.',...(error.queue?{queue:error.queue}:{})});}
}
