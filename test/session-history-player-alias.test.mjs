import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../lib/sessionHistory.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
function history({broken=false}={}) {
 const indexes={'nkperf:sessions:12':['2026-09-26','2026-10-10'], 'nkperf:sessions:whoop_12':['2026-10-06','2026-10-07','2026-10-10']};
 const record=(name,savedAt)=>JSON.stringify({session:{blocks:[{exercises:[{name}]}]},savedAt});
 const values={'nkperf:session:12:2026-09-26':record('old','2026-09-26'), 'nkperf:session:12:2026-10-10':record('newer edit','2026-10-10T12:00:00Z'), 'nkperf:session:whoop_12:2026-10-06':record('incline press','2026-10-06'), 'nkperf:session:whoop_12:2026-10-07':record('row','2026-10-07'), 'nkperf:session:whoop_12:2026-10-10':record('old edit','2026-10-10T11:00:00Z')};
 return new Function('redis','redisPipeline','pfx','sessionKey',source+';return getRecentSessionRecords;')(async(_,key)=>broken&&key.endsWith('whoop_12')?null:indexes[key]||[],async cmds=>cmds.map(c=>values[c[1]]),ws=>ws==='nkperf'?'nkperf':'coach',()=>{});
}
test('numeric and WHOOP identities share latest history before limiting, newest same-day edit wins',async()=>{
 for(const id of ['12','whoop_12']){const rows=await history()(id,3,'nkperf','2026-10-12',{strict:true});assert.deepEqual(rows.map(r=>r.date),['2026-10-06','2026-10-07','2026-10-10']);assert.equal(rows.at(-1).session.blocks[0].exercises[0].name,'newer edit');}
});
test('alias reads stay in workspace, exclude target date and fail closed on missing alias index',async()=>{
 assert.deepEqual(await history()('12',3,'zarechie','2026-10-12',{strict:true}),[]);
 assert.deepEqual((await history()('12',3,'nkperf','2026-10-10',{strict:true})).map(r=>r.date),['2026-09-26','2026-10-06','2026-10-07']);
 await assert.rejects(history({broken:true})('12',3,'nkperf','2026-10-12',{strict:true}),/index is unavailable/);
});
