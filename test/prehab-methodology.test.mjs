import { normalizeSessionTempoDescriptions, exerciseDescription } from '../lib/tempoDescription.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrehabResult, PREHAB_VERSION } from '../lib/prehabMethodology.mjs';
import { recommendGymSession } from '../lib/readySixGym.mjs';
function fixture({ upper=100, lower=100, pain=false, future=false }={}) {
 const snapshot={player:{id:'synthetic'},readySixDecision:{recommendation:lower===0?'load_stop':'full',capPercent:lower===0?0:100,hardStopSignal:lower===0,
  reasons:pain?['Боль Поясница; исключить осевую нагрузку']:[],targets:[
   {target:'strength_upper',healthCapPercent:upper,capPercent:0,hardStopSignal:upper===0,planApplicability:'not_planned'},
   {target:'strength_lower',healthCapPercent:lower,capPercent:0,hardStopSignal:lower===0,planApplicability:'not_planned'},
  ]},...(future?{readySixPlanning:{preliminary:true,assessmentDate:'2026-09-17'}}:{})};
 const date=future?'2026-09-18':'2026-09-17';
 return {snapshot,recommendation:recommendGymSession({snapshot,targetDate:date}),date};
}
const exercises=result=>result.session.blocks.flatMap(b=>b.exercises);
const count=(result,region)=>exercises(result).filter(e=>e.prehabRegion===region).reduce((n,e)=>n+e.targetSets.length,0);

test('general prevention covers permitted chains and contains a complete structured session',()=>{
 const result=buildPrehabResult(fixture());
 assert.equal(result.focus,'inseason_prophylaxis'); assert.equal(result.session.methodology.version,PREHAB_VERSION);
 assert.equal(exercises(result).length,9); assert.equal(count(result,'upper'),7); assert.equal(count(result,'lower'),7);
 assert.equal(count(result,'unloaded'),2); assert.equal(result.autoSaved,false);
 assert.ok(exercises(result).every(e=>e.targetSets.length>0 && e.autoReg && e.cue && e.alternatives.length===0));
});

test('future regional prehab is not the old four-exercise fallback and never loads the blocked region',()=>{
 const input=fixture({lower:0,pain:true,future:true}); const before=structuredClone(input);
 const result=buildPrehabResult({...input,playerRestrictions:['AXIAL','JUMP']});
 assert.equal(exercises(result).length,6); assert.equal(count(result,'upper'),9); assert.equal(count(result,'lower'),0);
 assert.equal(result.session.methodology.localTherapyPrescribed,false);
 assert.equal(result.session.methodology.assessmentDate,'2026-09-17');
 assert.equal(result.session.methodology.targetDate,'2026-09-18');
 assert.match(result.session.warnings,/Предварительная/); assert.match(result.session.warnings,/нет отдельного назначения/);
 assert.equal(result.quality.medicalReviewRequired,true); assert.equal(result.quality.readySixState.hardStop,true);
 assert.deepEqual(input,before);
});

test('regional caps and coach reduction apply separately and never raise allowed set budgets',()=>{
 const result=buildPrehabResult({...fixture({upper:50,lower:100}),coachRecovery:'yellow'});
 assert.equal(count(result,'upper'),Math.floor(7*0.5*0.75));
 assert.equal(count(result,'lower'),Math.floor(7*0.75));
 const red=buildPrehabResult({...fixture({lower:0}),coachRecovery:'red'});
 assert.ok(count(red,'upper')<=Math.floor(9*0.6));
});

test('incompatible coach restrictions remove affected patterns',()=>{
 const result=buildPrehabResult({...fixture(),playerRestrictions:['SHOULDER','ANKLE','AXIAL']});
 assert.equal(result,null,'no compatible exercise remains');
 assert.equal(buildPrehabResult({...fixture(),playerRestrictions:['UNKNOWN']}),null);
});

test('missing, duplicate, empty and stopped permissions are not treated as healthy',()=>{
 for(const mode of ['missing','duplicate','null','stop','tiny']) {
  const input=fixture({lower:0}); const targets=input.recommendation.state.targets;
  if(mode==='missing') targets.splice(0,1);
  if(mode==='duplicate') targets.push({...targets[0]});
  if(mode==='null') targets[0].healthCapPercent=null;
  if(mode==='stop') targets[0].hardStopSignal=true;
  if(mode==='tiny') targets[0].healthCapPercent=20;
  assert.equal(buildPrehabResult(input),null,mode);
 }
});

test('no local rehab is invented from an undiagnosed symptomatic shoulder',()=>{
 const input=fixture(); input.recommendation.state.detail='Боль плечо, нужна оценка';
 const result=buildPrehabResult(input);
 assert.equal(count(result,'upper'),0); assert.ok(count(result,'lower')>0);
 assert.equal(result.session.methodology.localTherapyPrescribed,false);
});


test('saving and player descriptions preserve controlled prehab tempo, including static work',()=>{
 const result=buildPrehabResult(fixture());
 const normalized=normalizeSessionTempoDescriptions(result.session);
 for(const exercise of normalized.blocks.flatMap(block=>block.exercises)) {
  assert.doesNotMatch(exercise.cue,/максимально резко/);
  assert.doesNotMatch(exerciseDescription(exercise),/максимально резко/);
 }
 assert.deepEqual(normalizeSessionTempoDescriptions(normalized),normalized,'normalization remains idempotent');
});
