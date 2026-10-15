import test from 'node:test';
import assert from 'node:assert/strict';
import {serverWorkoutComplete,playerSessionStatus,restorePlayerProgress,implementWeightLabel,actualLoadLabel,visibleLoadPrescription,resultInputsChanged,weightChangeLabels,historyMonthGroups} from '../lib/playerPresentation.mjs';
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

test('generic historical load instruction does not invent external load or bodyweight for locomotion',()=>{
 const label='Вес назначить индивидуально по фактической истории';
 assert.equal(visibleLoadPrescription({name:'Drop Step to Sprint'},label),'');
 assert.equal(visibleLoadPrescription({name:'Barbell RDL'},label),'Вес уточнить у тренера');
 assert.equal(visibleLoadPrescription({name:'Custom'},'Лёгкое сопротивление'),'Лёгкое сопротивление');
});
test('short cue preserves a complete sentence across semicolons and all source text',()=>{
 const ex={name:'Custom',descriptionOverride:'Мяч к груди под контролем; затем выполни бросок. Вернись в стойку.'};
 const before=JSON.stringify(ex);
 assert.equal(shortCue(ex),'Мяч к груди под контролем; затем выполни бросок.');
 assert.equal(JSON.stringify(ex),before);
});
test('unchanged corrections cannot create an edit, including decimal notation and absent legacy reps',()=>{
 const ex={name:'DB Bench Press',loadUnits:2};
 const base={ex,target:'8',weight:'2.5',repetitions:undefined,kg:'2,50',reps:'8'};
 assert.equal(resultInputsChanged(base),false);
 assert.equal(resultInputsChanged({...base,kg:'3'}),true);
 assert.equal(resultInputsChanged({...base,reps:'7'}),true);
 assert.equal(resultInputsChanged({ex:{name:'Shuffle'},target:'3 м/6',kg:'',reps:''}),false);
});
test('summary labels keep exact one-implement kg, pair count, zero and session intact',()=>{
 const before=JSON.stringify(session);
 assert.deepEqual(weightChangeLabels(session,{code:undefined,name:'DB Bench Press',planned:3,actual:[2.5,0]}),{planned:'2 гантели по 3 кг',actual:'2 гантели по 2,5 кг / 2 гантели по 0 кг'});
 assert.equal(JSON.stringify(session),before);
});
test('month groups include the year, preserve record identity/order and tolerate unknown dates',()=>{
 const items=[{date:'2026-10-15',id:1},{date:'2026-10-13',id:2},{date:'2026-09-30',id:3},{date:'2025-10-01',id:4},{date:'bad',id:5}];
 const result=historyMonthGroups(items);
 assert.deepEqual(result.map(g=>g.key),['2026-10','2026-09','2025-10','other']);
 assert.match(result[0].label,/октябрь 2026/);assert.equal(result[0].items[0],items[0]);
 assert.deepEqual(result.flatMap(g=>g.items),items);
});
