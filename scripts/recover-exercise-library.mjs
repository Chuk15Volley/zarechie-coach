// Explicit archive required. Dry-run unless --apply. Never changes player/NK keys.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { put, get } from '@vercel/blob';
import { redis, redisPipeline } from '../lib/redis.js';
import { encodeBackup, decodeBackup, restoreCommandsForEntry } from '../lib/backupCodec.mjs';
import { ADD_MISSING_HISTORY_LUA } from '../lib/missingHistoryRecovery.mjs';
import { canonicalRedisValue, redisValuesMatch } from '../lib/recoveryDrill.mjs';

const pathname = process.argv[2];
if (!pathname || pathname.startsWith('--')) throw Error('Explicit local pre-migration archive required');
const apply = process.argv.includes('--apply');
const source = JSON.parse(fs.readFileSync(pathname, 'utf8'));
const allowed = key => /^ex:lib:[^:]+$|^ex:alias$|^ex:index$|^exercise:(manual|yt-manual):[^:]+$/.test(key);
const entries = source.records.filter(e => allowed(e.key) && !e.expiresAt).map(e => ({ key:e.key, type:e.type, value:e.value, ttlMs:-1 }));
assert.ok(entries.length > 0);
const read = e => e.type === 'hash' ? ['HGETALL',e.key] : e.type === 'set' ? ['SMEMBERS',e.key] : ['GET',e.key];
async function pipe(commands) {
  const out=[];
  for(let i=0;i<commands.length;i+=20) out.push(...await redisPipeline(commands.slice(i,i+20)));
  return out;
}
async function capture() {
  const keys=new Set(entries.map(e=>e.key));
  for(const pattern of ['ex:lib:*','ex:alias','ex:index','exercise:manual:*','exercise:yt-manual:*']) {
    let cursor='0'; do { const r=await redis('scan',cursor,'MATCH',pattern,'COUNT',500); cursor=String(r[0]);r[1].forEach(k=>keys.add(k)); if(keys.size>10000) throw Error('Scope limit'); } while(cursor!=='0');
  }
  const names=[...keys]; const types=await pipe(names.map(k=>['TYPE',k]));
  const existing=names.map((key,i)=>({key,type:types[i]})).filter(e=>e.type!=='none');
  assert.ok(existing.every(e=>['hash','string','set'].includes(e.type)));
  const values=await pipe(existing.map(read)); const ttls=await pipe(existing.map(e=>['PTTL',e.key]));
  return existing.map((e,i)=>({...e,value:values[i],ttlMs:ttls[i]}));
}
const before=await capture(); const current=new Map(before.map(e=>[e.key,e]));
const absent=entries.filter(e=>!current.has(e.key));
for(const e of entries) if(current.has(e.key)) assert.equal(current.get(e.key).type,e.type);
console.log(JSON.stringify({phase:'plan',sourceDate:source.createdAt,archivedCards:entries.filter(e=>e.key.startsWith('ex:lib:')).length,currentCards:before.filter(e=>e.key.startsWith('ex:lib:')).length,missingCards:absent.filter(e=>e.key.startsWith('ex:lib:')).length,missingKeys:absent.length}));
if(!apply) process.exit(0);
const incident=`operations/incidents/library-2026-09-11/zarechie/${crypto.randomUUID()}`;
async function protect(label, records, createdAt=new Date().toISOString()) {
  const bytes=encodeBackup({schemaVersion:2,workspace:'zarechie',id:`library-${label}`,createdAt,entries:records},process.env.BACKUP_ENCRYPTION_KEY);
  const blob=await put(`${incident}-${label}.backup`,bytes,{access:'private',addRandomSuffix:false,allowOverwrite:false,token:process.env.BACKUP_READ_WRITE_TOKEN});
  const check=await get(blob.pathname,{access:'private',useCache:false,token:process.env.BACKUP_READ_WRITE_TOKEN});
  assert.equal(check.statusCode,200); const chunks=[];for await(const c of check.stream)chunks.push(Buffer.from(c));
  const actual=Buffer.concat(chunks);assert.ok(actual.equals(bytes));decodeBackup(actual,process.env.BACKUP_ENCRYPTION_KEY);
}
await protect('before',before);await protect('source',entries,source.createdAt);
// Existing cards are whole records: do not resurrect intentionally cleared media.
// Aliases and index merge missing members only; existing aliases retain priority.
const commands=entries.map(e=>{
  const merge=e.key==='ex:alias'||e.key==='ex:index';
  let ops=restoreCommandsForEntry({...e,ttlMs:-1}).slice(1).map(([op,,...args])=>[op,...args]);
  if(e.key==='ex:alias') {const pairs=Array.isArray(e.value)?e.value:Object.entries(e.value).flat();ops=[];for(let i=0;i<pairs.length;i+=2)ops.push(['HSETNX',String(pairs[i]),String(pairs[i+1])]);}
  return ['EVAL',ADD_MISSING_HISTORY_LUA,1,e.key,e.type,JSON.stringify(ops),merge?'merge':'absent','-1'];
});
const results=await pipe(commands);assert.ok(results.every(r=>r!==-1));
const after=await capture();const restored=new Map(after.map(e=>[e.key,e]));
for(const e of before) {
  assert.ok(restored.has(e.key));
  if(e.key==='ex:index') {const members=new Set(restored.get(e.key).value);assert.ok(e.value.every(v=>members.has(v)));}
  else if(e.key==='ex:alias') {const pairs=new Map(canonicalRedisValue('hash',restored.get(e.key).value));for(const [k,v] of canonicalRedisValue('hash',e.value))assert.equal(pairs.get(k),v);}
  else assert.ok(redisValuesMatch(e.type,e.value,restored.get(e.key).value),'Existing record changed; inspect concurrent edits');
}
for(const e of absent.filter(e=>!['ex:index','ex:alias'].includes(e.key)))assert.ok(redisValuesMatch(e.type,e.value,restored.get(e.key)?.value));
const ids=new Set(restored.get('ex:index')?.value||[]);
for(const e of entries.filter(e=>e.key.startsWith('ex:lib:')))assert.ok(ids.has(e.key.slice(7)),'Archived card missing from index');
await protect('after',after);
console.log(JSON.stringify({phase:'verified',cards:after.filter(e=>e.key.startsWith('ex:lib:')).length,restoredCards:absent.filter(e=>e.key.startsWith('ex:lib:')).length,restoredKeys:absent.length,existingPreserved:true,incident}));
