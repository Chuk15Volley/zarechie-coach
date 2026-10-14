import test from 'node:test';
import assert from 'node:assert/strict';
import {plannedWeightPatch,repeatedPlannedSets} from '../lib/plannedLoadEditor.mjs';
import {exerciseTonnage,loadUnitsForExercise} from '../lib/tonnage.js';
import {exerciseDescription} from '../lib/tempoDescription.mjs';
import {replacementTechnique,techniqueQuality} from '../lib/exerciseReplacement.mjs';

test('planned weight accepts decimal comma and clearing cannot restore legacy kg or erase RPE/medical note',()=>{
 const original={name:'DB Squat Jump',weightKg:12,loadUnits:2,weightNote:'12 кг · RPE 6; при боли стоп',actualKg:99};
 assert.deepEqual(plannedWeightPatch(original,'6,5'),{weightKg:6.5,weightNote:'6.5 кг · RPE 6; при боли стоп'});
 assert.deepEqual(plannedWeightPatch(original,null),{weightKg:null,weightNote:'RPE 6; при боли стоп'});
 assert.deepEqual(plannedWeightPatch(original,-1),{});
 assert.equal(original.actualKg,99);assert.equal(original.weightKg,12);
});
test('explicit one/two implements changes multiplier, never kg per implement or original exercise',()=>{
 const original={name:'Bulgarian Split Squat (DB)',weightKg:12,loadUnits:1};
 const pair={...original,loadUnits:2};assert.equal(loadUnitsForExercise(pair),2);assert.equal(pair.weightKg,12);assert.equal(exerciseTonnage(pair,8),192);assert.equal(exerciseTonnage(original,8),96);
 assert.deepEqual(repeatedPlannedSets(['4/side','5/side'],'6/side'),['6/side','6/side']);assert.deepEqual(repeatedPlannedSets(['30 sec','20 sec'],''),['30 sec','20 sec']);
});
test('new movement instructions distinguish shuffle, acceleration and loaded jump; saved coach descriptions remain exact',()=>{
 for(const name of ['Lateral Shuffle','Acceleration Sprint']){const text=exerciseDescription({name,tempo:'реактивный',cue:replacementTechnique(name)});assert.doesNotMatch(text,/опускайся вниз|поднимайся вверх|паузы внизу|показанном тренером/);assert.equal(techniqueQuality(name,text),'');}
 const jump=replacementTechnique('DB Squat Jump (Bilateral)');assert.match(jump,/гантели/);assert.match(jump,/выпрыгнуть/);assert.match(jump,/приземлиться/);
 const cue='Темп: сохранённая тренером формулировка. При боли стоп.';assert.equal(exerciseDescription({name:'Lateral Shuffle',tempo:'реактивный',cue,preserveStoredDescription:true}),cue);
 assert.equal(exerciseDescription({name:'Lateral Shuffle',descriptionOverride:'Точная индивидуальная подсказка.'}),'Точная индивидуальная подсказка.');
 assert.ok(techniqueQuality('Acceleration Sprint','Темп: опускайся вниз и поднимайся вверх.'));
});
