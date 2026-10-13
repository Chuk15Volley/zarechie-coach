import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStrengthDevelopmentDraft} from '../lib/strengthDevelopmentDraft.mjs';
import {strengthExercises} from '../lib/strengthCycle.mjs';
import {coachBannedSessionExercises} from '../lib/exerciseRestrictions.js';
const snapshot={player:{position:'Диагональная'},chronicSurveys:['01','03','05','07','11'].map(day=>({date:'2026-10-'+day,sessionType:'volleyball',blocks:[{type:'volleyball',duration:60,srpe:5}]}))};
const history=[['2026-10-06','DB Incline Bench Press'],['2026-10-08','DB Bench Press'],['2026-10-10','DB Bench Press'],['2026-10-12','Push-Up']].map(([date,name])=>({date,focus:'inseason_strength',trainingType:'full_body',session:{blocks:[{label:'B',exercises:[{code:'B1',name,targetSets:['5','5']}]}]}}));
for(const mode of ['maintenance','development'])for(const chain of ['full_body','anterior_chain','posterior_chain'])test(mode+'/'+chain+': exhausted legacy press options choose a distinct permitted press without relaxing repeats or transferring kg',()=>{
 const result=buildStrengthDevelopmentDraft({snapshot,recommendation:{calendar:{available:true,daysToGame:4,events:[]},state:{}},manualMethodSelection:true,strengthMode:mode,trainingType:chain,date:'2026-10-13',recentSessions:history});
 const press=strengthExercises(result.session).find(ex=>ex.code==='B1');assert.equal(press.name,'One-Arm DB Bench Press');assert.equal(press.loadUnits,1);assert.ok(press.targetSets.every(target=>target.endsWith('/side')));assert.equal(press.weightKg,null);assert.equal(result.quality.valid,true,JSON.stringify(result.quality));assert.equal(result.quality.variety.needsCorrection,false);assert.deepEqual(coachBannedSessionExercises(result.session),[]);
});
test('new press options obey explicit restrictions and shoulder symptom adaptation',()=>{
 const base={snapshot,recommendation:{calendar:{available:true,daysToGame:4,events:[]},state:{}},manualMethodSelection:true,strengthMode:'development',date:'2026-10-13',recentSessions:history};
 const excluded=structuredClone(history);excluded.at(-1).session.coachReplacements=[{from:'One-Arm DB Bench Press',to:'DB Neutral-Grip Bench Press',reason:'preference',date:'2026-10-12'}];const neutral=buildStrengthDevelopmentDraft({...base,recentSessions:excluded});const press=strengthExercises(neutral.session).find(ex=>ex.code==='B1');assert.equal(press.name,'DB Neutral-Grip Bench Press');assert.equal(press.loadUnits,2);
 const adapted=buildStrengthDevelopmentDraft({...base,snapshot:{...snapshot,latestMorning:{date:base.date,zoneDetails:{'Плечо левое':{type:'pain',level10:4}}}}});const trial=strengthExercises(adapted.session).find(ex=>ex.code==='B1');assert.equal(trial.symptomAdapted,true);assert.equal(trial.weightKg,null);assert.equal(trial.targetRpeMax,4);
});
