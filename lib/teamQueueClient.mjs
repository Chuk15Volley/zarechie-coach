// One gate per displayed workspace/date. Late reads never overtake a mutation.
export function queueResponseGate(){
  let epoch=0,sequence=0,busy=false,closed=false;
  return {
    read(){return {epoch,sequence:++sequence};},
    accept(token){return !closed && !busy && token.epoch===epoch && token.sequence===sequence;},
    begin(){if(closed || busy)return null;busy=true;epoch++;return epoch;},
    finish(token){if(token===epoch)busy=false;},
    owns(token){return !closed && token===epoch;},
    close(){closed=true;epoch++;},
    get busy(){return busy;},
  };
}
export async function teamQueueCall(apiKey,path,{body,signal,timeoutMs=body?120000:20000,fetchImpl=fetch}={}){
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
  try{
    const response=await fetchImpl(path,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-api-key':apiKey},body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const data=await response.json();
    if(!response.ok){const error=new Error(data.error || 'Не удалось загрузить очередь');error.queue=data.queue;error.status=response.status;throw error;}
    return data;
  }catch(error){if(timedOut)throw new Error(body?'Ответ не получен вовремя. Действие могло выполниться: обновите очередь перед повтором.':'Сервер не ответил вовремя. Очередь продолжает работать; обновите экран.');throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
