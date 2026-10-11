import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {saveProgramRequest} from '../lib/programSaveClient.mjs';
import {coachBannedSessionExercises} from '../lib/exerciseRestrictions.js';
const session={blocks:[{label:'B',exercises:[{name:'Push-Up',targetSets:['7','7','7']}]}]};
const payload={playerId:'synthetic',date:'2026-10-12',session,focus:'inseason_strength',trainingType:'full_body'};
const response=(status,data)=>({status,ok:status<400,json:async()=>data});

test('save retries a lost response with the identical payload and request id',async()=>{
 const bodies=[];
 const result=await saveProgramRequest(payload,'session',{requestId:'synthetic-request-12345',fetchImpl:async(_,options)=>{
  bodies.push(options.body);if(bodies.length===1)throw new TypeError('connection lost');return response(200,{status:'ok',session});
 }});
 assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.deepEqual(result.data.session,session);
});
test('save retries a temporary store outage but reports exact repeat and ban details without retrying',async()=>{
 let calls=0;
 await saveProgramRequest(payload,'session',{fetchImpl:async()=>++calls===1?response(503,{error:'offline'}):response(200,{status:'ok',session})});assert.equal(calls,2);
 calls=0;
 await assert.rejects(saveProgramRequest(payload,'session',{fetchImpl:async()=>{calls++;return response(409,{error:'Замените повторы',repeated:[{code:'D1',name:'FitBall Hamstring Curl',dates:['2026-10-06']}],banned:['Seated Cable Row']});}}),/D1 · FitBall Hamstring Curl — уже было 2026-10-06/);
 assert.equal(calls,1);
});
test('expired authentication returns to reauthentication and an incomplete success never marks the save complete',async()=>{
 let calls=0;const result=await saveProgramRequest(payload,'session',{fetchImpl:async()=>{calls++;return response(401,{error:'Unauthorized'});}});assert.equal(result.res.status,401);assert.equal(calls,1);
 await assert.rejects(saveProgramRequest(payload,'session',{fetchImpl:async()=>response(200,{})}),/не подтвердил сохранение/);
});
test('replayed save after a lost reply does not add another version or re-read history',async()=>{
 const source=readFileSync(new URL('../pages/api/programs/save.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
 let record=null,writes=0,historyReads=0;
 const identity=value=>value;
 const deps={isAuthorized:()=>true,coachBannedSessionExercises,
  redis:async()=>record,sessionKey:()=> 'session',sessionsKey:()=> 'sessions',
  getRecentSessionRecords:async()=>{historyReads++;return [];},reconcileReplacementDescriptions:identity,
  approveProgramSession:identity,normalizeSessionTempoDescriptions:identity,ensureSessionExerciseIds:identity,sanitizeUnavailableEquipmentExercises:identity,
  weightKgFromExercise:()=>0,loadUnitsForExercise:()=>1,approvedProgramLabel:identity,
  advisorySessionQuality:identity,assessSessionQuality:()=>({blocking:false,variety:{needsCorrection:false}}),buildExerciseVarietyContext:()=>({}),buildDosePrescription:()=>({}),
  redisPipeline:async commands=>{writes++;record=commands.find(c=>c[0]==='SET')[2];},
 };
 const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));
 const req={method:'POST',body:{...payload,saveRequestId:'synthetic-request-12345'}};
 const replies=[];
 for(let i=0;i<2;i++){const res={status(code){this.code=code;return this;},json(data){this.data=data;return this;}};await handler(req,res);assert.equal(res.code,200);replies.push(res.data);}
 assert.equal(writes,1);assert.equal(historyReads,1);assert.deepEqual(replies[0],replies[1]);assert.deepEqual(replies[0].session.blocks[0].exercises[0].targetSets,['7','7','7']);
});
