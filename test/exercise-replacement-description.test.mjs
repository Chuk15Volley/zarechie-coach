import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceExerciseDescription,refreshExerciseDescription,reconcileReplacementDescriptions} from '../lib/exerciseReplacement.mjs';
import {exerciseDescription,normalizeSessionTempoDescriptions} from '../lib/tempoDescription.mjs';
import {canonicalExerciseId} from '../lib/exerciseIdentity.mjs';
const original={code:'A1',name:'Supine Heel Slide',cue:'Старая подсказка пяткой.',compactDescription:'Старое описание пяткой.',coaching_note:'Старое примечание.',descriptionOverride:'Старое описание тренера.',targetSets:['20 sec','20 sec'],weightKg:22,controlledExecution:true,symptomAdapted:true};
const session=ex=>({blocks:[{label:'A',exercises:[ex]}]});
test('library, alternatives and typed names refresh all inherited description fields immediately',()=>{
 for(const name of ['Goblet Squat ISO','45° Hyperextension','Copenhagen Adductor Plank ISO Hold','DB Bench Press','Seated Ankle Circles','Custom Movement']) {
  const next=replaceExerciseDescription(original,{name});const text=exerciseDescription(next);
  assert.ok(text);assert.doesNotMatch(text,/Стар|пяткой/);assert.equal(next.descriptionOverride,undefined);assert.equal(next.compactDescription,undefined);assert.equal(next.coaching_note,undefined);
  assert.equal(next.descriptionExerciseId,canonicalExerciseId(name));assert.deepEqual(next.targetSets,original.targetSets);assert.equal(next.weightKg,null);assert.equal(next.symptomAdapted,true);assert.equal(next.controlledExecution,true);
 }
 assert.match(exerciseDescription(replaceExerciseDescription(original,{name:'Goblet Squat ISO'})),/у груди.*стопы.*Удерживать/);
 assert.match(exerciseDescription(replaceExerciseDescription(original,{name:'45° Hyperextension'})),/сгиба таза.*тазобедренных/);
 assert.match(exerciseDescription(replaceExerciseDescription(original,{name:'Copenhagen Adductor Plank ISO Hold'})),/верхнюю ногу.*опор/);
});
test('editing sets, loads or coach text does not discard an intentional description',()=>{
 for(const patch of [{targetSets:['8']},{weightKg:10},{name:original.name},{descriptionOverride:'Моя новая подсказка.'}]) {
  const next=replaceExerciseDescription(original,patch);assert.equal(next.descriptionOverride,patch.descriptionOverride||original.descriptionOverride);
 }
});
test('description follows identity on rendering, save normalization, reload and player view',()=>{
 const stamped=normalizeSessionTempoDescriptions(session(original)).blocks[0].exercises[0];
 const renamed={...stamped,name:'Goblet Squat ISO'};
 assert.doesNotMatch(exerciseDescription(renamed),/Стар|пяткой/);
 const saved=normalizeSessionTempoDescriptions(session(renamed));
 const reloaded=JSON.parse(JSON.stringify(saved)).blocks[0].exercises[0];
 assert.equal(exerciseDescription(reloaded),exerciseDescription(renamed));
 assert.match(exerciseDescription(reloaded),/у груди/);
});
test('legacy client saves remove inherited descriptions and preserve new coach or model text',()=>{
 const renamed={...original,name:'Goblet Squat ISO'};
 const saved=reconcileReplacementDescriptions(session(renamed),session(original)).blocks[0].exercises[0];
 assert.doesNotMatch(exerciseDescription(saved),/Стар|пяткой/);
 const custom=reconcileReplacementDescriptions(session({...renamed,descriptionOverride:'Новое описание приседа.'}),session(original)).blocks[0].exercises[0];
 assert.equal(exerciseDescription(custom),'Новое описание приседа.');
 const model=reconcileReplacementDescriptions(session({code:'A1',name:'DB Bench Press',cue:'Новая техника жима.'}),session(original)).blocks[0].exercises[0];
 assert.match(exerciseDescription(model),/Новая техника жима/);
});
test('new exercise descriptions do not depend on training method or workspace',()=>{
 for(const workspace of ['zarechie','nkperf']) for(const focus of ['inseason_strength','inseason_power','inseason_prophylaxis','hypertrophy','isometric','inseason_deload','match_day','warmup','rehab']) {
  const next=normalizeSessionTempoDescriptions({...session(replaceExerciseDescription(original,{name:'Goblet Squat ISO'})),workspace,focus});
  assert.match(exerciseDescription(next.blocks[0].exercises[0]),/у груди/);
 }
});
