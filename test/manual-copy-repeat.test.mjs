import test from 'node:test';import assert from 'node:assert/strict';
import {createCopyRepeatException,validCopyRepeatException,sessionPlayerAliases} from '../lib/manualCopyRepeat.mjs';
const secret='test-key';const context={workspace:'nkperf',playerId:'12',date:'2026-10-12',sourceWorkspace:'zarechie',sourcePlayerId:'23',sourceDate:'2026-10-12'};
const session=()=>({blocks:[{exercises:[{code:'A1',name:'DB Incline Bench Press',targetSets:['7','7']}]}]});
test('explicit repeat approval survives manual dosing and reload, stays on this player/date/composition',()=>{
 const s=session();s.copyRepeatException=createCopyRepeatException(s,context,secret);
 const restored=JSON.parse(JSON.stringify(s));restored.blocks[0].exercises[0].targetSets=['6','6'];
 assert.equal(validCopyRepeatException(restored,context,secret),true);
 assert.equal(validCopyRepeatException(restored,{...context,playerId:'whoop_12'},secret),true);
 for(const changed of [{date:'2026-10-13'},{playerId:'99'},{workspace:'zarechie'}])assert.equal(validCopyRepeatException(restored,{...context,...changed},secret),false);
 restored.blocks[0].exercises[0].name='Other Exercise';assert.equal(validCopyRepeatException(restored,context,secret),false);
 assert.equal(validCopyRepeatException(session(),context,secret),false);
});
test('forged approval cannot authorize a repeat; legacy links stay in same player identity',()=>{
 const s=session();s.copyRepeatException={...createCopyRepeatException(s,context,secret),date:'2026-10-13'};
 assert.equal(validCopyRepeatException(s,{...context,date:'2026-10-13'},secret),false);
 assert.deepEqual(sessionPlayerAliases('whoop_12'),['12','whoop_12']);assert.deepEqual(sessionPlayerAliases('custom-player'),['custom-player']);
});
