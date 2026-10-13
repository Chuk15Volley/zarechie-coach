import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStrengthNextReview} from '../lib/strengthNextReview.mjs';
import {buildStrengthDevelopmentDraft} from '../lib/strengthDevelopmentDraft.mjs';
import {buildStrengthCycleReview} from '../lib/strengthCycleReview.mjs';
import {validateCycleDecision,DECISION_VERSION} from '../lib/strengthCycleDecisions.mjs';
import {strengthExercises} from '../lib/strengthCycle.mjs';
const date='2026-10-12',snapshot={player:{position:'Диагональная'},readySixMeta:{},readySixDecision:{recommendation:'full'},readySixCalendar:{events:[{date:'2026-10-20',type:'game'}]},chronicSurveys:['01','03','05','07','11'].map(day=>({date:'2026-10-'+day,sessionType:'volleyball',blocks:[{type:'volleyball',duration:60,srpe:5}]}))};
function records(chain){const initial=buildStrengthDevelopmentDraft({snapshot,recommendation:{calendar:{available:true,daysToGame:5,events:[]},state:{}},manualMethodSelection:true,strengthMode:'maintenance',trainingType:chain,date:'2026-10-01'});
 return [1,2,3,4].map(day=>{const dayDate='2026-10-0'+day;return {...structuredClone(initial),date:dayDate,savedAt:dayDate+'T10:00:00Z',strengthCompletion:{completed:true,source:'player_feedback'},strengthExecutionFacts:{actual:{source:'player_feedback',savedAt:dayDate+'T12:00:00Z',exercises:initial.session.blocks.flatMap(block=>block.exercises.map(ex=>({name:ex.name,block:block.label,loadUnits:ex.loadUnits,completed:true,plannedSets:ex.targetSets.length,actualRpe:5,setActuals:ex.targetSets.map(target=>({target,completed:true,repsRecorded:true,reps:parseInt(target)*(/side/.test(target)?2:1),kg:ex.code==='A1'?100:20}))})))}}};});}
for(const trainingType of ['anterior_chain','posterior_chain','full_body'])test(trainingType+': team next-cycle overview uses actual completions, coach decisions and the shared draft policy without mutating history',()=>{
 const history=records(trainingType),cycle=buildStrengthCycleReview(history,{asOf:date}).cycles[0],decision={version:DECISION_VERSION,cycleId:cycle.id,savedAt:date+'T10:00:00Z',revision:'coach',entries:validateCycleDecision(cycle,cycle.exercises.map(row=>({key:row.key,exercise:'keep',progression:'hold',volume:row.code==='B1'?'reduce_one':'normal',volumeReason:row.code==='B1'?'Поддержать плечо':'' ,note:''})))};
 const before=JSON.stringify(history),review=buildStrengthNextReview({records:history,snapshot,date,asOf:date,trainingType,strengthMode:'maintenance',decision,equipment:{dumbbell:[20,21],trap_bar:[100,102.5]}});
 assert.equal(review.cycle.completedCount,4);assert.equal(review.decision.revision,'coach');assert.equal(review.decisionNeeded,false);assert.ok(review.facts.completedMainSets>0);assert.ok(review.proposal.rows.length>0);assert.ok(review.proposal.rows.every(row=>row.action!=='increase' && row.action!=='increase_reps'));
 for(const ex of review.proposal.rows)assert.equal(ex.name,strengthExercises(history[0].session).find(old=>old.code===ex.code).name);
 assert.equal(JSON.stringify(history),before);
});
test('incomplete current cycle is not skipped; missing execution/RPE never fabricates progression',()=>{
 const history=records('full_body');for(const record of history){record.strengthExecutionFacts={};record.strengthCompletion={completed:false};}
 const review=buildStrengthNextReview({records:history,snapshot,date,asOf:date,trainingType:'full_body',strengthMode:'development'});assert.equal(review.cycle.completedCount,0);assert.equal(review.cycle.status,'in_progress');assert.equal(review.facts.completedMainSets,0);assert.ok(review.proposal.rows.every(row=>row.kg==null));assert.equal(review.decisionNeeded,false);
});
test('medical holds and regional symptoms remain binding in the next-cycle overview',()=>{
 const review=buildStrengthNextReview({records:[],snapshot:{...snapshot,injuryLog:[{date,type:'medical',text:'Запрет врача: повышенная температура 39'}]},date,asOf:date,trainingType:'posterior_chain',strengthMode:'development'});
 assert.equal(review.proposal.status,'medical_hold');assert.equal(review.proposal.rows.length,0);
});
test('local calf adaptation preserves healthy upper-body effort and set count in team review',()=>{
 const baseline=buildStrengthNextReview({records:[],snapshot,date,asOf:date,trainingType:'full_body',strengthMode:'development'});
 const adapted=buildStrengthNextReview({records:[],snapshot:{...snapshot,latestMorning:{date,zoneDetails:{'Икроножная левая':{type:'pain',level10:4}}}},date,asOf:date,trainingType:'full_body',strengthMode:'development'});
 for(const code of ['B1','B2']){const row=adapted.proposal.rows.find(ex=>ex.code===code),before=baseline.proposal.rows.find(ex=>ex.code===code);assert.equal(row.adapted,false);assert.equal(row.rpe,8);assert.equal(row.sets.length,before.sets.length);}
 assert.equal(adapted.proposal.status,'review_required');assert.ok(adapted.proposal.rows.filter(ex=>ex.adapted).every(ex=>ex.kg==null && ex.rpe<=4));
});

