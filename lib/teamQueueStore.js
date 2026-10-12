import {taskRuntimeKey,taskTiming,queueActiveMs,stopMessage} from './teamQueuePolicy.mjs';
import crypto from 'node:crypto';
import {redis,redisPipeline} from './redis';
import {TEAM_QUEUE_TTL,teamQueueKey,teamQueueLatestKey,parseQueueJSON,queueRequest,queuePlayers,reviewPreview,validQueueId,validWorkspace} from './teamQueue.mjs';

export async function loadTeamQueue(workspace, id) {
  if (!validWorkspace(workspace) || !validQueueId(id)) return null;
  const key=teamQueueKey(workspace,id),raw=await redis('get',key);
  if (!raw) return null;
  const queue=parseQueueJSON(raw);
  if (queue.workspace!==workspace || queue.id!==id) return null;
  const state=await redis('get',key+':state') || 'running';
  const overrides=await Promise.all(queue.players.map(player=>redis('hget',key+':jobs',player.playerId)));
  const revision=Number(await redis('get',key+':revision')) || 0;
  return {...queue,state,revision,players:queue.players.map((player,index)=>({...player,batchId:overrides[index] || player.batchId}))};
}
export async function createTeamQueue(body) {
  const request=queueRequest(body.request),players=queuePlayers(body.players);
  const createLock=teamQueueLatestKey(request.workspace,request.date)+':lock',token=crypto.randomUUID();
  if(await redis('set',createLock,token,'NX','PX',30000)!=='OK'){const error=new Error('Другой экран создаёт очередь. Обновите её через несколько секунд.');error.status=409;throw error;}
  try{
  const latest=await redis('get',teamQueueLatestKey(request.workspace,request.date));
  const previous=latest && await loadTeamQueue(request.workspace,latest);
  if(Object.hasOwn(body,'expectedLatestId') && ((latest || null)!==body.expectedLatestId || previous && previous.revision!==body.expectedRevision))throw Object.assign(new Error('Очередь изменена в другой вкладке. Обновите её перед новым подбором.'),{status:409,queue:previous?await teamQueueView(previous):null});
  if(previous){const view=await teamQueueView(previous);if(previous.state!=='cancelled' && view.rows.some(row=>['queued','generating'].includes(row.status))){const error=new Error('На эту дату уже есть незавершённая очередь. Продолжите её или дождитесь завершения.');error.status=409;error.queue=view;throw error;}}
  const queue={id:crypto.randomUUID(),workspace:request.workspace,date:request.date,createdAt:new Date().toISOString(),request,
    players:players.map(player=>({...player,batchId:'openai-gen-'+crypto.randomUUID()}))};
  await redisPipeline([
    ['SET',teamQueueKey(queue.workspace,queue.id),JSON.stringify(queue),'EX',TEAM_QUEUE_TTL],
    ['SET',teamQueueLatestKey(queue.workspace,queue.date),queue.id,'EX',TEAM_QUEUE_TTL],
    ['ZADD',`${prefixFor(queue)}:team-queue-active`,Date.now(),queue.id],
    ['ZADD',`${prefixFor(queue)}:team-queue-watch`,Date.now(),queue.id],
  ]);
  return {...queue,state:'running',revision:0};
  }finally{await redisPipeline([['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",'1',createLock,token]]).catch(()=>{});}
}
export async function teamQueueView(queue) {
  const key=teamQueueKey(queue.workspace,queue.id),prefix=queue.workspace==='nkperf'?'nkperf':'coach';
  const activeMs=queueActiveMs(queue,parseQueueJSON(await redis('get',key+':clock')),queue.state || 'running');
  const rows=await Promise.all(queue.players.map(async player=>{
    const [raw,reviewed,savedRaw]=await Promise.all([redis('get','coach:batch:'+player.batchId),redis('hget',key+':reviews',player.playerId),redis('get',`${prefix}:session:${player.playerId}:${queue.date}`)]);
    const job=raw && parseQueueJSON(raw),saved=savedRaw && parseQueueJSON(savedRaw);
    const scoped=job && job.workspace===queue.workspace && String(job.playerId)===player.playerId && job.teamQueueId===queue.id;
    const expired=Date.now()-Date.parse(queue.createdAt)>TEAM_QUEUE_TTL*1000;
    const baseStatus=!scoped?(expired?'error':'queued'):job.status==='done'?'done':['failed','preparation_failed'].includes(job.status)?'error':job.status==='preparing' && Date.now()>job.leaseUntil?'queued':'generating';
    const runtime=parseQueueJSON(await redis('get',taskRuntimeKey(player.batchId))),timing=taskTiming(runtime,activeMs);
    const stopped=timing.stop && baseStatus!=='done';
    const status=queue.state==='cancelled' && ['queued','generating'].includes(baseStatus)?'cancelled':stopped?'error':baseStatus;
    const savedAfter=!!(scoped && job.status==='done' && saved?.session?.teamGeneration?.batchId===player.batchId && saved?.savedAt && saved.savedAt >= (job.completedAt || job.generatedAt || queue.createdAt));
    return {...player,workspace:queue.workspace,date:queue.date,teamQueueId:queue.id,status,draft:!savedAfter,
      reviewed:reviewed===player.batchId,saved:savedAfter,preview:scoped && job.status==='done'?reviewPreview(savedAfter?saved:job):null,
      runtime:{attempts:runtime?.attempts || 0,failures:runtime?.failures || 0,elapsedSeconds:Math.floor(timing.elapsedMs/1000),stalled:!!timing.stalled,stop:stopped?timing.stop:null,nextAttemptAt:runtime?.nextAttemptAt || null},
      publication:parseQueueJSON(await redis('hget',key+':publication',player.playerId)) || null,
      error:status==='error'?(stopped?stopMessage(timing.stop):job?.error || 'Задача истекла. Повторный подбор запускается только по вашему решению.'):'',
    };
  }));
  return {...queue,rows};
}
export async function retryTeamPlayer(queue,playerId,expectedBatchId,refresh=false) {
  if(queue.state==='cancelled')throw Object.assign(new Error('Отменённую очередь нельзя возобновить. Создайте новую.'),{status:409});
  await redis('zadd',`${prefixFor(queue)}:team-queue-active`,Date.now(),queue.id);
  const player=queue.players.find(row=>row.playerId===String(playerId));
  if(!player || player.batchId!==expectedBatchId){const e=new Error('Очередь уже изменена. Обновите экран.');e.status=409;throw e;}
  const raw=await redis('get','coach:batch:'+player.batchId),job=raw && parseQueueJSON(raw);
  const runtime=parseQueueJSON(await redis('get',taskRuntimeKey(player.batchId)));
  const row=(await teamQueueView(queue)).rows.find(row=>row.playerId===player.playerId);
  if(refresh && row?.saved)throw Object.assign(new Error('Программа уже сохранена. Изменяйте её в карточке игрока.'),{status:409});
  if(refresh && row?.status!=='done' && row?.status!=='error')throw Object.assign(new Error('Дождитесь завершения или остановки текущей задачи.'),{status:409});
  // A lost response or temporary polling error resumes the existing job.
  if(!refresh && !runtime?.stop && row?.runtime?.stop==null && job && !['failed','preparation_failed'].includes(job.status))return queue;
  if(!job && !row?.runtime?.stop)return queue;
  const next='openai-gen-'+crypto.randomUUID(),key=teamQueueKey(queue.workspace,queue.id)+':jobs';
  const script="local current=redis.call('HGET',KEYS[1],ARGV[1]) or ARGV[2]; if current~=ARGV[2] then return 0 end; redis.call('HSET',KEYS[1],ARGV[1],ARGV[3]); redis.call('EXPIRE',KEYS[1],ARGV[4]); return 1";
  const [changed]=await redisPipeline([['EVAL',script,'1',key,player.playerId,player.batchId,next,TEAM_QUEUE_TTL]]);
  if(Number(changed)!==1){const e=new Error('Другой экран уже повторил эту задачу. Обновите очередь.');e.status=409;throw e;}
  await redis('set','coach:batch:'+player.batchId,JSON.stringify({...job,workspace:queue.workspace,teamQueueId:queue.id,playerId:player.playerId,supersededBy:next}),'EX',TEAM_QUEUE_TTL);
  await redis('hdel',teamQueueKey(queue.workspace,queue.id)+':publication',player.playerId);
  await redis('hdel',teamQueueKey(queue.workspace,queue.id)+':reviews',player.playerId);
  await redisPipeline([['HSET',teamQueueKey(queue.workspace,queue.id)+':retry-lineage',player.batchId,next],['EXPIRE',teamQueueKey(queue.workspace,queue.id)+':retry-lineage',TEAM_QUEUE_TTL]]);
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

function prefixFor(queue){return queue.workspace==='nkperf'?'nkperf':'coach';}
export async function controlTeamQueue(queue,action){
  if(!['pause','resume','cancel'].includes(action))throw Object.assign(new Error('Некорректное управление очередью'),{status:400});
  const key=teamQueueKey(queue.workspace,queue.id)+':state',next={pause:'paused',resume:'running',cancel:'cancelled'}[action];
  const now=Date.now(),clock=parseQueueJSON(await redis('get',teamQueueKey(queue.workspace,queue.id)+':clock'));
  const clockNext={activeMs:queueActiveMs(queue,clock,queue.state || 'running',now),at:now};
  const script="if redis.call('GET',KEYS[1])=='cancelled' then return 0 end; redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[2]); return 1";
  const [changed]=await redisPipeline([['EVAL',script,1,key,next,TEAM_QUEUE_TTL]]);
  if(!Number(changed))throw Object.assign(new Error('Очередь уже отменена'),{status:409});
  await redis('set',teamQueueKey(queue.workspace,queue.id)+':clock',JSON.stringify(clockNext),'EX',TEAM_QUEUE_TTL);
  if(next==='running')await redis('zadd',`${prefixFor(queue)}:team-queue-active`,Date.now(),queue.id);
  return loadTeamQueue(queue.workspace,queue.id);
}

export async function mutateTeamQueue(queue,expectedRevision,operation){
  const lock=teamQueueLatestKey(queue.workspace,queue.date)+':lock',token=crypto.randomUUID();
  if(await redis('set',lock,token,'NX','PX',300000)!=='OK')throw Object.assign(new Error('Очередь изменяется в другом окне. Обновите её.'),{status:409});
  let renewal;
  try{
    const latestId=await redis('get',teamQueueLatestKey(queue.workspace,queue.date));
    const current=await loadTeamQueue(queue.workspace,latestId || queue.id);
    if(!current || current.id!==queue.id || !Number.isSafeInteger(expectedRevision) || expectedRevision!==current.revision)throw Object.assign(new Error('Очередь изменена в другой вкладке. Проверьте актуальные данные и повторите действие.'),{status:409,queue:current?await teamQueueView(current):null});
    renewal=setInterval(()=>{void redis('eval',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) else return 0 end",1,lock,token,300000).catch(()=>{});},30000);
    const revisionKey=teamQueueKey(queue.workspace,queue.id)+':revision';
    // Claim the version before any writes: a partially failed action also invalidates stale tabs.
    await redis('set',revisionKey,String(current.revision+1),'EX',TEAM_QUEUE_TTL);
    const output=await operation({...current,revision:current.revision+1});
    return {queue:await teamQueueView(await loadTeamQueue(queue.workspace,queue.id)),...output};
  }finally{clearInterval(renewal);await redisPipeline([['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,lock,token]]).catch(()=>{});}
}
// A superseded in-flight result may be retained as a job, but cannot overwrite the current player draft.
export async function writeCurrentTeamDraft(context,batchId,draftKey,draft){
  const key=teamQueueKey(context.workspace,context.teamQueueId);
  const script="local current=redis.call('HGET',KEYS[1],ARGV[1]); if (current and current~=ARGV[2]) or redis.call('GET',KEYS[2])~=ARGV[3] then return 0 end; redis.call('SET',KEYS[3],ARGV[4]); return 1";
  await redisPipeline([['EVAL',script,3,key+':jobs',teamQueueLatestKey(context.workspace,context.date),draftKey,String(context.playerId),batchId,context.teamQueueId,JSON.stringify(draft)]]);
}
