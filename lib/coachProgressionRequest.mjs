// Read-only refresh. It never generates a saved draft or writes athlete facts.
export async function requestCoachProgression({input,apiKey,signal,fetcher=fetch,timeoutMs=25000,retryDelayMs=300}) {
 const controller=new AbortController();let timedOut=false;
 const abort=()=>controller.abort();
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 const options={method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey},signal:controller.signal,body:JSON.stringify(input)};
 const pause=()=>new Promise((resolve,reject)=>{const stop=()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'));};const t=setTimeout(()=>{controller.signal.removeEventListener('abort',stop);resolve();},retryDelayMs);controller.signal.addEventListener('abort',stop,{once:true});if(controller.signal.aborted)stop();});
 try {
  let response,body;
  for(let attempt=0;attempt<2;attempt++){
   try{response=await fetcher('/api/players/progression',options);body=await response.json().catch(()=>({}));}
   catch(error){if(controller.signal.aborted || attempt)throw error;await pause();continue;}
   if(!response.ok && [502,503,504].includes(response.status) && !attempt){await pause();continue;}
   break;
  }
  if(!response?.ok)throw new Error(body?.error || 'Не удалось проверить прогрессию. Повторите проверку.');
  if(input.focus==='inseason_strength' && body.engine!=='strength-generator-v2')throw new Error('Единый силовой подбор недоступен. Повторите проверку.');
  // Optional history follows the critical server calculation, reducing source bursts.
  // Its failure cannot discard an already checked proposal.
  const facts=await fetcher('/api/players/ex-history',options).then(async r=>r.ok?r.json():{}).catch(()=>({}));
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  return {progression:body.engine==='strength-generator-v2'?body.progressionBySlot || {}:{...(body.progression || {}),...(body.progressionById || {})},history:{...(facts.histories || {}),...(facts.historiesById || {})}};
 }catch(error){if(timedOut)throw new Error('Проверка заняла больше 25 секунд. Повторите запрос.');throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
}
