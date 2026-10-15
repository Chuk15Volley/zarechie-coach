import test from 'node:test';import assert from 'node:assert/strict';
import {buildStrengthDevelopmentDraft,reviewStrengthDevelopmentLoads} from '../lib/strengthDevelopmentDraft.mjs';
import {strengthCardProposals,strengthProgressionKey} from '../lib/strengthCardProgression.mjs';
const options={date:'2026-10-13',snapshot:{player:{position:'setter'},chronicSurveys:[]},recommendation:{calendar:{available:true,daysToGame:5,events:[]},state:{}},manualMethodSelection:true,strengthMode:'development',trainingType:'full_body',equipment:{dumbbell:[20,22],barbell:[100,102.5],trap_bar:[100,102.5]}};
test('existing exact dose/load review equals the shared generator for unchanged Green exercises',()=>{
 const original=buildStrengthDevelopmentDraft(options),exercises=original.session.blocks.flatMap(b=>b.exercises),before=JSON.stringify(exercises),review=reviewStrengthDevelopmentLoads({...options,exercises});
 const expected=original.session.blocks.flatMap(b=>b.exercises),actual=review.session.blocks.flatMap(b=>b.exercises);
 assert.deepEqual(actual.map(e=>[e.code,e.name,e.targetSets,e.targetRpeMax,e.weightKg,e.loadEvidence,e.loadProgression]),expected.map(e=>[e.code,e.name,e.targetSets,e.targetRpeMax,e.weightKg,e.loadEvidence,e.loadProgression]));assert.equal(JSON.stringify(exercises),before);
});
test('read-only review never tries a new accessory and retains exact selected names despite exhausted rotation history',()=>{
 const original=buildStrengthDevelopmentDraft(options),exercises=original.session.blocks.flatMap(b=>b.exercises),recentSessions=Array.from({length:6},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),session:original.session,focus:'inseason_strength',trainingType:'full_body'}));
 const reviewed=reviewStrengthDevelopmentLoads({...options,recentSessions,exercises});for(const ex of reviewed.session.blocks.flatMap(b=>b.exercises))assert.ok(exercises.some(old=>old.code===ex.code && old.name===ex.name));assert.ok(reviewed.session.blocks.length);
});
test('unknown variants and coach prohibitions cannot receive a proposal',()=>{
 const exercises=[{code:'A1',name:'Unknown DB Variation',targetSets:['4','4']},{code:'B1',name:'Barbell Bench Press',targetSets:['5','5']},{code:'C1',name:'Supine Hip Abduction',targetSets:['6','6']}];const review=reviewStrengthDevelopmentLoads({...options,exercises});assert.equal(review.session.blocks.length,0);const proposals=strengthCardProposals(exercises,review.session,'fixture');assert.ok(Object.values(proposals).every(p=>!p.applicable && p.suggestedKg===null));
});
test('symptom adaptation remains binding even when an input falsely claims a loaded healthy exercise',()=>{
 const exercises=[{code:'A1',name:'DB Romanian Deadlift',targetSets:['4','4','4'],targetRpeMax:8,weightKg:100,symptomAdapted:false}],review=reviewStrengthDevelopmentLoads({...options,sourceState:{detail:'Боль поясница 4/10',painAreas:['back']},snapshot:{...options.snapshot,morningSurveys:[{date:options.date,painAreas:['back'],pain:4}]},exercises});
 const ex=review.session.blocks[0]?.exercises[0];assert.ok(ex);assert.equal(ex.weightKg,null);assert.equal(ex.symptomAdapted,true);assert.equal(review.quality.medicalReviewRequired,true);assert.ok(Object.values(strengthCardProposals(exercises,review.session,'fixture',{blocking:review.quality.medicalReviewRequired})).every(p=>!p.applicable));
});