import fs from 'node:fs';
import {shiftIsoDate} from '../lib/developmentPlan.mjs';
import {queuePrefix,parseQueueJSON,validWorkspace} from '../lib/teamQueue.mjs';
import {buildStrengthCycle} from '../lib/strengthCycle.mjs';
import {previousCycleId} from '../lib/strengthCycleDecisions.mjs';
for(const workspace of ['zarechie','nkperf'])test(workspace+': actual next-review endpoint validates auth, isolates keys and fails closed on incomplete history',async()=>{
 const source=fs.readFileSync(new URL('../pages/api/players/strength-next-cycle.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm,'').replace('export default ','');
 let unavailable=false;const keys=[];
 const deps={isAuthorized:req=>req.authorized!==false,enforceRateLimit:async()=>true,redis:async(cmd,key)=>{keys.push(key);return null;},getPlayerSnapshot:async(id,days,target,chronic,ws)=>{assert.equal(ws,workspace);return snapshot;},getRecentSessionRecords:async(id,limit,ws,before,options)=>{assert.equal(ws,workspace);assert.equal(options.strict,true);assert.equal(options.includeStrengthExecution,true);if(unavailable)throw Error('storage outage');return [];},buildStrengthCycleReview,buildStrengthNextReview,buildStrengthCycle,previousCycleId,shiftIsoDate,queuePrefix,parseQueueJSON,validWorkspace};
 const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));
 const call=async(query,authorized=true)=>{const res={code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method:'GET',query,authorized},res);return res;};
 const query={workspace,playerId:'synthetic',date,trainingType:'anterior_chain',strengthMode:'maintenance'};
 assert.equal((await call(query,false)).code,401);assert.equal((await call({...query,workspace:'other'})).code,400);assert.equal((await call({...query,date:'2026-02-30'})).code,400);
 const result=await call(query);assert.equal(result.code,200);assert.equal(result.body.facts.completedMainSets,0);assert.ok(keys.every(key=>key.startsWith(queuePrefix(workspace)+':')));unavailable=true;assert.equal((await call(query)).code,503);
});

test('missing actual data lists exact date, exercise and set; bodyweight adaptation never demands kg and stale effort never substitutes session RPE',()=>{
 const history=records('full_body'),first=history[0],exercises=first.session.blocks.flatMap(block=>block.exercises),facts=first.strengthExecutionFacts.actual.exercises;
 const index=exercises.findIndex(ex=>ex.code==='B1'),name=exercises[index].name;
 facts[index].setActuals[0].kg=null;facts[index].setActuals[1].repsRecorded=false;facts[index].actualRpe=null;first.strengthExecutionFacts.actual.sessionRpe=7;
 const review=buildStrengthNextReview({records:history,snapshot,date,asOf:date,trainingType:'full_body',strengthMode:'maintenance'}),missing=review.facts.missing.find(point=>point.date===first.date && point.name===name);
 assert.deepEqual(missing.sets,[{set:1,fields:['kg']},{set:2,fields:['reps']}]);assert.equal(missing.exerciseRpe,true);assert.equal(missing.source,'player_feedback');
 exercises[index].symptomAdapted=true;exercises[index].weightKg=null;const adapted=buildStrengthNextReview({records:history,snapshot,date,asOf:date,trainingType:'full_body',strengthMode:'maintenance'}).facts.missing.find(point=>point.date===first.date && point.name===name);assert.deepEqual(adapted.sets,[{set:2,fields:['reps']}]);
 const cycle=buildStrengthCycleReview(history,{asOf:date}).cycles[0],currentDecision={cycleId:cycle.id,revision:'actual-editor-version',entries:validateCycleDecision(cycle,cycle.exercises.map(row=>({key:row.key,exercise:'keep',progression:'hold',note:'Проверено'})))};
 const editor=buildStrengthNextReview({records:history,snapshot,date,asOf:date,trainingType:'full_body',strengthMode:'maintenance',currentDecision}).decisionEditor;assert.equal(editor.expectedRevision,'actual-editor-version');assert.equal(editor.rows.length,3);assert.equal(editor.entries.length,3);
});
