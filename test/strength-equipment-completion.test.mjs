import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import {mergeWorkoutProgress} from '../lib/workoutProgress.mjs';
import {normalizeStrengthEquipment,validStrengthEquipment,strengthEquipmentFamily} from '../lib/strengthEquipment.mjs';
import {normalizeDevelopmentPlan} from '../lib/developmentPlan.mjs';
import {strengthSessionCompletion} from '../lib/strengthCompletion.mjs';
import {buildStrengthCycle,STRENGTH_CYCLE_VERSION} from '../lib/strengthCycle.mjs';
import {proposeStrengthLoad} from '../lib/strengthProgression.mjs';
import {buildStrengthDevelopmentDraft} from '../lib/strengthDevelopmentDraft.mjs';
const evidence={date:'2026-10-10',observedKg:100,allRepsMet:true,allSetsCompleted:true,repsVerified:true,rpeScope:'exercise',rpe:6};
const exercise={name:'Barbell Romanian Deadlift',loadUnits:1};
const options={targetDate:'2026-10-12',allowIncrease:true,experience:'experienced'};
test('inventory uses actual ladders and implement units, not inferred increments',()=>{
 assert.deepEqual(normalizeStrengthEquipment({dumbbell:'10; 12.5; 10; 0; -1'}).dumbbell,[10,12.5]);
 assert.equal(strengthEquipmentFamily({name:'DB Bench Press'}),'dumbbell');
 assert.equal(strengthEquipmentFamily({name:'Trap Bar Deadlift'}),'trap_bar');
 assert.equal(strengthEquipmentFamily({name:'Cable Row'}),null);
 assert.equal(proposeStrengthLoad(exercise,evidence,options).kg,100);
 assert.equal(proposeStrengthLoad(exercise,evidence,{...options,equipment:{barbell:[90,100,103.75,110]}}).kg,103.75);
 assert.equal(proposeStrengthLoad(exercise,evidence,{...options,equipment:{barbell:[100,106]}}).kg,100);
 assert.equal(proposeStrengthLoad(exercise,evidence,{...options,equipment:{barbell:[100]}}).action,'hold');
 assert.equal(proposeStrengthLoad(exercise,evidence,{...options,equipment:{barbell:[90,105]}}).kg,null);
 assert.equal(proposeStrengthLoad(exercise,{...evidence,rpe:9},{...options,equipment:{barbell:[80,92.5,100]}}).kg,92.5);
 assert.equal(proposeStrengthLoad(exercise,{...evidence,rpe:9},options).kg,null);
});
test('coach cohort experience supersedes legacy player fields; generic unknown/novice evidence stays gated',()=>{
 for(const experience of ['unknown','novice']) assert.equal(proposeStrengthLoad(exercise,evidence,{...options,experience,equipment:{barbell:[100,102.5]}}).action,'hold');
 assert.equal(normalizeDevelopmentPlan({strengthExperience:'experienced',cycleStart:'2020-01-01'}).strengthExperience,'experienced');
 assert.equal(normalizeDevelopmentPlan({strengthExperience:'invented'}).strengthExperience,'experienced');
 for(const mode of ['maintenance','development']){
  const draft=buildStrengthDevelopmentDraft({snapshot:{player:{position:'Диагональная'}},recommendation:{calendar:{daysToGame:5},state:{}},date:'2026-10-12',manualMethodSelection:true,strengthMode:mode,developmentPlan:{strengthExperience:'novice'}});
  assert.equal(draft.quality.valid,true,JSON.stringify(draft.quality.checks.filter(c=>!c.ok)));
  const main=draft.session.blocks[0].exercises[0];assert.equal(main.targetRpeMax,8);assert.equal(draft.session.methodology.strengthExperienceBasis.label,'Силовой стаж всех игроков: 5+ лет');assert.equal(main.targetSets.length,3);
 }
});
const record={date:'2026-10-10',savedAt:'2026-10-10T08:00:00Z',focus:'inseason_strength',session:{methodology:{strengthCycle:{version:STRENGTH_CYCLE_VERSION,id:'2026-10-10'}},blocks:[{label:'A',exercises:[{code:'A1',name:'Barbell Squat',targetSets:['4','4']}]}]}};
const actual={source:'player_feedback',savedAt:'2026-10-10T10:00:00Z',exercises:[{name:'Barbell Squat',block:'A',plannedSets:2,completed:true,setActuals:[{target:'4',completed:true},{target:'4',completed:true}]}]};
const log={savedAt:'2026-10-10T10:00:00Z',completedAt:'2026-10-10T09:59:00Z',done:{'0-0-0':true,'0-0-1':true}};
test('full execution facts reject partial, skipped, stale, changed and undone sessions',()=>{
 assert.equal(strengthSessionCompletion(record,actual).completed,true);
 assert.equal(strengthSessionCompletion(record,null,log).completed,true);
 assert.equal(strengthSessionCompletion(record).completed,false);
 assert.equal(strengthSessionCompletion(record,{...actual,finishReason:'pain'}).completed,false);
 assert.equal(strengthSessionCompletion(record,null,{...log,done:{'0-0-0':true}}).completed,false);
 assert.equal(strengthSessionCompletion(record,null,{...log,skipped:{'0-0':'pain'}}).completed,false);
 assert.equal(strengthSessionCompletion(record,null,{...log,savedAt:'2026-10-09T10:00:00Z'}).completed,false);
 const changed=structuredClone(record);changed.session.blocks[0].exercises[0].name='DB Squat';
 assert.equal(strengthSessionCompletion(changed,actual).completed,false);
 assert.equal(strengthSessionCompletion(record,actual,{...log,savedAt:'2026-10-10T11:00:00Z',done:{'0-0-0':true}}).completed,false);
});
test('saved drafts never advance; only four distinct completed dates rotate the cycle',()=>{
 const drafts=Array.from({length:12},(_,i)=>({...structuredClone(record),date:`2026-10-${String(i+1).padStart(2,'0')}`}));
 let cycle=buildStrengthCycle(drafts,{targetDate:'2026-10-14'});assert.equal(cycle.position,1);assert.equal(cycle.id,'2026-10-10');
 for(let i=0;i<3;i++) drafts[i].strengthCompletion={completed:true,source:'player_log'};
 cycle=buildStrengthCycle([...drafts,drafts[0]],{targetDate:'2026-10-14'});assert.equal(cycle.completedCount,3);assert.equal(cycle.position,4);
 drafts[3].strengthCompletion={completed:true,source:'player_feedback'};
 cycle=buildStrengthCycle(drafts,{targetDate:'2026-10-14'});assert.equal(cycle.id,'2026-10-14');assert.equal(cycle.position,1);
 const legacy=structuredClone(record);legacy.session.methodology.strengthCycle.version='strength-cycle-4-v1';legacy.session.methodology.strengthCycle.position=4;
 assert.equal(buildStrengthCycle([legacy],{targetDate:'2026-10-14'}).completedCount,0);
});
for(const workspace of ['zarechie','nkperf'])test(`${workspace}: inventory is authenticated, isolated and used from server storage`,async()=>{
 const source=readFileSync(new URL('../pages/api/players/strength-equipment.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
 const calls=[];const deps={isAuthorized:()=>true,pfx:ws=>ws,normalizeStrengthEquipment,validStrengthEquipment,redis:async(...args)=>{calls.push(args);return null;}};
 const handler=new Function(...Object.keys(deps),`${source};return handler;`)(...Object.values(deps));
 const response={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 await handler({method:'POST',body:{workspace,equipment:{dumbbell:[10,12]}}},response);
 assert.equal(response.code,200);assert.equal(calls[0][1],`${workspace}:strength:equipment`);
 const denied=new Function(...Object.keys(deps),`${source};return handler;`)(...Object.values({...deps,isAuthorized:()=>false}));
 await denied({method:'GET',query:{workspace}},response);assert.equal(response.code,401);assert.equal(calls.length,1);
});

for(const workspace of ['zarechie','nkperf'])test(`${workspace}: server history derives completion and overwrites forged plan flags`,async()=>{
 const source=readFileSync(new URL('../lib/sessionHistory.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
 const prefix=workspace==='nkperf'?'nkperf':'coach';
 const planned={...record,strengthCompletion:{completed:true,source:'player_feedback'}};
 let execution=actual;
 const calls=[];
 const deps={redis:async(_cmd,key)=>{assert.ok(key.startsWith(prefix+':'));return [record.date];},redisPipeline:async commands=>{calls.push(commands);return commands.map(([,key])=>key.includes(':session:actual:')?execution:key.includes(':log:')?null:planned);},pfx:()=>prefix,sessionKey:()=>'',strengthSessionCompletion};
 const history=new Function(...Object.keys(deps),source+';return getRecentSessionRecords;')(...Object.values(deps));
 let rows=await history('p1',42,workspace,'2026-10-12',{strict:true,includeCycleHistory:true});assert.equal(rows[0].strengthCompletion.completed,true);
 execution=null;rows=await history('p1',42,workspace,'2026-10-12',{strict:true,includeCycleHistory:true});assert.equal(rows[0].strengthCompletion.completed,false);
 assert.equal(calls[1][0][1],`${prefix}:session:actual:p1:${record.date}`);
});
test('inventory rejects typos and oversized/invalid values rather than dropping them',()=>{
 assert.equal(validStrengthEquipment({dumbbell:'10; 12.5; 14'}),true);
 for(const dumbbell of ['10,5','10; unknown','-5','0','1001',Array(201).fill(10)]) assert.equal(validStrengthEquipment({dumbbell}),false);
});
test('an old future plan cannot restore the completed cycle after a new cycle starts',()=>{
 const old={...record,date:'2026-10-24'};
 const fresh=structuredClone(record);fresh.date='2026-10-22';fresh.session.methodology.strengthCycle.id='2026-10-22';
 assert.equal(buildStrengthCycle([fresh,old],{targetDate:'2026-10-25'}).id,'2026-10-22');
});

test('strength progress persists without TTL while other workout logs retain their expiry',async()=>{
 const source=readFileSync(new URL('../pages/api/player/log.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
 for(const focus of ['inseason_strength','inseason_prophylaxis']){
  const calls=[];
  const deps={redis:async(...args)=>{calls.push(args);if(args[0]==='set')return 'OK';if(args[1].includes(':session:'))return JSON.stringify({focus});return null;},resolveShareToken:async()=>({playerId:'p1',workspace:'nkperf'}),pfx:()=> 'nkperf',mergeWorkoutProgress,recordPlatformEvent:async()=>{},crypto};
  const handler=new Function(...Object.keys(deps),source+';return handler;')(...Object.values(deps));
  const response={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method:'POST',body:{token:'synthetic',date:'2026-10-12',done:{'0-0-0':true}}},response);
  assert.equal(response.code,200);assert.equal(calls.some(c=>c[0]==='expire'),focus!=='inseason_strength');
 }
});
