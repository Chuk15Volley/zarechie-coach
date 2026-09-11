// Explicit verified recovery archive; preserve the existing workout baseline.
import assert from 'node:assert/strict';
import {get,put} from '@vercel/blob';
import {decodeBackup} from '../lib/backupCodec.mjs';
import {sessionInventory} from '../lib/backupIntegrity.mjs';
import {redis,redisPipeline} from '../lib/redis.js';
const token=process.env.BACKUP_READ_WRITE_TOKEN;
const source=process.argv[2];
assert.ok(source?.startsWith('operations/incidents/library-2026-09-11/zarechie/') && source.endsWith('-after.backup'));
async function read(path) {const r=await get(path,{access:'private',useCache:false,token});assert.equal(r.statusCode,200);const chunks=[];for await(const c of r.stream)chunks.push(Buffer.from(c));return Buffer.concat(chunks);}
const snapshot=decodeBackup(await read(source),process.env.BACKUP_ENCRYPTION_KEY);
assert.equal(snapshot.workspace,'zarechie');
const {libraryIds}=sessionInventory(snapshot);assert.ok(libraryIds.length);
const index=new Set(await redis('smembers','ex:index'));assert.ok(libraryIds.every(id=>index.has(id)));
for(let i=0;i<libraryIds.length;i+=50){const types=await redisPipeline(libraryIds.slice(i,i+50).map(id=>['TYPE',`ex:lib:${id}`]));assert.ok(types.every(type=>type==='hash'));}
const path='operations/integrity/zarechie/session-baseline.json';
const baseline=JSON.parse((await read(path)).toString());assert.equal(baseline.workspace,'zarechie');
const body=JSON.stringify({...baseline,libraryIds:[...new Set([...(baseline.libraryIds||[]),...libraryIds])].sort(),librarySource:source});
await put(path,body,{access:'private',token,addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
assert.equal((await read(path)).toString(),body);
console.log(JSON.stringify({verifiedExercises:libraryIds.length,workoutBaselinePreserved:true}));
