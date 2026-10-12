const REVIEW_DRAFTS=new Set(['strength_training_draft','prehab_training_draft','restricted_training_draft','restricted_day_plan']);
export const isCoachReviewDraft=session=>REVIEW_DRAFTS.has(session?.kind);
export function completedTeamResult(data) {
  if(data?.status!=='done' || !Array.isArray(data.session?.blocks))throw new Error('Сервер не вернул готовую программу. Повторите проверку статуса.');
  if(!data.autoSaved && !isCoachReviewDraft(data.session) && data.coachReview!==true)throw new Error(data.saveWarning || 'Тренировка создана, но не прошла безопасное автосохранение.');
  return data;
}
const abortError=()=>new DOMException('Генерация отменена','AbortError');
function delay(ms,signal) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(abortError());
    const finish=()=>{signal?.removeEventListener('abort',cancel);resolve();};
    const timer=setTimeout(finish,ms);
    const cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(abortError());};
    signal?.addEventListener('abort',cancel,{once:true});
  });
}
export async function generateTeamPlayer(request,{apiKey,fetchImpl=fetch,wait=delay,signal,onQueued=()=>{},onTransient=()=>{},resumeBatchId=null,maxPolls=80}={}) {
  const headers={'content-type':'application/json','x-api-key':apiKey};
  async function read(url,options={}) {
    if(signal?.aborted)throw abortError();
    const controller=new AbortController(),cancel=()=>controller.abort();
    signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(cancel,45000);
    try {
      const response=await fetchImpl(url,{headers,...options,signal:controller.signal});
      const data=await response.json();
      if(!response.ok){const error=new Error(data.error || 'Ошибка проверки генерации');error.status=response.status;if(data.code==='PREPARATION_INTERRUPTED')error.code=data.code;if(data.status==='failed')error.code='GENERATION_FAILED';const after=response.headers?.get('Retry-After');error.retryMs=after ? (/^\d+$/.test(after)?Number(after)*1000:Math.max(0,Date.parse(after)-Date.now())):null;throw error;}
      return data;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  let batchId=resumeBatchId;
  if(!batchId) {
    // Never replay an ambiguous submission: a job may already exist.
    const submitted=await read('/api/programs/generate-async',{method:'POST',body:JSON.stringify({...request})});
    batchId=submitted.batchId;
    if(!batchId)throw new Error('Сервер не вернул идентификатор задачи');
  }
  onQueued(batchId);
  let failures=0,recoveries=0;
  for(let attempt=0;attempt<maxPolls;attempt++) {
    let data;
    try {data=await read('/api/programs/generate-status?batchId='+encodeURIComponent(batchId)+(request.workspace?'&workspace='+encodeURIComponent(request.workspace):''));failures=0;}
    catch(error) {
      if(signal?.aborted)throw abortError();
      if(error.code==='PREPARATION_INTERRUPTED' && request.teamQueueId && recoveries++<1){
        const resumed=await read('/api/programs/generate-async',{method:'POST',body:JSON.stringify({...request})});
        if(resumed.batchId!==batchId)throw new Error('Задача очереди изменилась. Обновите экран.');
        continue;
      }
      if(error.code==='GENERATION_FAILED' || (error.status && ![429,502,503,504].includes(error.status)))throw error;
      if(!error.status)onTransient('NETWORK_INTERRUPTED');
      if(++failures>3){error.resumeBatchId=batchId;throw error;}
      const pause=error.retryMs ?? Math.min(30000,2000*2**(failures-1));
      if(!Number.isFinite(pause) || pause>60000){const deferred=new Error(error.message+' Повторите проверку позже; готовая задача будет использована повторно.');deferred.resumeBatchId=batchId;throw deferred;}
      await wait(pause,signal);continue;
    }
    if(data.status==='done')return completedTeamResult(data);
    if(data.status==='failed'){const failed=new Error(data.error || 'Тренировка не прошла проверку.');failed.code='GENERATION_FAILED';throw failed;}
    if(data.status!=='pending')throw new Error('Неизвестный статус генерации. Повторите проверку.');
    await wait(6000,signal);
  }
  const timeout=new Error('Генерация заняла слишком долго. Повторите проверку готовой задачи.');timeout.resumeBatchId=batchId;timeout.code='POLL_TIMEOUT';throw timeout;
}
export async function runTeamGeneration(players,{request,apiKey,signal,onUpdate=()=>{},resumeIds={},generate=generateTeamPlayer}={}) {
  const frozenRequest={...request},queue=[...players];
  const update=(player,patch)=>{if(!signal?.aborted)onUpdate(player.id,patch);};
  async function worker(){while(queue.length && !signal?.aborted){const player=queue.shift();update(player,{status:'generating',error:undefined});try{const data=await generate({...frozenRequest,playerId:player.id},{apiKey,signal,resumeBatchId:resumeIds[player.id],onQueued:batchId=>update(player,{batchId}),onTransient:transient=>update(player,{transient})});update(player,{status:'done',draft:!data.autoSaved,workspace:frozenRequest.workspace,date:frozenRequest.date});}catch(error){if(!signal?.aborted)update(player,{status:'error',retryBatchId:error.resumeBatchId || null,errorCode:error.code || (error.status?'SERVER_ERROR':'NETWORK_INTERRUPTED'),error:error.message || 'Не удалось выполнить запрос. Повторите проверку.'});}}}
  await Promise.all(Array.from({length:Math.min(3,players.length)},worker));
}
