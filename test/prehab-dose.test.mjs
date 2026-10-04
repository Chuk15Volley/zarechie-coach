import test from 'node:test';
import assert from 'node:assert/strict';
import {prehabPrescription} from '../lib/prehabDose.mjs';
import {PREHAB_FAMILIES} from '../lib/prehabCatalogue.mjs';
import {repetitionInput} from '../lib/playerGym.mjs';
test('all dynamic prophylaxis exercises prescribe repetitions usable by the athlete input',()=>{
 for(const ex of Object.values(PREHAB_FAMILIES).flat()){
  const dose=prehabPrescription(ex,0.6,true);
  if(/Balance|Tandem Stance|Ball Squeeze/.test(ex.name)) continue;
  assert.doesNotMatch(dose.target,/sec|сек/);
  assert.ok(repetitionInput(dose.target),ex.name);
  assert.ok(dose.secondsPerSet>0);
 }
});
test('balance and brief squeeze holds retain meaningful time prescriptions',()=>{
 assert.equal(prehabPrescription({name:'Supported Single-Leg Balance'},0.6).target,'20 sec/side');
 assert.equal(prehabPrescription({name:'Supine Adductor Ball Squeeze'},1).target,'6 × 5 sec');
 assert.equal(prehabPrescription({name:'Seated Band Row',reps:'10'},0.75).target,'8');
 assert.equal(prehabPrescription({name:'Seated Ankle Circles',reps:'40 сек/ст.'},1).target,'8/side');
});
