// Read-only refresh. It never generates a saved draft or writes athlete facts.
export async function requestCoachProgression({input,apiKey,signal,fetcher=fetch,timeoutMs=25000}) {
 const controller=new AbortController();let timedOut=false;
 const abort=()=>controller.abort();
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 const options={method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey},signal:controller.signal,body:JSON.stringify(input)};
 try {
  const history=fetcher('/api/players/ex-history',options).then(async response=>response.ok?response.json():{}).catch(()=>({}));
  const response=await fetcher('/api/players/progression',options),body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error || 'Не удалось проверить прогрессию. Повторите проверку.');
  if(input.focus==='inseason_strength' && body.engine!=='strength-generator-v2')throw new Error('Единый силовой подбор недоступен. Повторите проверку.');
  const facts=await history;
  return {progression:body.engine==='strength-generator-v2'?body.progressionBySlot || {}:{...(body.progression || {}),...(body.progressionById || {})},history:{...(facts.histories || {}),...(facts.historiesById || {})}};
 }catch(error){if(timedOut)throw new Error('Проверка заняла больше 25 секунд. Повторите запрос.');throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
}
