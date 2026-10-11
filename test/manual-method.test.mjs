import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {manualMethodRecommendation} from '../lib/manualMethod.mjs';
import {buildCoachAdaptation} from '../lib/coachAdaptation.mjs';
import {buildStrengthDevelopmentDraft} from '../lib/strengthDevelopmentDraft.mjs';
import {recommendGymSession} from '../lib/readySixGym.mjs';
import {buildPrehabResult} from '../lib/prehabMethodology.mjs';
const date='2026-10-06';
function fixture(detail='Автоматический красный статус') {
 const snapshot={player:{id:'synthetic',position:'Связующая'},readySixDecision:{recommendation:'load_stop',capPercent:0,hardStopSignal:true,reasons:[detail],targets:[{target:'strength_upper',capPercent:0,healthCapPercent:0,hardStopSignal:true},{target:'strength_lower',capPercent:0,healthCapPercent:0,hardStopSignal:true}]}};
 const recommendation={...recommendGymSession({snapshot,targetDate:date}),calendar:{daysToGame:4}};
 return {snapshot,recommendation,date,focus:'inseason_strength',strengthMode:'development',manualMethodSelection:true};
}
const exs=result=>result.session.blocks.flatMap(b=>b.exercises);
test('manual policy does not mutate original readiness or medical evidence',()=>{
 const {recommendation}=fixture('Боль в плече');const original=structuredClone(recommendation);
 assert.equal(manualMethodRecommendation(recommendation,false),recommendation);
 const manual=manualMethodRecommendation(recommendation,true);
 assert.equal(manual.state.capPercent,100);assert.equal(manual.state.hardStop,false);
 assert.ok(manual.state.targets.every(t=>t.healthCapPercent===100&&!t.hardStopSignal));
 assert.equal(manual.state.detail,original.state.detail);assert.deepEqual(recommendation,original);
});
for(const focus of ['inseason_strength','inseason_power','inseason_md1_activation','hypertrophy','isometric','inseason_deload','inseason_prophylaxis']) test(`${focus}: automatic stop cannot replace manual method with prehab`,()=>{
 assert.equal(buildCoachAdaptation({...fixture(),focus}),null);
});
test('automatic red and zero budgets produce the full selected development method',()=>{
 const data=fixture();const result=buildStrengthDevelopmentDraft({...data,sourceState:data.recommendation.state,recommendation:manualMethodRecommendation(data.recommendation,true)});
 assert.equal(result.focus,'inseason_strength');assert.equal(result.strengthMode,'development');assert.equal(result.trainingType,'full_body');
 assert.equal(exs(result).length,8);assert.equal(exs(result).reduce((n,e)=>n+e.targetSets.length,0),17);assert.equal(result.quality.valid,true);
 assert.equal(result.quality.readySixState.hardStop,true);assert.equal(result.session.methodology.adaptedMethodDraft,undefined);
});
test('manual prophylaxis keeps its dose when only automatic status and caps change',()=>{
 const data=fixture();const manual=manualMethodRecommendation(data.recommendation,true);
 const green=structuredClone(manual);
 const a=buildPrehabResult({...data,recommendation:manual}), b=buildPrehabResult({...data,recommendation:green});
 assert.deepEqual(exs(a).map(e=>e.targetSets),exs(b).map(e=>e.targetSets));assert.equal(exs(a).length,12);
 const automatic=buildPrehabResult(data);assert.notDeepEqual(exs(automatic).map(e=>e.targetSets),exs(a).map(e=>e.targetSets));
});
for(const area of ['Плечо','Колени','Голеностоп','Ахилл','Поясница'])test(`${area}: symptoms adapt affected roles and keep healthy strength work`,()=>{
 const data=fixture();data.snapshot.latestMorning={date,zoneDetails:{[area]:{type:'pain',level10:4}}};
 const result=buildStrengthDevelopmentDraft({...data,sourceState:data.recommendation.state,recommendation:manualMethodRecommendation(data.recommendation,true)});
 assert.deepEqual(result.session.blocks.map(b=>b.label),['A','B','C','D','E']);assert.equal(exs(result).length,8);
 const adapted=exs(result).filter(e=>e.symptomAdapted);assert.ok(adapted.length);
 assert.ok(adapted.every(e=>e.weightKg===null&&/Без отягощения.*RPE 2–4/.test(e.weightNote)));
 assert.ok(exs(result).some(e=>!e.symptomAdapted&&/RPE 7–8/.test(e.weightNote)));
 assert.equal(result.quality.medicalReviewRequired,true);assert.ok(exs(result).every(e=>!/[а-яё]/i.test(e.name)));
});
test('manual mode retains physician contraindications even without automatic source recommendation',()=>{
 for(const detail of ['Запрет врача','Повышенная температура','Острая травма']) {
  const result=buildCoachAdaptation(fixture(detail));assert.equal(result.session.methodology.medicalHold,true);assert.equal(exs(result).length,0);
 }
 const data=fixture();data.recommendation=null;data.snapshot.injuryLog=[{date,status:'active',note:'Запрет врача'}];
 assert.equal(exs(buildCoachAdaptation(data)).length,0);
});
test('manual strength retains coach prohibitions and weekly rotation',()=>{
 const data=fixture();const recommendation=manualMethodRecommendation(data.recommendation,true);
 const first=buildStrengthDevelopmentDraft({...data,recommendation});
 const second=buildStrengthDevelopmentDraft({...data,recommendation,recentSessions:[{date:'2026-10-01',session:first.session}]});
 assert.equal(second.quality.variety.repeated.length,0);
 assert.throws(()=>buildStrengthDevelopmentDraft({...data,recommendation,playerRestrictions:['AXIAL','SHOULDER']}),/Нет безопасной/);
});
test('individual, team and week UI submissions carry policy; sync and async share its guards',()=>{
 const ui=readFileSync(new URL('../pages/index.js',import.meta.url),'utf8');
 assert.equal((ui.match(/manualMethodSelection: true/g)||[]).length,3);
 const route=readFileSync(new URL('../pages/api/programs/generate.js',import.meta.url),'utf8');
 assert.match(route,/manualMethodSelection === true/);
 assert.match(route,/manualMethod \? null : readySixGenerationIssue/);
 assert.match(route,/manualMethod \? coachRecovery : strictestRecoveryStatus/);
 assert.match(route,/if \(gymRecommendation && !manualMethod\)/);
 const status=readFileSync(new URL('../pages/api/programs/generate-status.js',import.meta.url),'utf8');
 assert.match(status,/buildGenerationInputs\(record.generationRequest\)/);
});
test('manual development rotates unloaded regional trials and never grants rotation exceptions',()=>{
 const data=fixture();data.snapshot.player.position='Диагональная';
 data.snapshot.latestMorning={date,zoneDetails:{'Голень левая':{type:'pain',level10:2}}};
 const recommendation=manualMethodRecommendation(data.recommendation,true);
 const first=buildStrengthDevelopmentDraft({...data,recommendation});
 const second=buildStrengthDevelopmentDraft({...data,recommendation,recentSessions:[{date:'2026-10-05',session:first.session}]});
 assert.equal(exs(second).length,8);
 assert.equal(second.quality.variety.repeated.length,0);
 assert.equal(second.session.methodology.rotationExceptions,undefined);
 assert.ok(exs(second).filter(e=>e.symptomAdapted).every(e=>e.weightKg===null&&/Без отягощения/.test(e.weightNote)));
});
test('exhausted catalogue requires coach selection in both manual and automatic modes',()=>{
 const data=fixture();const recommendation=manualMethodRecommendation(data.recommendation,true);
 const first=buildStrengthDevelopmentDraft({...data,recommendation});
 const second=buildStrengthDevelopmentDraft({...data,recommendation,recentSessions:[{date:'2026-10-05',session:first.session}]});
 const recentSessions=[{date:'2026-10-05',session:{blocks:[{exercises:[...exs(first),...exs(second)]}]}}];
 for(const manualMethodSelection of [true,false]) assert.throws(()=>buildStrengthDevelopmentDraft({...data,recommendation,recentSessions,manualMethodSelection}),/Нет безопасной новой/);
});
