import test from 'node:test';
import assert from 'node:assert/strict';
import {correctedTeamSession} from '../lib/teamDraftCorrection.mjs';
import {sameDraftView,teamDraftIdentity,preparationFailure} from '../lib/teamPreparation.mjs';
const original={kind:'strength_training_draft',methodology:{medicalHold:false,selected:'maintenance'},warnings:'Keep medical warnings',blocks:[{label:'A',exercises:[{code:'A1',name:'Goblet Squat',weightKg:20,targetSets:['5','5'],description:'Original'}]}]};
test('draft correction preserves protected source/methodology and cannot alter medical adaptation',()=>{
 const next=structuredClone(original);next.blocks[0].exercises[0].description='Coach correction';const result=correctedTeamSession(original,next);assert.equal(result.blocks[0].exercises[0].description,'Coach correction');assert.deepEqual(result.methodology,original.methodology);assert.equal(original.blocks[0].exercises[0].description,'Original');
 next.methodology.selected='development';assert.throws(()=>correctedTeamSession(original,next),/защищены/);
 const adapted=structuredClone(original);adapted.blocks[0].exercises[0]={...adapted.blocks[0].exercises[0],symptomAdapted:true,weightKg:null};const loaded=structuredClone(adapted);loaded.blocks[0].exercises[0].weightKg=20;assert.throws(()=>correctedTeamSession(adapted,loaded),/без отягощения/);
});
test('draft view override and correction cache cannot cross workspace, player, date or regenerated job',()=>{
 const context={workspace:'nkperf',playerId:'one',date:'2026-10-14',teamQueueId:'queue',batchId:'job'};assert.equal(sameDraftView(context,'nkperf','one','2026-10-14'),true);assert.equal(sameDraftView(context,'zarechie','one','2026-10-14'),false);assert.equal(sameDraftView(context,'nkperf','two','2026-10-14'),false);assert.equal(sameDraftView(context,'nkperf','one','2026-10-13'),false);assert.notEqual(teamDraftIdentity(context),teamDraftIdentity({...context,batchId:'next'}));
});
test('temporary preparation statuses retry and permanent refusals stay terminal',()=>{
 for(const status of [408,425,429,500,503])assert.equal(preparationFailure({},'temporary',status).status,'preparing');for(const status of [400,401,403,409,422])assert.equal(preparationFailure({},'refused',status).status,'preparation_failed');
});
