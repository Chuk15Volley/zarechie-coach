import test from 'node:test';
import assert from 'node:assert/strict';
import {serverWorkoutComplete,playerSessionStatus,restorePlayerProgress,implementWeightLabel,actualLoadLabel} from '../lib/playerPresentation.mjs';
import {compactWorkoutTitle,shortCue} from '../lib/playerGym.mjs';
const session={blocks:[{exercises:[{name:'DB Bench Press',loadUnits:2,targetSets:['5']}]}]};
test('completed server facts take precedence over stale device edits without changing source objects',()=>{
 const server={done:{'0-0-0':true},weights:{'0-0-0':'20'},repetitions:{'0-0-0':'4'},completedAt:'2026-10-14T10:00:00Z',savedAt:'2026-10-14T10:00:00Z'};
 const before=JSON.stringify(server),pending={done:{'0-0-0':false},weights:{'0-0-0':'99'},lastActionAt:'2026-10-15T10:00:00Z'};
 const result=restorePlayerProgress(session,server,pending,pending);
 assert.equal(serverWorkoutComplete(session,server),true);assert.deepEqual(result.done,server.done);assert.deepEqual(result.weights,server.weights);assert.equal(result.completedAt,server.completedAt);assert.equal(JSON.stringify(server),before);
});
test('unfinished workout still restores genuine offline actions',()=>{
 const result=restorePlayerProgress(session,{},null,{startedAt:'2026-10-14T10:00:00Z',weights:{'0-0-0':'18'}});
 assert.equal(result.weights['0-0-0'],'18');assert.equal(serverWorkoutComplete(session,{}),false);
});
test('pair weights retain per-implement numbers, zero and custom prescriptions',()=>{
 const ex=session.blocks[0].exercises[0];assert.equal(implementWeightLabel(ex),'Вес одной гантели, кг');assert.equal(actualLoadLabel(ex,'2.5'),'2 гантели по 2,5 кг');assert.equal(actualLoadLabel(ex,'0'),'2 гантели по 0 кг');assert.equal(actualLoadLabel(ex,''),'');
});
test('titles omit service duplicates while exact training direction remains',()=>{
 assert.equal(compactWorkoutTitle('Копия программы · проверка тренером · Силовая · развивающая · программа · программа · Задняя цепь'),'Силовая · развивающая · Задняя цепь');
});
test('short cue quotes a stored sentence and preserves full instructions separately',()=>{
 const ex={name:'Custom',descriptionOverride:'Медленно опусти таз. Колени направлены над стопами. Вернись в исходное положение.'};
 assert.equal(shortCue(ex),'Колени направлены над стопами.');
});

test('early and skipped completion never claims the whole plan was performed',()=>{
 assert.equal(playerSessionStatus(session,{completedAt:'2026-10-15',finishReason:'Дискомфорт'}),'Завершена раньше');
 assert.equal(playerSessionStatus(session,{completedAt:'2026-10-15',skipped:{'0-0':'Дискомфорт'}}),'Завершена с пропусками');
});
