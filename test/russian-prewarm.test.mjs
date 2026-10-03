import test from 'node:test';
import assert from 'node:assert/strict';
import {prewarmTeamReadiness,readinessPrewarmBaseUrl} from '../lib/readinessPrewarm.mjs';
const env={GYM_DEPLOYMENT_ENV:'ru-self-hosted',GYM_DEPLOYMENT_REGION:'ru',GYM_STORAGE_PROVIDER:'valkey',GYM_STORAGE_BOUNDARY:'readysix-gym-ru-production',TRAINER_API_KEY:'synthetic-private-key',VERCEL_URL:'obsolete.example'};
test('Russian readiness warmup stays inside the running app and never sends its key to the former provider',async()=>{
 const calls=[];
 for(const workspace of ['zarechie','nkperf']){
  const result=await prewarmTeamReadiness(workspace,{env,date:'2026-10-03',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({players:[],cache:'fresh'})};}});
  assert.equal(result.ok,true);
 }
 assert.equal(calls.length,2);
 for(const call of calls){assert.equal(new URL(call.url).origin,'http://127.0.0.1:3000');assert.equal(call.options.headers['x-api-key'],'synthetic-private-key');}
 assert.equal(new URL(calls[1].url).searchParams.get('workspace'),'nkperf');
 for(const change of [{GYM_DEPLOYMENT_REGION:'eu'},{GYM_STORAGE_BOUNDARY:'foreign'},{GYM_STORAGE_PROVIDER:'upstash'},{GYM_DEPLOYMENT_ENV:'unknown'}]){
  assert.equal(readinessPrewarmBaseUrl({...env,...change}),null);
  const result=await prewarmTeamReadiness('zarechie',{env:{...env,...change},fetchImpl:()=>{throw Error('Must not fetch');}});
  assert.equal(result.reason,'prewarm_not_configured');
 }
 assert.equal(readinessPrewarmBaseUrl({VERCEL_URL:'legacy.example'}),'https://legacy.example');
});
