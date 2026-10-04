import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generatedDraftKey, generatedDraftRecord } from '../lib/generatedDraft.mjs';
const source=readFileSync(new URL('../pages/api/programs/get.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
const date='2026-10-05';
const result={session:{kind:'prehab_training_draft',blocks:[],warnings:'Не разрешение выполнять нагрузку'},date,player:{id:'1'},quality:{medicalReviewRequired:true}};
const draft=generatedDraftRecord(result,{focus:'inseason_prophylaxis',trainingType:'recovery_prehab'},'2026-10-04T19:00:00Z');
test('generated prophylaxis persists as a draft without coach approval',()=>{assert.equal(draft.draft,true);assert.equal(draft.session.approval,undefined);assert.equal(draft.quality.medicalReviewRequired,true);assert.notEqual(generatedDraftKey('nkperf','1',date),generatedDraftKey('zarechie','1',date));assert.equal(generatedDraftRecord({session:{blocks:[]}},{},''),null);});
async function get(saved){const store=new Map([[generatedDraftKey('zarechie','1',date),JSON.stringify(draft)],['coach:session:1:'+date,saved&&JSON.stringify(saved)]]);const handler=new Function('isAuthorized','redis','sessionKey','generatedDraftKey','parseSavedSession','sanitizeUnavailableEquipmentExercises','getPrehabReactions',source+';return handler;')(()=>true,async(_,key)=>store.get(key),(w,id,d)=>`coach:session:${id}:${d}`,generatedDraftKey,value=>({record:value}),x=>x,async()=>[null]);const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method:'GET',query:{workspace:'zarechie',playerId:'1',date}},res);return res.body.record;}
test('coach can reopen draft by player/date after generation task expires',async()=>{assert.equal((await get(null)).draft,true);assert.equal((await get(null)).session.warnings,result.session.warnings);});
test('manual save newer than draft takes precedence',async()=>{const approved={session:{blocks:[],approval:{status:'coach_approved'}},savedAt:'2026-10-04T20:00:00Z',date};assert.equal((await get(approved)).session.approval.status,'coach_approved');});
