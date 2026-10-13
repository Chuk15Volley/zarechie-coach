import test from 'node:test';
import assert from 'node:assert/strict';
import {programEditPlayerId} from '../lib/programEditIdentity.mjs';
import {saveProgramRequest} from '../lib/programSaveClient.mjs';
for(const workspace of ['zarechie','nkperf'])test(workspace+': editing an opened legacy program saves to its old-link owner with the original date',async()=>{
 const calls=[];await saveProgramRequest({workspace,playerId:programEditPlayerId('39474730','whoop_39474730'),date:'2026-10-14',session:{blocks:[]} },'fixture',{requestId:'local-fixture-request',fetchImpl:async(path,options)=>{calls.push(JSON.parse(options.body));return {status:200,ok:true,json:async()=>({status:'ok',session:{blocks:[]}})};}});
 assert.equal(calls.length,1);assert.equal(calls[0].workspace,workspace);assert.equal(calls[0].playerId,'whoop_39474730');assert.equal(calls[0].date,'2026-10-14');
});
test('fresh drafts and foreign or malformed source identities never redirect an edit',()=>{
 for(const source of [null,undefined,'whoop_99','foreign','whoop_whoop_39474730','39474730:2026-10-14'])assert.equal(programEditPlayerId('39474730',source),'39474730');
 assert.equal(programEditPlayerId('whoop_39474730','39474730'),'39474730');
 assert.equal(programEditPlayerId('qa_0','qa_0'),'qa_0');
 assert.equal(programEditPlayerId('qa_0','whoop_qa_0'),'qa_0');
});
