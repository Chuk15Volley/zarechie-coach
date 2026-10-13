import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {strengthWeightRange,strengthInventorySetup,inventorySetupFromSaved} from '../lib/strengthInventorySetup.mjs';
import {normalizeStrengthEquipment} from '../lib/strengthEquipment.mjs';
import {strengthCardProposals,strengthProgressionKey,strengthProgressionScope,applyStrengthCardProposal} from '../lib/strengthCardProgression.mjs';
import {buildStrengthDevelopmentDraft} from '../lib/strengthDevelopmentDraft.mjs';
const compile=(file,deps,names)=>new Function(...Object.keys(deps),readFileSync(new URL(file,import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,'')+`;return {${names}};`)(...Object.values(deps));
const setup=()=>({...inventorySetupFromSaved({dumbbell:[10,12.5],kettlebell:[16,24],landmine:[20,30]}),barbell:{mode:'range',min:20,step:'2,5',max:200},trap_bar:{mode:'range',min:20,step:2.5,max:200}});
test('confirmed inventory gives 73 exact total weights and retains other implements',()=>{
 const result=strengthInventorySetup(setup());assert.equal(result.error,undefined);
 for(const family of ['barbell','trap_bar'])assert.deepEqual(result.equipment[family],Array.from({length:73},(_,i)=>20+2.5*i));
 assert.deepEqual(result.equipment.dumbbell,[10,12.5]);assert.deepEqual(result.equipment.landmine,[20,30]);assert.deepEqual(result.equipment.kettlebell,[16,24]);
 assert.deepEqual(inventorySetupFromSaved(result.equipment,result.settings).barbell,{mode:'range',min:20,step:2.5,max:200});
 assert.deepEqual(inventorySetupFromSaved({barbell:[200]}).barbell,{mode:'list',values:'200'});
});
test('range rejects unreachable endpoints, excessive size, invalid numbers and decimal precision',()=>{
 for(const row of [{min:20,step:7,max:200},{min:20,step:.1,max:200},{min:0,step:2.5,max:200},{min:20,step:0,max:200},{min:20,step:2.5,max:10},{min:20,step:.0001,max:21},{min:'bad',step:2.5,max:200}])assert.ok(strengthWeightRange(row).error,JSON.stringify(row));
 assert.deepEqual(strengthWeightRange({min:'20,5',step:'0,5',max:'21,5'}).weights,[20.5,21,21.5]);
});
for(const workspace of ['zarechie','nkperf']){
 test(`${workspace}: ReadySix membership is authoritative, alias history stays scoped and bridge errors never restore a legacy subset`,async()=>{
  const players=[{id:'123'},{id:'other'}],calls=[];let unavailable=false;
  const deps={usesReadySix:()=>true,getCachedReadySixRoster:async(ws,date,opts)=>{assert.equal(ws,workspace);assert.equal(opts.refresh,true);if(unavailable)throw Error('bridge');return {payload:{players,revision:'r1'},cache:'refresh',ageMs:0};},normalizeReadySixRoster:p=>p.players,redis:async()=>{throw Error('legacy roster forbidden');},rosterKey:()=>'',pfx:ws=>ws,redisPipeline:async commands=>{calls.push(...commands);return commands.map(([,key])=>key.endsWith('whoop_123')?['2026-10-13']:key.endsWith(':123')?['2026-10-12']:[]);}};
  const m=compile('../lib/workspaceRoster.js',deps,'workspaceRoster,rosterLastPlans');
  assert.deepEqual((await m.workspaceRoster(workspace,{date:'2026-10-13',refresh:true})).players,players);assert.deepEqual(await m.rosterLastPlans(workspace,players),['2026-10-13',null]);assert.ok(calls.every(([,key])=>key.startsWith(workspace+':')));
  unavailable=true;await assert.rejects(m.workspaceRoster(workspace,{refresh:true}),/bridge/);
 });
 test(`${workspace}: inventory rejects stale tabs, replays once and rejects a concurrent store change`,async()=>{
  const prefix=workspace==='nkperf'?'nkperf':'coach',store=new Map(),writes=[];let race=false;
  const m=compile('../lib/strengthInventoryStore.js',{createHash,randomUUID,queuePrefix:ws=>ws==='nkperf'?'nkperf':'coach',normalizeStrengthEquipment,strengthInventorySetup,coachAuditCommands:()=>[],redis:async(cmd,key)=>store.get(key)||null,redisPipeline:async commands=>commands.map(command=>{const [cmd,script,n,...args]=command;assert.equal(cmd,'EVAL');assert.match(script,/redis.call\('GET'/);if(race){store.set(args[0],'changed');race=false;}for(let i=0;i<n;i++)if((store.get(args[i])||'')!==args[n+i])return 0;const changes=JSON.parse(args[n*2]);writes.push(...changes);for(const [op,key,value] of changes)if(op==='SET')store.set(key,value);return 1;})},'loadStrengthInventory,saveStrengthInventory');
  const context=await m.loadStrengthInventory(workspace),input={workspace,setup:setup(),fingerprint:context.fingerprint,requestId:randomUUID()};
  await m.saveStrengthInventory(context,input,{});assert.equal(JSON.parse(store.get(prefix+':strength:equipment')).barbell.length,73);assert.ok(store.has(prefix+':strength:equipment-updated'));
  const count=writes.length,current=await m.loadStrengthInventory(workspace);assert.equal((await m.saveStrengthInventory(current,input,{})).replayed,true);assert.equal(writes.length,count);
  await assert.rejects(m.saveStrengthInventory(current,{...input,requestId:randomUUID()},{}),/другом окне/);
  race=true;await assert.rejects(m.saveStrengthInventory(current,{...input,fingerprint:current.fingerprint,requestId:randomUUID()},{}),/во время сохранения/);assert.equal(writes.length,count);
 });
 test(`${workspace}: cards copy the actual generator prescription, and reject edited, stale or foreign proposals`,()=>{
  const draft=buildStrengthDevelopmentDraft({snapshot:{player:{position:'Диагональная'}},recommendation:{calendar:{daysToGame:5},state:{}},date:'2026-10-13',manualMethodSelection:true,strengthMode:'maintenance'});
  assert.equal(draft.quality.valid,true);const exercises=draft.session.blocks.flatMap(b=>b.exercises),scope=strengthProgressionScope({workspace,playerId:'123',date:'2026-10-13',focus:'inseason_strength'}),checkedAt='2026-10-13T08:00:00Z';
  const proposals=strengthCardProposals(exercises,draft.session,scope,{checkedAt});
  for(const ex of exercises){const proposal=proposals[strengthProgressionKey(ex)];if(ex.weightKg>0 && !ex.symptomAdapted){assert.equal(proposal.suggestedKg,ex.weightKg);assert.deepEqual(proposal.targetSets,ex.targetSets);}else assert.equal(proposal.applicable,false);}
  const ex={code:'A1',name:'Barbell Squat',loadUnits:1,targetSets:['4','4'],targetRpeMax:8,weightKg:100},next={...ex,weightKg:102.5,loadEvidence:{observedKg:100,rpeScope:'exercise',rpe:7,date:'2026-10-10'},loadProgression:{action:'increase',reason:'confirmed'}};
  const proposal=strengthCardProposals([ex],{blocks:[{exercises:[next]}]},scope,{checkedAt})[strengthProgressionKey(ex)],now=Date.parse(checkedAt)+1000;
  assert.equal(applyStrengthCardProposal(ex,proposal,scope,now).weightKg,102.5);
  for(const invalid of [{...proposal,checkedAt:'invalid'},{...proposal,checkedAt:'2026-10-12T08:00:00Z'},{...proposal,scope:'other'},{...proposal,pain:true}])assert.equal(applyStrengthCardProposal(ex,invalid,scope,now),ex);
  const edited={...ex,targetSets:['5','5']};assert.equal(applyStrengthCardProposal(edited,proposal,scope,now),edited);
  assert.equal(strengthCardProposals([ex],{blocks:[{exercises:[{...next,name:'DB Squat'}]}]},scope)[strengthProgressionKey(ex)].applicable,false);
  assert.equal(strengthCardProposals([ex],{blocks:[{exercises:[next]}]},scope,{blocking:true})[strengthProgressionKey(ex)].applicable,false);
  const sessionRpe={...next,loadEvidence:{rpe:6,rpeScope:'session'}};assert.equal(strengthCardProposals([ex],{blocks:[{exercises:[sessionRpe]}]},scope)[strengthProgressionKey(ex)].rpe,null);
  const reps={...next,weightKg:100,targetSets:['5','5'],loadProgression:{action:'increase_reps'}};assert.deepEqual(strengthCardProposals([ex],{blocks:[{exercises:[reps]}]},scope)[strengthProgressionKey(ex)].targetSets,['5','5']);
 });
}
for(const workspace of ['zarechie','nkperf'])test(`${workspace}: changed inventory invalidates review; an older unchanged inventory remains publishable`,async()=>{
 let inventorySavedAt='2026-10-13T09:00:00Z';const commands=[];
 const queue={workspace,id:'q',date:'2026-10-13',createdAt:'2026-10-13T07:00:00Z',request:{focus:'inseason_strength'}},row={playerId:'123',batchId:'b'};
 const m=compile('../lib/teamPublicationChecks.js',{redis:async(_cmd,key)=>key==='coach:batch:b'?JSON.stringify({strengthFactsStartedAt:'2026-10-13T08:00:00Z'}):key.endsWith(':strength:equipment-updated')?JSON.stringify({savedAt:inventorySavedAt,revision:'inventory-r'}):null,redisPipeline:async ops=>commands.push(...ops),getPlayerSnapshot:async()=>({}),teamQueueKey:()=>workspace+':q',queuePrefix:ws=>ws,TEAM_QUEUE_TTL:600,parseQueueJSON:value=>value?JSON.parse(value):null,readySixPublicationState:()=>({}),readySixPublicationChanges:()=>({status:'unchanged',changes:[]})},'checkTeamPublication');
 const changed=await m.checkTeamPublication(queue,row);assert.equal(changed.status,'changed');assert.deepEqual(changed.changes,['Доступные веса инвентаря']);assert.equal(changed.inventoryKey,workspace+':strength:equipment-updated');assert.ok(commands.some(op=>op[0]==='HSET' && op[1].endsWith(':reviews') && op[3]===''));
 commands.length=0;inventorySavedAt='2026-10-13T07:00:00Z';assert.equal((await m.checkTeamPublication(queue,row)).status,'unchanged');assert.ok(!commands.some(op=>op[1].endsWith(':reviews')));
});
test('progression endpoint calls the shared generation path and never returns an invented fallback on failure',async()=>{
 let fail=false,called=0;const ex={code:'A1',name:'Barbell Squat',targetSets:['4'],targetRpeMax:8,weightKg:100};
 const m=compile('../lib/strengthProgressionReview.js',{buildGenerationInputs:async input=>{called++;assert.equal(input.autoSave,false);assert.equal(input.manualMethodSelection,true);assert.equal(input.focus,'inseason_strength');if(fail)throw Error('history');return {readyResult:{session:{blocks:[{exercises:[ex]}]},quality:{valid:true}}};},strengthCardProposals,strengthProgressionScope,enforceRateLimit:async()=>true,validWorkspace:ws=>['zarechie','nkperf'].includes(ws),validCoachDate:date=>date==='2026-10-13'},'strengthProgressionReview');
 const res={status(n){this.code=n;return this;},json(data){this.data=data;return this;}};const req={body:{workspace:'zarechie',playerId:'123',date:'2026-10-13',exercises:[ex]}};
 await m.strengthProgressionReview(req,res);assert.equal(res.code,200);assert.equal(res.data.progressionBySlot[strengthProgressionKey(ex)].suggestedKg,100);
 fail=true;await m.strengthProgressionReview(req,res);assert.equal(res.code,503);assert.equal(res.data.progressionBySlot,undefined);
 req.body.strengthMode='invented';await m.strengthProgressionReview(req,res);assert.equal(res.code,400);assert.equal(called,2);
});
