import test from 'node:test';import assert from 'node:assert/strict';
import {requestCoachProgression} from '../lib/coachProgressionRequest.mjs';
import {findProgramExercises,correctionCheckTargets,isGenericCopyAssessment,libraryVariantMatches,additionalSourceReasons,performanceSearch,remainingQueueCount} from '../lib/coachNextWork.mjs';
const input={workspace:'nkperf',playerId:'fixture',date:'2026-10-13',focus:'inseason_strength',exercises:[]};
const response=(status,body)=>({ok:status===200,status,json:async()=>body});
test('temporary progression source failure retries once, before optional history, preserving exact input',async()=>{
 const calls=[],original=JSON.stringify(input);let n=0;
 const result=await requestCoachProgression({input,retryDelayMs:0,fetcher:async(path,options)=>{calls.push(path);assert.equal(options.body,original);return path.endsWith('ex-history')?response(200,{histories:{}}):++n===1?response(503,{error:'Временно недоступно'}):response(200,{engine:'strength-generator-v2',progressionBySlot:{checked:true}});}});
 assert.deepEqual(calls,['/api/players/progression','/api/players/progression','/api/players/ex-history']);assert.deepEqual(result.progression,{checked:true});assert.equal(JSON.stringify(input),original);
});
test('clinical refusal, invalid engine and persistent failure never fall back or start history',async()=>{
 for(const status of [400,401,422,429,503]){let calls=0;await assert.rejects(requestCoachProgression({input,retryDelayMs:0,fetcher:async()=>{calls++;return response(status,{error:'Отказ источника'});}}),/Отказ источника/);assert.equal(calls,status===503?2:1);}
});
test('external cancellation during retry stops late results',async()=>{
 const ctrl=new AbortController();let calls=0;const promise=requestCoachProgression({input,signal:ctrl.signal,fetcher:async()=>{calls++;ctrl.abort();return response(503,{error:'temporary'});}});await assert.rejects(promise,{name:'AbortError'});assert.equal(calls,1);
});
test('exact program navigation and check targets preserve all records',()=>{
 const blocks=[{label:'A',exercises:[{code:'A1',name:'DB Romanian Deadlift',targetSets:['4','4'],weightKg:null,alternatives:[]}]},{label:'B',exercises:[{code:'B1',name:'Barbell Press',weightKg:50,alternatives:['A','B']}]}],before=JSON.stringify(blocks);
 assert.equal(findProgramExercises(blocks,'a1')[0].name,'DB Romanian Deadlift');assert.equal(findProgramExercises(blocks,'румынская')[0].code,'A1');assert.equal(correctionCheckTargets('Вес/RPE',blocks)[0].field,'плановый вес в кг');assert.deepEqual(correctionCheckTargets('Альтернативы',blocks).map(r=>r.code),['A1']);assert.equal(JSON.stringify(blocks),before);
});
test('only exact generic copy prose folds; an appended clinical instruction never folds',()=>{
 const text='Копия структуры программы для индивидуальной проверки тренером. Перед сохранением проверьте состояние ReadySix, ограничения, упражнения и дозировку получателя.';assert.equal(isGenericCopyAssessment(text),true);assert.equal(isGenericCopyAssessment(text+' Боль требует адаптации.'),false);
});
test('variant discovery never merges exact IDs, and retains unknown dynamics',()=>{
 const cards=['DB Romanian Deadlift','Single-Leg DB Romanian Deadlift','Dummbell Romanian Deadlift ISO Hold (Two-Hand)','Supported Kickstand Romanian Deadlift'];assert.deepEqual(cards.filter(n=>libraryVariantMatches(n,'hold')),[cards[2]]);assert.deepEqual(cards.filter(n=>libraryVariantMatches(n,'single')),[cards[1]]);assert.equal(cards.filter(n=>libraryVariantMatches(n)).length,4);
});
test('expanded source retains additional qualifiers while removing verbatim repeated fragments',()=>{
 const reasons=['Боль Плечо 2/10 WHOOP: контекст','Ограничить прыжки'];assert.deepEqual(additionalSourceReasons(reasons,['Боль Плечо 2/10','Ограничить прыжки']),['WHOOP: контекст']);assert.equal(remainingQueueCount({rows:[{saved:true},{saved:false},{status:'error'}]}),2);
});
test('facts search keeps variant/implement/chain identity separate and never changes observations',()=>{
 const series=[{key:'pair',code:'B1',name:'DB Bench Press',loadUnits:2},{key:'single',code:'B1',name:'DB Bench Press',loadUnits:1}];assert.deepEqual(performanceSearch(series,'гантели жим').map(r=>r.key),['pair','single']);assert.deepEqual(performanceSearch(series,'c1'),[]);assert.equal(series.length,2);
});
test('proposal evidence never calls absent history zero completion or planned kg performed',async()=>{
 const {progressionBasisLabel}=await import('../lib/coachNextWork.mjs');const label=progressionBasisLabel({date:'2026-10-15',source:'planned',completionPercent:0,recentExposures:[]},d=>d);assert.match(label,/плановый вес/);assert.match(label,/процент выполнения не подтверждён/);assert.ok(!label.includes('0%'));
});
test('restored previous-queue metadata retains its actual remaining count; absent count is unknown',()=>{
 assert.equal(remainingQueueCount({id:'prior',date:'2026-10-13',remaining:3}),3);assert.equal(remainingQueueCount({id:'prior',date:'2026-10-13'}),null);assert.equal(remainingQueueCount({remaining:0}),0);
});
