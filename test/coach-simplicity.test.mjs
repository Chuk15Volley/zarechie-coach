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
test('ReadySix yellow insufficient data is a data task without hiding actual clinical restrictions',()=>{
 const source={code:'readysix_insufficient_data',dataInsufficient:true,hardStop:false,targets:[{healthRecommendation:'full',healthCapPercent:100,restrictions:[],hardStopSignal:false,scheduleCapPercent:0}]};
 const item={readiness:{status:'yellow',readySixState:source}};
 assert.equal(coachNeedsDecision(item),false);
 assert.equal(coachNeedsDecision({...item,readiness:{...item.readiness,status:'red'}}),true);
 for(const extra of [{hardStop:true},{detail:'Боль колено 3/10'},{targets:[{hardStopSignal:true}]},{targets:[{restrictions:['No loaded knee flexion']}]},{targets:[{healthRecommendation:'modified'}]},{targets:[{healthRecommendation:'limited'}]},{targets:[{healthRecommendation:'individual_plan'}]},{targets:[{healthRecommendation:'load_stop'}]},{targets:[{healthCapPercent:50}]}])assert.equal(coachNeedsDecision({readiness:{...item.readiness,readySixState:{...source,...extra}}}),true);
 assert.equal(coachNeedsDecision({...item,status:{activeInjuries:[{}]}}),true);
});
