import test from 'node:test';
import assert from 'node:assert/strict';
import {nextWorkoutSet,restSecondsFor,restAfterWorkoutSet,restTransitionKind,completedSetCount} from '../lib/playerWorkout.mjs';
import {isCircuit} from '../lib/playerGym.mjs';
const block={label:'B',exerciseOrder:'sequential',restSeconds:150,transitionRestSeconds:60,rest_note:'150 сек между подходами; 60 сек на переход между упражнениями. Выполнить все подходы упражнения последовательно.',exercises:[{code:'B1',targetSets:['7','7']},{code:'B2',targetSets:['10','10']}]};
test('Burkova B: set pause is 150s, completed B1 transitions to B2 in 60s',()=>{
 const session={blocks:[block]};assert.equal(isCircuit(block),false);
 let done={'0-0-0':true};let rest=restAfterWorkoutSet(session,done,{}, {block,ex:block.exercises[0],bi:0,ei:0,si:0});
 assert.equal(rest.next.key,'0-0-1');assert.equal(rest.kind,'set');assert.equal(rest.seconds,150);
 done['0-0-1']=true;rest=restAfterWorkoutSet(session,done,{}, {block,ex:block.exercises[0],bi:0,ei:0,si:1});
 assert.equal(rest.next.key,'0-1-0');assert.equal(rest.kind,'exercise');assert.equal(rest.seconds,60);
});
test('120s round or exercise set rests never leak into a 60s exercise transition',()=>{
 const pair={...block,exerciseOrder:'circuit',restSeconds:120,roundRestSeconds:120,rest_note:'60 сек между упражнениями и 120 сек после круга'};
 assert.equal(isCircuit(pair),true);
 const first={block:pair,ex:{...pair.exercises[0],restSeconds:120},bi:0,ei:0,si:0};
 let rest=restAfterWorkoutSet({blocks:[pair]},{'0-0-0':true},{},first);
 assert.equal(rest.next.key,'0-1-0');assert.equal(rest.seconds,60);assert.equal(rest.kind,'exercise');
 rest=restAfterWorkoutSet({blocks:[pair]},{'0-0-0':true,'0-1-0':true},{},{block:pair,ex:pair.exercises[1],bi:0,ei:1,si:0});
 assert.equal(rest.next.key,'0-0-1');assert.equal(rest.seconds,120);assert.equal(rest.kind,'round');
});
test('timer and next label stay in manually opened block, despite earlier incomplete work',()=>{
 const first={...block,label:'A'};const session={blocks:[first,block]};
 const rest=restAfterWorkoutSet(session,{'1-0-0':true,'1-0-1':true},{},{block,ex:block.exercises[0],bi:1,ei:0,si:1});
 assert.equal(rest.next.key,'1-1-0');assert.equal(rest.kind,'exercise');assert.equal(rest.seconds,60);
});
test('visible transition note outranks stale structured metadata; absent transitions default to 60, not round rest',()=>{
 const next={bi:0,ei:1,si:0,exercise:{code:'B2'}};
 assert.equal(restSecondsFor({...block,transitionRestSeconds:120},block.exercises[0],{bi:0,ei:0,si:1,next}),60);
 assert.equal(restSecondsFor({label:'B',restSeconds:120,rest_note:'120 сек после блока'},{},{bi:0,ei:0,si:0,next}),60);
 assert.equal(restSecondsFor({}, {restSeconds:45}),45);
});
test('skipped exercises cannot trigger a false round timer or a timer after final completion',()=>{
 const session={blocks:[block]};const context={block,ex:block.exercises[0],bi:0,ei:0,si:1};
 assert.equal(restAfterWorkoutSet(session,{'0-0-0':true,'0-0-1':true},{'0-1':'Пропуск'},context).seconds,0);
 assert.equal(restTransitionKind(block,{...context,next:null}),'finished');
});
test('explicit block pause applies only after the entire block, not after an exercise or round',()=>{
 const a={...block,rest_note:'150 сек между подходами; 60 сек между упражнениями; 120 сек после блока'};
 const session={blocks:[a,{...block,label:'C'}]};
 const done={'0-0-0':true,'0-0-1':true};
 let rest=restAfterWorkoutSet(session,done,{}, {block:a,ex:a.exercises[0],bi:0,ei:0,si:1});
 assert.equal(rest.seconds,60);assert.equal(rest.kind,'exercise');
 Object.assign(done,{'0-1-0':true,'0-1-1':true});
 rest=restAfterWorkoutSet(session,done,{}, {block:a,ex:a.exercises[1],bi:0,ei:1,si:1});
 assert.equal(rest.seconds,120);assert.equal(rest.kind,'block');assert.equal(rest.next.key,'1-0-0');
 const b={...a,rest_note:'',blockRestSeconds:90};
 assert.equal(restSecondsFor(b,b.exercises[1],{bi:0,ei:1,si:1,next:rest.next}),90);
});
test('explicit zero rest permits immediate transitions; missing values retain the normal fallback',()=>{
 const next={bi:0,ei:1,si:0,exercise:{code:'B2'}};
 for(const value of [0,'0']) {
  assert.equal(restSecondsFor({transitionRestSeconds:value},{},{bi:0,ei:0,si:0,next}),0);
  assert.equal(restSecondsFor({}, {restSeconds:value}),0);
 }
 for(const value of [null,undefined,'',' ']) {
  assert.equal(restSecondsFor({transitionRestSeconds:value},{},{bi:0,ei:0,si:0,next}),60);
 }
});
test('power intervals use their own pause rather than the longer exercise transition',()=>{
 const a={...block,restSeconds:undefined,transitionRestSeconds:undefined,rest_note:'75–90 сек между качественными отрезками; 2 мин между упражнениями.'};
 const context={block:a,ex:a.exercises[0],bi:0,ei:0,si:0};
 const rest=restAfterWorkoutSet({blocks:[a]},{'0-0-0':true},{},context);
 assert.equal(rest.seconds,90);assert.equal(rest.kind,'set');
 const transition=restAfterWorkoutSet({blocks:[a]},{'0-0-0':true,'0-0-1':true},{},{...context,si:1});
 assert.equal(transition.seconds,120);assert.equal(transition.kind,'exercise');
 const onlyBlockPause={...a,rest_note:'120 сек после блока'};
 assert.equal(restSecondsFor(onlyBlockPause,{}, {bi:0,ei:0,si:0,next:{bi:0,ei:0,si:1}}),60);
});

test('removed or legacy set keys cannot prematurely finish a revised program',()=>{
 const session={blocks:[block]};
 assert.equal(completedSetCount(session,{'0-0-0':true,'0-0-1':true,'4-0-0':true,'0-0-4':true}),2);
 assert.equal(completedSetCount(session,{'0-0-0':false}),0);
});
