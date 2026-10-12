import crypto from 'node:crypto';
import {redis,redisPipeline} from './redis';
import {TEAM_QUEUE_TTL,teamQueueKey,teamQueueLatestKey,parseQueueJSON,queueRequest,queuePlayers,reviewPreview,validQueueId,validWorkspace} from './teamQueue.mjs';

export async function loadTeamQueue(workspace, id) {
  if (!validWorkspace(workspace) || !validQueueId(id)) return null;
  const key=teamQueueKey(workspace,id),raw=await redis('get',key);
  if (!raw) return null;
  const queue=parseQueueJSON(raw);
  if (queue.workspace!==workspace || queue.id!==id) return null;
  const overrides=await Promise.all(queue.players.map(player=>redis('hget',key+':jobs',player.playerId)));
  return {...queue,players:queue.players.map((player,index)=>({...player,batchId:overrides[index] || player.batchId}))};
}
export async function createTeamQueue(body) {
  const request=queueRequest(body.request),players=queuePlayers(body.players);
  const createLock=teamQueueLatestKey(request.workspace,request.date)+':lock',token=crypto.randomUUID();
  if(await redis('set',createLock,token,'NX','PX',30000)!=='OK'){const error=new Error('Другой экран создаёт очередь. Обновите её через несколько секунд.');error.status=409;throw error;}
  try{
  const latest=await redis('get',teamQueueLatestKey(request.workspace,request.date));
  const previous=latest && await loadTeamQueue(request.workspace,latest);
  if(previous){const view=await teamQueueView(previous);if(view.rows.some(row=>['queued','generating'].includes(row.status))){const error=new Error('На эту дату уже есть незавершённая очередь. Продолжите её или дождитесь завершения.');error.status=409;error.queue=view;throw error;}}
  const queue={id:crypto.randomUUID(),workspace:request.workspace,date:request.date,createdAt:new Date().toISOString(),request,
    players:players.map(player=>({...player,batchId:'openai-gen-'+crypto.randomUUID()}))};
  await redisPipeline([
    ['SET',teamQueueKey(queue.workspace,queue.id),JSON.stringify(queue),'EX',TEAM_QUEUE_TTL],
    ['SET',teamQueueLatestKey(queue.workspace,queue.date),queue.id,'EX',TEAM_QUEUE_TTL],
  ]);
  return queue;
  }finally{await redisPipeline([['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",'1',createLock,token]]).catch(()=>{});}
}
export async function teamQueueView(queue) {
  const key=teamQueueKey(queue.workspace,queue.id),prefix=queue.workspace==='nkperf'?'nkperf':'coach';
  const rows=await Promise.all(queue.players.map(async player=>{
    const [raw,reviewed,savedRaw]=await Promise.all([redis('get','coach:batch:'+player.batchId),redis('hget',key+':reviews',player.playerId),redis('get',`${prefix}:session:${player.playerId}:${queue.date}`)]);
    const job=raw && parseQueueJSON(raw),saved=savedRaw && parseQueueJSON(savedRaw);
    const scoped=job && job.workspace===queue.workspace && String(job.playerId)===player.playerId && job.teamQueueId===queue.id;
    const expired=Date.now()-Date.parse(queue.createdAt)>TEAM_QUEUE_TTL*1000;
    const status=!scoped?(expired?'error':'queued'):job.status==='done'?'done':['failed','preparation_failed'].includes(job.status)?'error':job.status==='preparing' && Date.now()>job.leaseUntil?'queued':'generating';
    const savedAfter=!!(scoped && job.status==='done' && saved?.session?.teamGeneration?.batchId===player.batchId && saved?.savedAt && saved.savedAt >= (job.completedAt || job.generatedAt || queue.createdAt));
    return {...player,workspace:queue.workspace,date:queue.date,teamQueueId:queue.id,status,draft:!savedAfter,
      reviewed:reviewed===player.batchId,saved:savedAfter,preview:scoped && job.status==='done'?reviewPreview(savedAfter?saved:job):null,
      error:status==='error'?(job?.error || 'Задача истекла. Повторный подбор запускается только по вашему решению.'):'',
    };
  }));
  return {...queue,rows};
}
export async function retryTeamPlayer(queue,playerId,expectedBatchId) {
  const player=queue.players.find(row=>row.playerId===String(playerId));
  if(!player || player.batchId!==expectedBatchId){const e=new Error('Очередь уже изменена. Обновите экран.');e.status=409;throw e;}
  const raw=await redis('get','coach:batch:'+player.batchId),job=raw && parseQueueJSON(raw);
  // A lost response or temporary polling error resumes the existing job.
  if(job && !['failed','preparation_failed'].includes(job.status))return queue;
  if(!job)return queue; // Preallocated but not yet submitted: reuse its identifier.
  const next='openai-gen-'+crypto.randomUUID(),key=teamQueueKey(queue.workspace,queue.id)+':jobs';
  const script="local current=redis.call('HGET',KEYS[1],ARGV[1]) or ARGV[2]; if current~=ARGV[2] then return 0 end; redis.call('HSET',KEYS[1],ARGV[1],ARGV[3]); redis.call('EXPIRE',KEYS[1],ARGV[4]); return 1";
  const [changed]=await redisPipeline([['EVAL',script,'1',key,player.playerId,player.batchId,next,TEAM_QUEUE_TTL]]);
  if(Number(changed)!==1){const e=new Error('Другой экран уже повторил эту задачу. Обновите очередь.');e.status=409;throw e;}
  return loadTeamQueue(queue.workspace,queue.id);
}
export async function markTeamPlayerReviewed(queue,playerId,batchId,reviewed) {
  const row=(await teamQueueView(queue)).rows.find(row=>row.playerId===String(playerId));
  if(!row || row.batchId!==batchId || row.status!=='done'){const e=new Error('Проверять можно только актуальный готовый черновик.');e.status=409;throw e;}
  const key=teamQueueKey(queue.workspace,queue.id)+':reviews';
  await redisPipeline([['HSET',key,row.playerId,reviewed?batchId:''],['EXPIRE',key,TEAM_QUEUE_TTL]]);
}

export async function teamQueueProgram(queue,playerId) {
  const row=queue.players.find(player=>player.playerId===String(playerId));
  if(!row)return null;
  const prefix=queue.workspace==='nkperf'?'nkperf':'coach';
  const [raw,savedRaw]=await Promise.all([redis('get','coach:batch:'+row.batchId),redis('get',`${prefix}:session:${row.playerId}:${queue.date}`)]);
  const job=raw && parseQueueJSON(raw),saved=savedRaw && parseQueueJSON(savedRaw);
  if(saved?.session?.teamGeneration?.batchId===row.batchId)return saved;
  if(!job || job.teamQueueId!==queue.id || job.workspace!==queue.workspace || String(job.playerId)!==row.playerId || job.status!=='done')return null;
  return {session:job.session,player:job.player || null,quality:job.quality || null,dataSummary:job.dataSummary || '',date:queue.date,dayGoal:queue.request.dayGoal || '',focus:job.focus || queue.request.focus,trainingType:job.trainingType || queue.request.trainingType,strengthMode:job.strengthMode || queue.request.strengthMode,draft:true,trainingLabel:'Командный черновик'};
}
