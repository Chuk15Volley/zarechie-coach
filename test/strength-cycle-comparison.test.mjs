import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildStrengthCycleReview} from '../lib/strengthCycleReview.mjs';
import {compareStrengthCycles} from '../lib/strengthCycleComparison.mjs';
import {STRENGTH_CYCLE_VERSION} from '../lib/strengthCycle.mjs';
import {shiftIsoDate} from '../lib/developmentPlan.mjs';
const asOf='2026-10-12';
function record(day,{kg=20,reps=5,rpe=7,name='DB Bench Press',loadUnits=2,trainingType='anterior_chain',perSide=false,done=true,sets=2,doseReason='full',strengthMode='maintenance',...patch}={}) {
 const date='2026-10-'+String(day).padStart(2,'0'),id=day<=4?'2026-10-01':'2026-10-05';
 const target=String(reps)+(perSide?'/side':'');
 const ex={code:'B1',name,loadUnits,doseReason,targetRpeMax:8,targetSets:Array(sets).fill(target)};
 const decision=day>4?{version:'strength-cycle-decision-v1',cycleId:'2026-10-01',revision:'original',entries:[{code:'B1',trainingType,name:'DB Bench Press',exercise:'keep',progression:'hold',note:'Закрепить технику'}]}:null;
 const actual={source:'player_feedback',savedAt:date+'T12:00:00Z',sessionRpe:9,exercises:[{name,block:'B',loadUnits,plannedSets:sets,completed:done,actualRpe:rpe,setActuals:ex.targetSets.map(target=>({target,completed:done,kg,reps:perSide?reps*2:reps,repsRecorded:true}))}]};
 return {date,savedAt:date+'T10:00:00Z',focus:'inseason_strength',trainingType,strengthMode,session:{methodology:{strengthCycle:{version:STRENGTH_CYCLE_VERSION,id},coachCycleDecision:decision,coachCycleDecisionEffects:[{code:'B1',status:'applied'}],externalLoad:{source:'ReadySix',playedSets:3,recentCourtLoad:300,travelDates:['2026-10-01'],reasons:[],missing:[]}},blocks:[{label:'B',exercises:[ex]}]},strengthExecutionFacts:{actual},...patch};
}
const records=options=>[1,2,3,4,5,6,7,8].map(day=>record(day,day>4?options:{}));
const compare=input=>buildStrengthCycleReview(input,{asOf}).cycles[0].comparison;
test('two completed adjacent cycles compare last exact exposures and retain original coach decisions',()=>{
 const review=buildStrengthCycleReview(records({kg:21}),{asOf});const c=review.cycles[0].comparison,row=c.rows[0];
 assert.equal(c.status,'ready');assert.equal(c.previousId,'2026-10-01');assert.equal(c.currentId,'2026-10-05');
 assert.equal(row.before.date,'2026-10-04');assert.equal(row.after.date,'2026-10-08');assert.deepEqual(row.delta,{kg:1,reps:0,exerciseRpe:null});assert.equal(row.effortComparable,false);
 assert.equal(row.decisions.length,4);assert.equal(row.decisions[3].progression,'hold');assert.equal(row.decisions[3].revision,'original');
 review.cycles[1].decision={revision:'edited-after-completion',entries:[]};
 assert.deepEqual(compareStrengthCycles(review.cycles[0],review.cycles[1]).rows[0].decisions,row.decisions);
 assert.equal(c.context.after.exposures.length,4);assert.equal(c.context.after.exposures[0].playedSets,3);
});
test('RPE difference needs same kg, reps and dose; session RPE is never a substitute',()=>{
 let row=compare(records({rpe:6})).rows[0];assert.equal(row.delta.exerciseRpe,-1);assert.equal(row.effortComparable,true);
 row=compare(records({reps:6,rpe:6})).rows[0];assert.equal(row.delta.reps,1);assert.equal(row.delta.exerciseRpe,null);
 row=compare(records({rpe:null})).rows[0];assert.equal(row.after.exerciseRpe,null);assert.equal(row.after.sessionRpe,9);assert.equal(row.delta.exerciseRpe,null);
});
test('different variants, chains and implement counts never transfer kg',()=>{
 for(const options of [{name:'DB Incline Bench Press'},{trainingType:'posterior_chain'},{loadUnits:1}]){
  const c=compare(records(options));assert.equal(c.rows.length,2);assert.ok(c.rows.every(row=>row.delta===null));assert.deepEqual(c.rows.map(row=>row.status),['new_variant','previous_variant']);
 }
});
test('rotation decision is shown beside the new variant without claiming weight progress',()=>{
 const input=records({name:'DB Incline Bench Press'});
 for(const r of input.slice(4)){r.session.methodology.coachCycleDecision.entries[0].exercise='rotate';}
 const c=compare(input);assert.equal(c.rows[0].decisions[0].exercise,'rotate');assert.equal(c.rows[0].decisions[0].requestedName,'DB Bench Press');assert.equal(c.rows[0].delta,null);
});
test('partial/undone, saved-only and future sessions never complete the pair or skip a neighbouring cycle',()=>{
 const input=records();input[7].strengthExecutionFacts.actual.exercises[0].completed=false;input[7].strengthExecutionFacts.actual.exercises[0].setActuals[0].completed=false;
 assert.equal(compare(input).status,'awaiting_completion');assert.equal(compare(input).currentCompleted,3);
 input[7]=record(8);input[7].strengthExecutionFacts={};assert.equal(compare(input).status,'awaiting_completion');
 const future=record(13);assert.equal(compare([...records(),future]).currentId,'2026-10-05');
 const review=buildStrengthCycleReview(records().slice(0,4),{asOf});assert.equal(review.cycles[0].comparison.status,'no_previous');
 const extra=record(10);extra.session.methodology.strengthCycle.id='2026-10-09';const pending=compare([...records(),extra]);assert.equal(pending.status,'awaiting_completion');assert.equal(pending.previousId,'2026-10-05');
});
test('missing latest fact cannot fall back to an older convenient exposure or planned weight',()=>{
 const input=records({kg:22});input[7].session.blocks[0].exercises[0].weightKg=100;input[7].strengthExecutionFacts.actual.exercises[0].setActuals[0].kg=null;
 const row=compare(input).rows[0];assert.equal(row.after.date,'2026-10-08');assert.equal(row.status,'missing_or_mixed_sets');assert.equal(row.delta,null);
});
test('mixed set weights and dosage changes keep facts visible without misleading deltas',()=>{
 const mixed=records();mixed[7].strengthExecutionFacts.actual.exercises[0].setActuals[1].kg=22;assert.equal(compare(mixed).rows[0].status,'missing_or_mixed_sets');
 for(const options of [{doseReason:'secondary_chain'},{sets:1},{strengthMode:'development'}]){
  const row=compare(records(options)).rows[0];assert.equal(row.status,'dose_changed');assert.equal(row.delta,null);assert.ok(row.after.sets.length);
 }
 const unknown=records();delete unknown[7].session.blocks[0].exercises[0].doseReason;assert.equal(compare(unknown).rows[0].status,'context_unknown');
 const adapted=records();adapted[7].session.blocks[0].exercises[0].symptomAdapted=true;assert.equal(compare(adapted).rows[0].status,'adapted');
});
test('unilateral feedback uses repetitions per side; changed units prevent comparison',()=>{
 const input=[1,2,3,4,5,6,7,8].map(day=>record(day,{perSide:true,reps:day<=4?5:6}));
 const row=compare(input).rows[0];assert.equal(row.before.reps,5);assert.equal(row.after.reps,6);assert.equal(row.delta.reps,1);assert.equal(row.after.perSide,true);
 assert.equal(compare(records({perSide:true})).rows[0].status,'units_changed');
});
test('different decision source is excluded and undo-after-feedback invalidates completion',()=>{
 const input=records();input[7].session.methodology.coachCycleDecision.cycleId='2026-09-01';assert.equal(compare(input).rows[0].decisions.length,3);
 input[7].strengthExecutionFacts.log={savedAt:'2026-10-08T13:00:00Z',lastActionAt:'2026-10-08T13:00:00Z',completedAt:null,done:{'0-0-0':false,'0-0-1':true}};
 assert.equal(compare(input).status,'awaiting_completion');
});
for(const workspace of ['zarechie','nkperf'])test(`${workspace}: authorised review returns server-built comparison with workspace isolation`,async()=>{
 const source=readFileSync(new URL('../pages/api/players/strength-cycle-review.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
 const calls=[];const deps={redis:async()=>null,pfx:ws=>ws==='nkperf'?'nkperf':'coach',isAuthorized:req=>req.auth!==false,shiftIsoDate,buildStrengthCycleReview,getRecentSessionRecords:async(...args)=>{calls.push(args);return args[2]===workspace?records():[];}};
 const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));
 const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 await handler({method:'GET',query:{workspace,playerId:'synthetic',asOf}},res);assert.equal(res.code,200);assert.equal(res.data.cycles[0].comparison.status,'ready');assert.equal(calls[0][2],workspace);
 await handler({method:'GET',query:{workspace:workspace==='zarechie'?'nkperf':'zarechie',playerId:'synthetic',asOf}},res);assert.deepEqual(res.data.cycles,[]);
 await handler({method:'GET',auth:false,query:{workspace,playerId:'synthetic'}},res);assert.equal(res.code,401);
});

test('overlapping completion dates do not masquerade as sequential cycles',()=>{
 const input=records();input[3].date='2026-10-07';input[3].savedAt='2026-10-07T10:00:00Z';input[3].strengthExecutionFacts.actual.savedAt='2026-10-07T12:00:00Z';
 input[6].date='2026-10-09';input[6].savedAt='2026-10-09T10:00:00Z';input[6].strengthExecutionFacts.actual.savedAt='2026-10-09T12:00:00Z';
 assert.equal(compare(input).status,'overlapping_cycles');
});

test('malformed saved decision metadata cannot break factual review or become a historical decision',()=>{
 const input=records();input[7].session.methodology.coachCycleDecision.entries={unexpected:true};input[7].session.methodology.coachCycleDecisionEffects={unexpected:true};
 const result=compare(input);assert.equal(result.status,'ready');assert.equal(result.rows[0].decisions.length,3);
 input[6].session.methodology.coachCycleDecision.entries=[null,{code:'B1',trainingType:'anterior_chain',name:'DB Bench Press',exercise:'force',progression:'force'}];
 assert.equal(compare(input).rows[0].decisions.length,2);
});
