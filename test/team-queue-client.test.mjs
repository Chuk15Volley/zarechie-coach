import test from 'node:test';
import assert from 'node:assert/strict';
import {queueResponseGate,teamQueueCall} from '../lib/teamQueueClient.mjs';
test('late polling, duplicate actions and unmounted scopes cannot overtake current queue mutations',()=>{
 const gate=queueResponseGate(),old=gate.read(),fresh=gate.read();assert.equal(gate.accept(old),false);assert.equal(gate.accept(fresh),true);
 const action=gate.begin();assert.equal(gate.accept(fresh),false);assert.equal(gate.begin(),null);const during=gate.read();gate.finish(action);assert.equal(gate.accept(fresh),false);
 // A read started during mutation is never used by the hook; any previous read remains invalidated.
 const next=gate.read();assert.equal(gate.accept(during),false);assert.equal(gate.accept(next),true);gate.close();assert.equal(gate.accept(next),false);assert.equal(gate.owns(action),false);
});
test('queue HTTP waits are bounded and explain uncertain mutation outcome without automatic replay',async()=>{
 let calls=0;const fetchImpl=async(path,{signal})=>{calls++;await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true});});};
 await assert.rejects(teamQueueCall('test','/queue',{body:{action:'pause'},fetchImpl,timeoutMs:5}),/могло выполниться/);assert.equal(calls,1);
 await assert.rejects(teamQueueCall('test','/queue',{fetchImpl,timeoutMs:5}),/Сервер не ответил/);assert.equal(calls,2);
});
test('server conflict returns the current version for review, never replays an old write',async()=>{
 const queue={id:'new',revision:4};let calls=0;await assert.rejects(teamQueueCall('test','/queue',{body:{expectedRevision:3},fetchImpl:async()=>{calls++;return {ok:false,status:409,json:async()=>({error:'stale',queue})};}}),error=>error.status===409 && error.queue===queue);assert.equal(calls,1);
});
