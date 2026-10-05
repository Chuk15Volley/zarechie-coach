import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachAdaptation, medicalHoldReason } from '../lib/coachAdaptation.mjs';
import { recommendGymSession } from '../lib/readySixGym.mjs';
import { normalizeStrengthExecution, estimateStrengthMinutes } from '../lib/strengthExecution.mjs';
import { buildInSeasonStrengthContext, inSeasonStrengthDoseProfile, auditInSeasonStrengthSession } from '../lib/inSeasonStrength.mjs';
import { exerciseDescription, conciseTechnique } from '../lib/tempoDescription.mjs';
const date='2026-10-06';
function input(focus='inseason_strength', detail='Автоматический красный статус') {
 const snapshot={player:{id:'test',position:'Доигровщица'}, readySixDecision:{recommendation:'load_stop',hardStopSignal:true,capPercent:0,detail,reasons:[detail],targets:[{target:'strength_upper',healthCapPercent:100},{target:'strength_lower',healthCapPercent:0}]}};
 return {snapshot,recommendation:recommendGymSession({snapshot,targetDate:date}),date,focus,strengthMode:'development'};
}
for (const focus of ['inseason_strength','inseason_power','inseason_md1_activation','hypertrophy','inseason_deload']) test(`${focus}: automatic stop permits a complete review draft preserving method`,()=>{
 const result=buildCoachAdaptation(input(focus));assert.equal(result.focus,focus);assert.equal(result.session.methodology.adaptedMethodDraft,true);
 const ex=result.session.blocks.flatMap(b=>b.exercises);assert.ok(ex.length>=10&&ex.length<=12);assert.equal(result.session.methodology.timing.plannedMainMinutes,50);
 assert.ok(ex.every(e=>!/[а-яё]/i.test(e.name)&&!Number(e.weightKg)));assert.equal(result.session.draftPolicy.medicalOverride,false);
 assert.equal(result.quality.readySixState.hardStop,true);
});
test('fever and physician restriction suppress exercise even with automatic override',()=>{
 for (const detail of ['Повышенная температура','FEVER','Запрет врача','Острая травма','Подозрение на перелом']) {
  const result=buildCoachAdaptation(input('inseason_strength',detail));assert.equal(result.session.blocks.length,0,detail);assert.equal(result.session.methodology.medicalHold,true);
 }
 assert.equal(medicalHoldReason({injuryLog:[{status:'resolved',note:'Подозрение на перелом'}]}, {}, date),'');
});
test('green status does not erase knee/neck/foot pain',()=>{
 for(const area of ['Колено левое','Шея','Стопа левая']) {
  const data=input(); data.snapshot.readySixDecision={...data.snapshot.readySixDecision,recommendation:'full',hardStopSignal:false,capPercent:100};data.snapshot.latestMorning={date,zoneDetails:{[area]:{type:'pain',level10:4}}};
  data.recommendation=recommendGymSession({snapshot:data.snapshot,targetDate:date});const result=buildCoachAdaptation(data);
  assert.ok(result.session.methodology.symptoms.zones.length);assert.ok(result.session.blocks.flatMap(b=>b.exercises).filter(e=>e.symptomAdapted).every(e=>/Без отягощения/.test(e.weightNote)));
 }
});
test('development uses 17 sets, honest kg evidence, sequential rests and 40–50 minutes',()=>{
 const make=(code,name,reps)=>({code,name,targetSets:[reps,reps],cue:'Первое точное предложение. Второе точное предложение. Лишнее предложение.',weightNote:'85% 1RM; 100 кг',tempo:'2-0-X-0',autoReg:'При боли остановить подход.'});
 const session={blocks:[{label:'A',exercises:[make('A1','Trap Bar Deadlift','4')]},{label:'B',exercises:[make('B1','DB Bench Press','5'),make('B2','Chest-Supported DB Row','5')]},{label:'C',exercises:[make('C1','Reverse Lunge','5/side')]},{label:'D',exercises:[make('D1','Machine Hamstring Curl','8'),make('D2','Pallof Press','8/side')]},{label:'E',exercises:[make('E1','Cable External Rotation','10'),make('E2','Soleus Calf Raise','10')]}]};
 const context=buildInSeasonStrengthContext({focus:'inseason_strength',requestedMode:'development',calendar:{daysToGame:4},targetDate:date});
 const result=normalizeStrengthExecution(session,'inseason_strength',context);const exercises=result.blocks.flatMap(b=>b.exercises);
 assert.equal(exercises.reduce((n,e)=>n+e.targetSets.length,0),17);assert.ok(estimateStrengthMinutes(result)>=40&&estimateStrengthMinutes(result)<=50);
 assert.ok(exercises.every(e=>e.weightKg===null&&!/1RM|85%|100 кг/.test(e.weightNote)));assert.deepEqual(result.blocks.map(b=>b.restSeconds),[180,150,120,90,60]);
 assert.equal(auditInSeasonStrengthSession(result,inSeasonStrengthDoseProfile(context)).safe,true);
 assert.equal(exerciseDescription(exercises[0]),'Первое точное предложение. Второе точное предложение.');
 assert.equal(conciseTechnique('Полное описание без точки'),'Полное описание без точки');
});

test('server catalogue selects complete development without model calls and respects previous-week rotation',async()=>{
 const {buildStrengthDevelopmentDraft}=await import('../lib/strengthDevelopmentDraft.mjs');
 const input={snapshot:{player:{position:'Связующая'}},recommendation:{calendar:{daysToGame:4},state:{}},date};
 const first=buildStrengthDevelopmentDraft(input);assert.equal(first.quality.valid,true);
 const second=buildStrengthDevelopmentDraft({...input,recentSessions:[{date:'2026-10-01',session:first.session}]});
 assert.equal(second.quality.valid,true);assert.equal(second.quality.variety.repeated.length,0);
 assert.throws(()=>buildStrengthDevelopmentDraft({...input,playerRestrictions:['AXIAL','SHOULDER']}),/Нет безопасной/);
});
