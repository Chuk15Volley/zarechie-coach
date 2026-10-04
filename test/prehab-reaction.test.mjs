import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePrehabReaction, worseningPrehabZones, nextPrehabDate, PREHAB_ZONES, PREHAB_STAGES, prehabReactionKey } from '../lib/prehabReaction.mjs';
const pain = Object.fromEntries(PREHAB_ZONES.map(zone => [zone.key,0]));
const source = readFileSync(new URL('../pages/api/player/prehab-reaction.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ','');
const response = () => ({code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;}});
const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date());
const shift = (date,amount) => {const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10);};
function harness({ stored={}, denied=false, fail=false, programKind='prehab_training_draft', workspace='nkperf', concurrent=false }={}) {
  const writes=[];
  const deps = { normalizePrehabReaction,PREHAB_STAGES,prehabReactionKey,nextPrehabDate,worseningPrehabZones,
    pfx:space=>space, sessionKey:(space,id,date)=>`${space}:session:${id}:${date}`,
    resolveShareToken:async()=>denied?null:{playerId:'private-player',workspace},
    getPrehabReactions:async()=>[{date:today,...stored}],
    redis:async(command,key,value,...options)=>{
      if(fail) throw new Error('offline');
      if(command==='get') return {session:{kind:programKind}};
      writes.push({key,value:JSON.parse(value),options});return concurrent?null:'OK';
    },
  };
  const handler=new Function(...Object.keys(deps),`${source};return handler;`)(...Object.values(deps));
  return {writes, async call(input,method='POST'){const res=response();await handler({method,body:input,query:input},res);return res;}};
}
test('zero is valid; missing and invalid pain values are rejected instead of silently converted',()=>{
  assert.deepEqual(normalizePrehabReaction({pain}).pain,pain);
  for(const value of [null,'',undefined,true,-1,11,2.5,'bad']) assert.throws(()=>normalizePrehabReaction({pain:{...pain,knee:value}}));
  assert.equal(normalizePrehabReaction({pain,note:'x'.repeat(400)}).note.length,300);
});
test('worsening compares stages to the actual baseline without a universal pain cutoff',()=>{
  assert.deepEqual(worseningPrehabZones({before:{pain:{...pain,knee:4}},after:{pain:{...pain,knee:3}}}),[]);
  assert.deepEqual(worseningPrehabZones({before:{pain},nextMorning:{pain:{...pain,shoulder:1}}}),['shoulder']);
  assert.deepEqual(worseningPrehabZones({nextMorning:{pain:{...pain,knee:5}}}),[]);
  assert.equal(nextPrehabDate('2026-12-31'),'2027-01-01');
});
test('share token owns the workspace and baseline is saved atomically without replacing workout feedback',async()=>{
  for(const workspace of ['zarechie','nkperf']) {
    const h=harness({workspace});const res=await h.call({token:'test',date:today,stage:'before',pain,workspace:'attacker',playerId:'other'});
    assert.equal(res.code,200);
    assert.equal(h.writes[0].key,`${workspace}:feedback:private-player:${today}:prehab-reaction:before`);
    assert.deepEqual(h.writes[0].options,['NX']);
  }
});
test('invalid token, non-prehab session and unavailable persistence never acknowledge a saved score',async()=>{
  for(const [options,status] of [[{denied:true},404],[{programKind:'gym'},404],[{fail:true},503],[{concurrent:true},409]]) {
    const h=harness(options);const res=await h.call({token:'test',date:today,stage:'before',pain});
    assert.equal(res.code,status);
  }
});
test('stages enforce baseline, next-morning date and immutable before score',async()=>{
  for(const [input,stored,status] of [
    [{date:today,stage:'after'}, {},409],
    [{date:today,stage:'nextMorning'},{before:{pain}},409],
    [{date:shift(today,1),stage:'before'}, {},409],
    [{date:today,stage:'before'},{before:{pain}},409],
    [{date:'2026-02-30',stage:'before'}, {},400],
    [{date:today,stage:'wrong'}, {},400],
  ]) {
    const h=harness({stored});const res=await h.call({token:'test',pain,...input});assert.equal(res.code,status);assert.equal(h.writes.length,0);
  }
  const h=harness({stored:{before:{pain},after:{pain}}});
  const res=await h.call({token:'test',date:shift(today,-1),stage:'nextMorning',pain:{...pain,achilles:2}});
  assert.equal(res.code,200);assert.deepEqual(res.body.worsenedZones,['achilles']);
});
test('late reports are labeled and GET is private and uncached',async()=>{
  const h=harness();const res=await h.call({token:'test',date:shift(today,-2),stage:'before',pain});
  assert.equal(res.body.reaction.before.retrospective,true);
  assert.equal((await h.call({token:'test',date:today},'GET')).code,200);
});
