import test from 'node:test';
import assert from 'node:assert/strict';
import {libraryGroup,rankReplacementCards} from '../lib/exerciseLibraryView.mjs';
import {correctionNeighbours,correctionQueueFilter,missingFactText,weekFactText,coachHealthSummary} from '../lib/coachFastWork.mjs';
test('coach discovery separates locomotion and ranks the actual task and implement without mutating cards',()=>{
 assert.equal(libraryGroup('Lateral Shuffle'),'locomotion');assert.equal(libraryGroup('Acceleration Sprint'),'locomotion');
 const cards=['Supine Bent-Knee March Core','Barbell RDL','Lateral Shuffle to Stick','Acceleration Sprint','DB Romanian Deadlift (Two-Hand)','Single-Leg DB Romanian Deadlift','Swiss Ball Glute Bridge'].map(title=>({title}));
 const before=JSON.stringify(cards);assert.equal(rankReplacementCards(cards,'Lateral Shuffle')[0].title,'Lateral Shuffle to Stick');
 assert.ok(rankReplacementCards(cards,'DB Romanian Deadlift').findIndex(c=>c.title==='DB Romanian Deadlift (Two-Hand)')<rankReplacementCards(cards,'DB Romanian Deadlift').findIndex(c=>c.title==='Barbell RDL'));
 assert.equal(JSON.stringify(cards),before);
});
test('saved navigation never crosses saved state, workspace or day',()=>{
 const rows=[{playerId:'a',workspace:'zarechie',date:'2026-10-15',saved:true,status:'done'},{playerId:'b',workspace:'zarechie',date:'2026-10-15',saved:true,status:'done'},{playerId:'c',workspace:'zarechie',date:'2026-10-15',saved:false,status:'done'},{playerId:'d',workspace:'nkperf',date:'2026-10-15',saved:true,status:'done'}];
 assert.equal(correctionNeighbours(rows,'a').next.playerId,'b');assert.equal(correctionNeighbours(rows,'b').next,null);assert.equal(correctionNeighbours(rows,'c').total,1);assert.equal(correctionNeighbours(rows,'absent').total,0);
});
test('completion opens Saved while explicit empty filter and errors are respected',()=>{
 const rows=[{saved:true},{saved:true}],scope='zarechie:q';assert.equal(correctionQueueFilter(null,scope,rows),'saved');assert.equal(correctionQueueFilter(null,scope,[]),'remaining');assert.equal(correctionQueueFilter({scope,value:'remaining',complete:false},scope,rows),'saved');assert.equal(correctionQueueFilter({scope,value:'remaining',complete:true},scope,rows),'remaining');assert.equal(correctionQueueFilter({scope,value:'errors'},scope,rows),'errors');assert.equal(correctionQueueFilter({scope:'nkperf:q',value:'errors'},scope,rows),'saved');
});
test('compact missing facts suppress zeros without losing nonzero fields or actual execution',()=>{
 assert.equal(missingFactText({kg:0,reps:2,rpe:3}),'повторы 2 · RPE упражнения 3');
 assert.equal(weekFactText({completed:false,loadEvidence:{source:'missing'}}),null);assert.equal(weekFactText({completed:false,completedSets:2,loadEvidence:{source:'missing'}}),true);assert.equal(weekFactText({completed:true,loadEvidence:{source:'missing'}}),true);assert.equal(weekFactText({actualTonnage:100,loadEvidence:{source:'missing'}}),true);
});
test('historical errors remain journal entries, actual problems and latest firing incidents remain attention',()=>{
 const data={status:'warning',services:{redis:true},checks:{historyIntegrity:true},errors24h:1,activeReasons:['Ошибок в журнале за 24 часа: 1 — проверьте их итоговый статус'],notifications:[]};
 assert.equal(coachHealthSummary(data).needsAttention,false);assert.match(coachHealthSummary(data).journal,/: 1$/);assert.equal(coachHealthSummary({...data,services:{redis:false}}).needsAttention,true);assert.equal(coachHealthSummary({...data,activeReasons:['Превышено время ответа ReadySix']}).needsAttention,true);assert.equal(coachHealthSummary({}).needsAttention,true);
 assert.equal(coachHealthSummary({...data,notifications:[{kind:'latency',status:'firing',occurredAt:'2026-10-15T00:00:00Z'}]}).needsAttention,true);
 assert.equal(coachHealthSummary({...data,notifications:[{kind:'latency',status:'firing',occurredAt:'2026-10-15T00:00:00Z'},{kind:'latency',status:'resolved',occurredAt:'2026-10-15T01:00:00Z'}]}).needsAttention,false);
});
