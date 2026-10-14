import test from 'node:test';
import assert from 'node:assert/strict';
import {coachTrainingTitle,coachNeedsDecision,scopedWarmup} from '../lib/coachSimplicity.mjs';
test('coach headings remove service names while preserving the selected method and chain',()=>{
 assert.equal(coachTrainingTitle('Копия программы · проверка тренером · Активация / мощность'),'Активация / мощность');
 assert.equal(coachTrainingTitle('Силовая · развивающая · программа · программа · Задняя цепь'),'Силовая · развивающая · Задняя цепь');
 assert.equal(coachTrainingTitle('inseason_power'),'Мощность / скорость');
 assert.equal(coachTrainingTitle('Командный программа · Всё тело'),'Всё тело');
 assert.equal(coachTrainingTitle('recovery_review'),'Восстановление / профилактика');
});
test('missing readiness belongs to data review while explicit clinical and live decisions remain attention',()=>{
 assert.equal(coachNeedsDecision({priority:90,readiness:{status:'unknown',dataProvenance:{missingSources:['survey']}}}),false);
 for(const item of [{readiness:{status:'red'}},{readiness:{status:'yellow'}},{returnToPlay:{active:true}},{status:{activeInjuries:[{}]}},{status:{live:{alerts:['pain']}}},{readiness:{hardStopSignal:true}},{readiness:{status:'unknown',readySixState:{detail:'Боль колено 3/10'}}},{status:{pendingCommands:[{}]}},{status:{developmentPlan:{review:{due:true}}}}])assert.equal(coachNeedsDecision(item),true);
});
test('warmup result never crosses space/date even when a late response has a plausible plan',()=>{
 const record={scope:'zarechie:2026-10-13',plan:{date:'2026-10-13',sections:[{label:'Original'}]}};
 assert.equal(scopedWarmup(record,'nkperf','2026-10-13'),null);
 assert.equal(scopedWarmup(record,'zarechie','2026-10-15'),null);
 assert.equal(scopedWarmup({...record,plan:{date:'2026-07-17'}},'zarechie','2026-10-13'),null);
 assert.equal(scopedWarmup(record,'zarechie','2026-10-13'),record.plan);
 assert.equal(scopedWarmup(null,'zarechie','2026-10-13'),null);
});
