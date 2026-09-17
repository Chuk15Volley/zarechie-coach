import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeWorkoutProgress } from '../lib/workoutProgress.mjs';
import { completedTonnage, nextWorkoutSet } from '../lib/playerWorkout.mjs';
import { previousPerformances } from '../lib/playerExperience.mjs';
import { actualTarget, targetLabel, repetitionInput, focusExerciseIndex, isCircuit, playerExerciseName } from '../lib/playerGym.mjs';
const session = { blocks: [{ label:'A', exercises:[{name:'Chest-Supported DB Row',loadUnits:2,targetSets:['12','12']},{name:'Side Plank',targetSets:['30 сек/side']}] }] };
test('rep entry survives merges, older devices cannot overwrite newer counts, invalid values are discarded', () => {
 const now='2026-09-17T10:00:00Z', later='2026-09-17T11:00:00Z';
 const saved=mergeWorkoutProgress({}, {repetitions:{'0-0-0':'8'},repsUpdatedAt:{'0-0-0':later}},later);
 const merged=mergeWorkoutProgress(saved,{repetitions:{'0-0-0':'12','0-0-1':'bad','0-1-0':-1,'x':'5'},repsUpdatedAt:{'0-0-0':now}},later);
 assert.deepEqual(merged.repetitions,{'0-0-0':'8'});
 assert.equal(mergeWorkoutProgress(merged,{repetitions:{'0-0-0':'0'},repsUpdatedAt:{'0-0-0':'2026-09-17T12:00:00Z'}}).repetitions['0-0-0'],'0');
});
test('actual reps drive tonnage and previous results instead of the plan',()=>{
 const log={done:{'0-0-0':true},weights:{'0-0-0':'16'},repetitions:{'0-0-0':'8'}};
 assert.equal(completedTonnage(session,log.done,log.weights,log.repetitions),256);
 assert.equal(completedTonnage(session,log.done,log.weights,{'0-0-0':'0'}),0);
 const previous=previousPerformances([{date:'2026-09-16',session,log}],'2026-09-17');
 assert.equal(previous['chest-supported db row'].sets[0].target,'8');
 assert.equal(completedTonnage(session,log.done,log.weights),384);
});
test('time prescriptions stay time, unilateral rep entry keeps both sides',()=>{
 assert.equal(repetitionInput('30 сек/side'),null);
 assert.equal(actualTarget('30 сек/side',12),'30 сек/side');
 assert.equal(actualTarget('10/side',8),'8/side');
 assert.equal(targetLabel('10/side'),'10 повт. / сторону');
});
test('focused exercise advances after completion or skip; circuit order remains round-based',()=>{
 assert.equal(focusExerciseIndex(session.blocks[0],0,{'0-0-0':true,'0-0-1':true}),1);
 assert.equal(focusExerciseIndex(session.blocks[0],0,{}, {'0-0':'Занят тренажёр'}),1);
 const block={rest_note:'После пары 60 сек',exercises:[{targetSets:['10','10']},{targetSets:['8','8']}]};
 assert.equal(isCircuit(block),true);
 assert.equal(nextWorkoutSet({blocks:[block]},{'0-0-0':true}).ei,1);
 assert.equal(playerExerciseName({name:'Unknown exact movement'}),'Unknown exact movement');
});

test('stored unilateral actuals are not doubled again when shown as previous results', () => {
 const unilateral = { blocks:[{label:'A',exercises:[{name:'Row',targetSets:['10/side']}]}] };
 const previous=previousPerformances([{date:'2026-09-16',session:unilateral,actual:{exercises:[{name:'Row',block:'A',setActuals:[{completed:true,target:'10/side',reps:12,kg:8}]}]}}],'2026-09-17');
 assert.equal(previous.row.sets[0].target,'6/side');
});
