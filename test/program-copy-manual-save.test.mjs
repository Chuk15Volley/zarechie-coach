import {recordCoachReplacements} from '../lib/strengthCycle.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createCopyRepeatException,validCopyRepeatException,sessionPlayerAliases} from '../lib/manualCopyRepeat.mjs';
import {coachBannedSessionExercises} from '../lib/exerciseRestrictions.js';
const source=readFileSync(new URL('../pages/api/programs/save.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
const ctx={workspace:'nkperf',playerId:'12',date:'2026-10-12',sourceWorkspace:'zarechie',sourcePlayerId:'23',sourceDate:'2026-10-12'};
async function save(session){let writes=[];const identity=s=>s;
 const deps={recordCoachReplacements,validCopyRepeatException:(s,c)=>validCopyRepeatException(s,c,'test'),sessionPlayerAliases,getPlayerTimeZone:async()=>'Europe/Moscow',isAuthorized:()=>true,coachBannedSessionExercises,redis:async()=>null,sessionKey:(ws,id,date)=>`${ws}:session:${id}:${date}`,sessionsKey:(ws,id)=>`${ws}:sessions:${id}`,getRecentSessionRecords:async()=>[],reconcileReplacementDescriptions:identity,approveProgramSession:identity,normalizeSessionTempoDescriptions:identity,ensureSessionExerciseIds:identity,sanitizeUnavailableEquipmentExercises:identity,weightKgFromExercise:()=>0,loadUnitsForExercise:()=>1,approvedProgramLabel:identity,advisorySessionQuality:identity,assessSessionQuality:()=>({blocking:false,variety:{needsCorrection:true}}),buildExerciseVarietyContext:()=>({}),buildDosePrescription:()=>({}),redisPipeline:async c=>{writes=c;}};
 const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));const res={status(c){this.code=c;return this;},json(data){this.data=data;return this;}};
 await handler({method:'POST',body:{...ctx,focus:'inseason_strength',session}},res);return {res,writes};
}
test('manual save accepts only signed exact-copy repeats, mirrors legacy program links, still blocks bans',async()=>{
 const session={blocks:[{exercises:[{code:'B1',name:'DB Incline Bench Press',targetSets:['7','7']}]}]};
 assert.equal((await save(session)).res.code,409);
 session.copyRepeatException=createCopyRepeatException(session,ctx,'test');
 const restored=JSON.parse(JSON.stringify(session));restored.blocks[0].exercises[0].targetSets=['6','6'];
 const result=await save(restored);assert.equal(result.res.code,200);assert.equal(result.writes.filter(c=>c[0]==='SET').length,2);assert.deepEqual(result.writes.filter(c=>c[0]==='SET').map(c=>c[1]),['nkperf:session:12:2026-10-12','nkperf:session:whoop_12:2026-10-12']);
 assert.equal(result.res.data.quality.copyRepeatException.signature,session.copyRepeatException.signature);
 restored.blocks[0].exercises[0].name='Barbell Bench Press';assert.equal((await save(restored)).res.code,409);
});
