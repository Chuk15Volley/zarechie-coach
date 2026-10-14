import test from 'node:test';
import assert from 'node:assert/strict';
import {resizedPlannedSets,correctionStatus,correctionHistoryEdit,correctionHistoryStep,correctionViewKey} from '../lib/correctionInteraction.mjs';
const empty=()=>({past:[],future:[],key:null,at:0});
test('set count preserves exact original units and only duplicates the last planned assignment',()=>{
 const sets=['5/сторона','25 сек/сторона','3 x 5'];
 assert.deepEqual(resizedPlannedSets(sets,5),[...sets,'3 x 5','3 x 5']);
 assert.deepEqual(resizedPlannedSets(sets,1),['5/сторона']);assert.deepEqual(sets,['5/сторона','25 сек/сторона','3 x 5']);
 for(const n of ['',0,21,31,-1,2.5,'abc'])assert.equal(resizedPlannedSets(sets,n),sets);
 assert.equal(resizedPlannedSets(sets,3),sets);
});
test('saved queue status does not hide deliberately changed local program',()=>{
 assert.equal(correctionStatus({saved:true,dirty:true}),'Есть изменения · игроку ещё не выданы');
 assert.equal(correctionStatus({saved:true,dirty:false}),'Программа сохранена игроку');
 assert.equal(correctionStatus({dirty:false,draftSaved:true}),'Черновик сохранён на сервере · игроку не выдан');
 assert.equal(correctionStatus({saved:true,dirty:true,blocked:true}),'Исходный план защищён');
});
test('card undo and redo restore the complete snapshot including removed blocks and replacement kg',()=>{
 const before={blocks:[{exercises:[{name:'A',weightKg:20,targetSets:['5/side']}]},{exercises:[{name:'B'}]}]},changed={blocks:[{exercises:[{name:'C',weightKg:null,targetSets:['5/side']}]}]};
 const h=correctionHistoryEdit(empty(),before,changed);
 const undo=correctionHistoryStep(h,changed);assert.deepEqual(undo.value,before);
 const redo=correctionHistoryStep(undo.history,undo.value,true);assert.deepEqual(redo.value,changed);
 assert.deepEqual(before.blocks[0].exercises[0].targetSets,['5/side']);
});
test('typing in one field coalesces; another field and structural actions remain separate; new edit clears redo',()=>{
 const a={kg:null},b={kg:2},c={kg:22},d={kg:22,rpe:8};
 let h=correctionHistoryEdit(empty(),a,b,'kg',1000);h=correctionHistoryEdit(h,b,c,'kg',1100);assert.equal(h.past.length,1);
 h=correctionHistoryEdit(h,c,d,'rpe',1200);assert.equal(h.past.length,2);
 const undo=correctionHistoryStep(h,d);h=correctionHistoryEdit(undo.history,undo.value,{kg:24},'kg',1300);assert.equal(h.future.length,0);
});
test('view state scopes workspace, player and date independently',()=>{
 const a={workspace:'zarechie',playerId:'1',date:'2026-10-15'};
 for(const patch of [{workspace:'nkperf'},{playerId:'2'},{date:'2026-10-16'}])assert.notEqual(correctionViewKey(a),correctionViewKey({...a,...patch}));
});
