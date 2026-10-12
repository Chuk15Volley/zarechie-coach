import {recordCoachReplacements} from '../lib/strengthCycle.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {coachBannedSessionExercises,isCoachBannedExercise} from '../lib/exerciseRestrictions.js';
import {buildExerciseVarietyContext,auditExerciseVariety,preferVarietyCorrection,varietyExerciseKey,formatExerciseVarietyForPrompt} from '../lib/exerciseVariety.mjs';
import {advisorySessionQuality} from '../lib/sessionQualityPolicy.mjs';
const date='2026-10-12',focus='inseason_strength';
const makeSession=(...names)=>({methodology:{goal:'inseason_strength_maintenance',trainingType:'full_body'},blocks:[{label:'B',exercises:names.map((name,i)=>({code:'B'+(i+1),name,targetSets:['5','5'],tempo:''}))}]});
const history=[{date:'2026-10-01',focus,session:makeSession('One-Arm DB Row')}];
const identity=x=>x;
const assessSessionQuality=(session,context)=>({valid:!coachBannedSessionExercises(session).length,score:95,checks:[],variety:auditExerciseVariety(session,context.varietyContext)});
const common={recordCoachReplacements,isAuthorized:()=>true,enforceRateLimit:async()=>true,normalizeExerciseLanguage:identity,sanitizeUnavailableEquipmentExercises:identity,normalizeSessionTempoDescriptions:identity,ensureSessionExerciseIds:identity,assessSessionQuality,advisorySessionQuality,preferVarietyCorrection,buildExerciseVarietyContext,coachBannedSessionExercises,qualityCorrectionPrompt:()=> 'repair'};
const response=()=>({code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
function key(t){const before=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic-test-key';t.after(()=>before===undefined?delete process.env.OPENAI_API_KEY:process.env.OPENAI_API_KEY=before);}
function load(path,deps){let source=readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/^import[\s\S]*?;\n/gm,'').replace('export const config','const config').replace('export default ','');return new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));}
for(const workspace of ['zarechie','nkperf']){
 test(`${workspace}: maintenance generation rejects unresolved repeats and bans after repair, returns only a fresh correction`,async t=>{
  key(t);const source=readFileSync(new URL('../pages/api/programs/generate.js',import.meta.url),'utf8');const body=source.slice(source.indexOf('export default async function handler'),source.indexOf('// ── Extracted prompt assembly')).replace('export default ','');
  for(const name of ['One-Arm DB Row (Bench Supported)','Barbell Bench Press','Seated Cable Row','Inverted Row']){
   let calls=0;const deps={recordCoachReplacements,...common,getRecentSessionRecords:async()=>history,buildGenerationInputs:async()=>({snapshot:{player:{id:'synthetic'}},targetDate:date,effectiveFocus:focus,effectiveTrainingType:'full_body',qualityContext:{focus,strengthMode:'maintenance'}}),callOpenAIForSession:async()=>({session:makeSession(++calls===1?'One-Arm DB Row':name)})};
   const handler=new Function(...Object.keys(deps),body+';return handler;')(...Object.values(deps));const res=response();await handler({method:'POST',body:{playerId:'synthetic',workspace,focus,strengthMode:'maintenance'}},res);
   assert.equal(res.code,name==='Inverted Row'?200:422,name);assert.ok(calls>=2);if(res.code===200)assert.equal(res.body.quality.variety.ok,true);else assert.equal(res.body.session,undefined);
  }
 });
 test(`${workspace}: background maintenance never completes or auto-saves an exhausted repeated candidate`,async t=>{
  key(t);const writes=[];const deps={recordCoachReplacements,...common,crypto:{randomUUID:()=> 'lock'},SYSTEM_PROMPT:'system',getRecentSessionRecords:async()=>history,
   redis:async(command,k,v)=>command==='get'?JSON.stringify({status:'submitted',playerId:'synthetic',workspace,date,focus,userPrompt:'synthetic',sessionTool:{},openaiResponseId:'existing',autoSave:true,correctionAttempts:2,qualityContext:{focus,strengthMode:'maintenance'}}):command==='set'?(writes.push([k,v]),'OK'):null,
   redisPipeline:async commands=>{assert.ok(commands.every(c=>c[0]==='EVAL'),'No program writes');return [1];},
   gymProviderFetch:async()=>({ok:true,json:async()=>({status:'completed',output:[{type:'function_call',name:'build_session',arguments:JSON.stringify(makeSession('One-Arm DB Row'))}]})}),recordPlatformEvent:async()=>{}};
  const handler=load('pages/api/programs/generate-status.js',deps),res=response();await handler({method:'GET',query:{batchId:'openai-gen-00000000-0000-0000-0000-000000000001'}},res);assert.equal(res.code,422);assert.equal(res.body.status,'failed');assert.ok(writes.every(([,v])=>!String(v).includes('"status":"done"')));assert.equal(JSON.parse(writes.at(-1)[1]).autoSaved,false);
 });
 test(`${workspace}: automatic replacement audits all manual edits and refreshes history before any persistence`,async t=>{
  key(t);
  for(const scenario of ['fresh','other-repeat','other-ban','new-history','history-outage','candidate-repeat']){
   let writes=0,reads=0,calls=0;const original=makeSession('Push-Up',scenario==='other-repeat'?'One-Arm DB Row (Bench Supported)':scenario==='other-ban'?'Seated Cable Row':'Dead Bug');
   const deps={recordCoachReplacements,...common,isCoachBannedExercise,varietyExerciseKey,formatExerciseVarietyForPrompt,auditExerciseVariety,isSledExercise:()=>false,sessionKey:()=> 'session',buildDosePrescription:()=>({}),
    redis:async command=>command==='get'?JSON.stringify({focus,strengthMode:'maintenance',session:original}):(writes++,'OK'),
    getRecentSessionRecords:async()=>{reads++;if(reads===2&&scenario==='history-outage')throw Error('offline');return scenario==='new-history'&&reads===2?[...history,{date:'2026-10-11',focus,session:makeSession('Inverted Row')}]:history;},
    gymProviderFetch:async()=>({ok:true,json:async()=>({output:[{type:'function_call',name:'replace_exercise',arguments:JSON.stringify({name:scenario==='candidate-repeat'&&++calls===1?'One-Arm DB Row (Bench Supported)':'Inverted Row',targetSets:['5','5']})}]})})};
   const res=response();await load('pages/api/programs/regenerate-exercise.js',deps)({method:'POST',body:{playerId:'synthetic',workspace,date,blockIndex:0,exerciseIndex:0,session:original,focus}},res);
   const expected=scenario==='fresh'||scenario==='candidate-repeat'?200:scenario==='history-outage'?503:409;assert.equal(res.code,expected,scenario+': '+JSON.stringify(res.body));assert.equal(writes,expected===200?1:0,scenario);if(scenario==='candidate-repeat')assert.equal(calls,2);
  }
 });
}
