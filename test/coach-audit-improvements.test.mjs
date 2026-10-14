import test from 'node:test';
import assert from 'node:assert/strict';
import {coachDate,trainingTitle,factAmount,commentRpe,activeServiceProblems,sourceStatusLabel,budgetLabel} from '../lib/coachPresentation.mjs';
import {libraryEquipment,libraryRegion,libraryGroup,libraryMatches} from '../lib/exerciseLibraryView.mjs';
import {completedProgramSnapshot,SAVE_UNEXECUTED_PROGRAM} from '../lib/completedProgramGuard.mjs';

test('display distinguishes unrecorded facts, zero, no plan and partial nonzero amounts',()=>{
 assert.equal(factAmount(0,{source:'missing'}),'Нет факта');assert.equal(factAmount(0,{source:'player_log',partial:true}),'Нет факта');
 assert.equal(factAmount(null,{source:'recorded'}),'Нет факта');assert.equal(factAmount(0,{source:'recorded'}),'0 кг');
 assert.equal(factAmount(0,{},false),'Нет программы');assert.equal(factAmount(100,{source:'recorded',partial:true}),'100 кг');
});
test('comment RPE is explicitly attributed, never converted into a stored target',()=>{
 assert.equal(commentRpe('3 кг, RPE 4–5',null),'RPE 4–5');assert.equal(commentRpe('RPE 15',null),null);
 assert.equal(commentRpe('RPE 4',8),null);assert.equal(commentRpe('18 кг',null),null);
});
test('labels remove duplicate technical titles and distinguish source baseline from regional restrictions',()=>{
 assert.equal(trainingTitle('Силовая · развивающая · программа · программа'),'Силовая · развивающая');
 assert.equal(trainingTitle('recovery_review'),'Восстановление / профилактика');
 assert.equal(sourceStatusLabel('План без индивидуальных ограничений'),'Статус ReadySix: базовый план');
 assert.match(coachDate('2026-10-12'),/^12 окт/);
});
test('active service failures remain visible independently of zero event counters',()=>{
 assert.deepEqual(activeServiceProblems({redis:true,backup:false,recovery:true}),['Нет свежей резервной копии']);
});
test('catalogue facets identify explicit names, preserve unknowns and exact variants',()=>{
 assert.equal(libraryEquipment('One-Arm DB Bench Press'),'db');assert.equal(libraryRegion('DB Bench Press'),'upper');
 assert.equal(libraryGroup('Half-Kneeling Medicine Ball Chest Pass'),'jump');assert.equal(libraryGroup('SL Glute Bridge ISO'),'hinge');
 assert.equal(libraryEquipment('Unknown exercise'),'other');
 assert.equal(libraryMatches({title:'One-Arm DB Bench Press'},{search:'DB Bench Press',exact:true}),false);
 assert.equal(libraryMatches({title:'DB Bench Press'},{search:'db bench press',exact:true,equipment:'db',region:'upper'}),true);
});
const record={savedAt:'2026-10-14T09:00:00Z',session:{blocks:[{label:'A',exercises:[{name:'DB Bench Press',targetSets:['5']}]}]}};
const log={savedAt:'2026-10-14T10:00:00Z',completedAt:'2026-10-14T10:00:00Z',done:{'0-0-0':true}};
test('completed alias protects original plan while stale/partial/undone evidence does not falsely lock it',()=>{
 const bytes=v=>v?JSON.stringify(v):null;
 assert.equal(completedProgramSnapshot(['1','whoop_1'],[record,null,null,record,null,log].map(bytes)),true);
 assert.equal(completedProgramSnapshot(['1'],[record,null,{...log,done:{}}].map(bytes)),false);
 assert.equal(completedProgramSnapshot(['1'],[record,null,{...log,savedAt:'2026-10-13T10:00:00Z',completedAt:'2026-10-13T10:00:00Z'}].map(bytes)),false);
 const original=structuredClone(record);completedProgramSnapshot(['1'],[record,null,log].map(bytes));assert.deepEqual(record,original);
});
export {SAVE_UNEXECUTED_PROGRAM};

test('save API rejects a completed legacy alias before quality/history writes in both spaces',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../pages/api/programs/save.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','').replace(/^export /gm,'');
 for(const workspace of ['zarechie','nkperf']){
  let writes=0;const previous=JSON.stringify(record);
  const deps={isAuthorized:()=>true,coachBannedSessionExercises:()=>[],redis:async()=>previous,sessionKey:()=>workspace+':session:1:2026-10-14',sessionPlayerAliases:()=>['1','whoop_1'],pfx:()=>workspace,completedProgramSnapshot,
   redisPipeline:async commands=>{assert.ok(commands.every(c=>c[0]==='GET'));return [previous,null,null,previous,null,JSON.stringify(log)];}};
  const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));
  const res={status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  await handler({method:'POST',body:{workspace,playerId:'1',date:'2026-10-14',session:record.session}},res);
  assert.equal(res.code,409);assert.match(res.data.error,/Выполненная программа защищена/);assert.equal(writes,0);
 }
});


test('zero capped budget is not mislabelled missing history; bodyweight set budget still has a valid percent',()=>{
 assert.equal(budgetLabel({status:'within',sets:0,tonnage:0,utilizationPercent:0}),'Процент не рассчитан');
 assert.equal(budgetLabel({status:'calibrating',sets:40,tonnage:2000,utilizationPercent:100}),'Недостаточно истории');
 assert.equal(budgetLabel({status:'within',sets:40,tonnage:0,utilizationPercent:80}),'80%');
});
