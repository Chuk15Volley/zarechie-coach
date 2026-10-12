import {gymValkeyTransport} from '../lib/gymValkeyTransport.mjs';
import {runQueueTick} from '../lib/teamQueueWorker.mjs';
const store=gymValkeyTransport();
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
while(!stopping){
  try{await runQueueTick({redis:(...args)=>store.command(...args),request:async(path,body)=>{
    const response=await fetch('http://127.0.0.1:'+Number(process.env.PORT || 3000)+path,{method:body?'POST':'GET',headers:{'x-api-key':process.env.TRAINER_API_KEY,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(65000)});
    return {status:response.status,retryAfter:Number(response.headers.get('retry-after')) || 0,data:await response.json()};
  }});await store.command('del','coach:team-worker:tick-failure');}catch{console.error('GYM_TEAM_WORKER_TICK_FAILED');await store.command('set','coach:team-worker:tick-failure',String(Date.now()),'EX',86400).catch(()=>{});}
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,10000));
}
await store.close();
