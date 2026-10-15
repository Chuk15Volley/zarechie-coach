import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseView, prescriptionText, durationText, exerciseElementId, blockElementId } from '../lib/prevention/player-view.mjs';
import { registeredCourse } from '../lib/prevention/catalogue.mjs';
import { createAssignment, orderedSets } from '../lib/prevention/model.mjs';

test('player exercise status counts only prescribed keys and follows the current circuit step',()=>{
 const e={code:'B1',setCount:3,reps:'8-10 each'},progress={'B1:0':true,'B1:2':true,'B1:9':true,'deleted:0':true};
 assert.deepEqual(exerciseView(e,progress,'B1:1'),{done:2,total:3,complete:false,current:true,bilateral:true});
 assert.equal(exerciseView(e,{...progress,'B1:1':true},'B2:0').complete,true);
 assert.equal(exerciseView(e,progress,'B1:9').current,false);
});
test('mobile source labels preserve hold repetitions, per-side dose and RPE/RIR distinctions',()=>{
 assert.equal(prescriptionText('5x5-10 sec each'),'5x5–10 сек на сторону');assert.equal(prescriptionText('8-12 (3 sec lower)'),'8–12 (3 сек на опускание)');assert.equal(prescriptionText('1 min'),'1 мин');
 const c=registeredCourse('ankle-sprain-prehab'),a=createAssignment(c,{scope:'phase',phase:1,mainSets:1,stretch:false,stretchSets:2,reviewed:true},{id:'player-view-ankle'});
 const rows=orderedSets(a.sessions[0]);assert.equal(exerciseView(rows[0].exercise,{},rows[0].key).bilateral,true);assert.equal(exerciseView(rows[1].exercise,{},rows[0].key).current,false);
});
test('navigation ids isolate courses and sessions, and timer labels handle extended rest',()=>{
 assert.notEqual(exerciseElementId('a-0','A1'),exerciseElementId('a-1','A1'));assert.notEqual(exerciseElementId('a-0','A1'),exerciseElementId('b-0','A1'));assert.notEqual(exerciseElementId('a-0','A1'),blockElementId('a-0','A'));
 assert.equal(durationText(0),'0:00');assert.equal(durationText(5),'0:05');assert.equal(durationText(120),'2:00');assert.equal(durationText(615),'10:15');
});
