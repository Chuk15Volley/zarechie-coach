import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as season from '../lib/seasonPolicy.mjs';
import * as cycles from '../lib/strengthCycle.mjs';
import * as decisions from '../lib/strengthCycleDecisions.mjs';
import * as readySix from '../lib/readySixGym.mjs';
import * as manual from '../lib/manualMethod.mjs';
import * as adaptation from '../lib/coachAdaptation.mjs';
import * as draft from '../lib/strengthDevelopmentDraft.mjs';
import * as policy from '../lib/workspacePolicy.mjs';
import * as generated from '../lib/generatedDraft.mjs';
const date='2026-10-12';
function compile(file,deps,returned='handler') {
 const source=fs.readFileSync(new URL('../pages/api/programs/'+file,import.meta.url),'utf8');
 const imports=[...source.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"];?/gm)].flatMap(match=>match[1].replace(/[{}]/g,'').split(',').map(x=>x.trim()).filter(Boolean));
 const unexpected=name=>()=>{throw new Error('Unexpected dependency '+name);};
 const args=Object.fromEntries(imports.map(name=>[name,unexpected(name)]));
 Object.assign(args,deps);
 const body=source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm,'').replace(/export default /g,'').replace(/^export /gm,'');
 return new Function(...Object.keys(args),body+';return '+returned+';')(...Object.values(args));
}
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
for(const workspace of ['zarechie','nkperf'])test(`${workspace}: actual daily input builder, async submission and polling generate both chains and modes without publishing workouts`,async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic';t.after(()=>{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;});
 let history=[];
 const prefix=workspace==='nkperf'?'nkperf':'coach',store=new Map(),readKeys=[];
 const snapshot={player:{id:'synthetic',position:'Диагональная'},readySixMeta:{revision:'synthetic'},readySixDecision:{recommendation:'full',capPercent:100},chronicSurveys:['01','03','05','07','11'].map(day=>({date:'2026-10-'+day,sessionType:'volleyball',blocks:[{type:'volleyball',duration:60,srpe:5}]}))};
 const redis=async(cmd,key,value)=>{if(cmd==='set'){assert.ok(key.startsWith(prefix+':program-draft:') || key.startsWith('coach:batch:'));store.set(key,value);return 'OK';}readKeys.push(key);if(cmd==='zrevrangebyscore')return [];return store.get(key)||null;};
 const common={...season,...cycles,...decisions,...readySix,...manual,...adaptation,...draft,...policy,...generated,crypto,redis,redisPipeline:async commands=>commands.map(()=>null),pfx:()=>prefix,rmHistoryKey:()=>prefix+':1rmhist:synthetic',scheduleKey:()=>prefix+':schedule',developmentPlanKey:()=>prefix+':development:synthetic',sessionsKey:()=>prefix+':sessions:synthetic',getPlayerTimeZone:async(id,ws)=>{assert.equal(ws,workspace);return 'Europe/Moscow';},todayISO:()=>date,getPlayerSnapshot:async(id,days,target,history,ws)=>{assert.equal(ws,workspace);return snapshot;},getRecentSessionRecords:async(id,days,ws)=>{assert.equal(ws,workspace);return history;},getRecentStrengthAnchors:async()=>null,formatSummary:()=>'',isAuthorized:()=>true,enforceRateLimit:async()=>true};
 const buildGenerationInputs=compile('generate.js',common,'buildGenerationInputs');
 const deps={...common,buildGenerationInputs};
 const submit=compile('generate-async.js',deps),poll=compile('generate-status.js',deps);
 for(const strengthMode of ['maintenance','development'])for(const trainingType of ['full_body','anterior_chain','posterior_chain']){
  const body={workspace,playerId:'synthetic',date,focus:'inseason_strength',strengthMode,trainingType,manualMethodSelection:true,autoSave:false};
  const input=await buildGenerationInputs(body);assert.ok(input.readyResult,JSON.stringify(input));
  let res=response();await submit({method:'POST',body},res);assert.equal(res.code,200,JSON.stringify(res.body));assert.ok(res.body.batchId);
  const batchId=res.body.batchId;res=response();await poll({method:'GET',query:{batchId}},res);assert.equal(res.code,200,JSON.stringify(res.body));assert.equal(res.body.status,'done');assert.equal(res.body.quality.valid,true);assert.equal(res.body.autoSaved,false);assert.equal(res.body.strengthMode,strengthMode);assert.equal(res.body.trainingType,trainingType);assert.equal(res.body.session.blocks.flatMap(b=>b.exercises).length,8);
  const baseline=res.body;
  history=[1,2,3,4].map(day=>{const record=structuredClone(baseline);record.date='2026-10-0'+day;record.focus='inseason_strength';record.trainingType=trainingType;record.session.methodology.strengthCycle.id='2026-10-01';record.strengthCompletion={completed:true,source:'player_feedback'};return record;});
  const selected=baseline.session.blocks.flatMap(b=>b.exercises).find(ex=>ex.code==='B1');
  store.set(prefix+':strength:cycle-decision:synthetic:2026-10-01',JSON.stringify({version:decisions.DECISION_VERSION,cycleId:'2026-10-01',revision:'synthetic',entries:[{trainingType,code:'B1',name:selected.name,loadUnits:selected.loadUnits || 1,exercise:'keep',progression:'auto',volume:'reduce_one',volumeReason:'Контроль утомления',note:''}]}));
  res=response();await submit({method:'POST',body},res);assert.equal(res.code,200,JSON.stringify(res.body));const reducedBatch=res.body.batchId;
  res=response();await poll({method:'GET',query:{batchId:reducedBatch}},res);assert.equal(res.code,200);assert.equal(res.body.quality.valid,true,JSON.stringify(res.body.quality));
  const reduced=res.body.session.blocks.flatMap(b=>b.exercises).find(ex=>ex.code==='B1');assert.equal(reduced.targetSets.length,1);assert.equal(reduced.coachVolumeDose.reason,'Контроль утомления');assert.equal(res.body.autoSaved,false);
  history=[];store.delete(prefix+':strength:cycle-decision:synthetic:2026-10-01');

 }
 assert.ok(readKeys.filter(key=>!key.startsWith('coach:batch:')).every(key=>key.startsWith(prefix+':')));
});
