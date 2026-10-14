import {selectGymEdition} from './gymEdition.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {redis,redisPipeline} from './redis';
import {queuePrefix} from './teamQueue.mjs';
import {coachAuditCommands} from './coachAudit.mjs';
import {supplementKey,strengthMissingEditor,normalizeActualPatches,actualSources,actualExerciseSignatures} from './strengthActualSupplement.mjs';
const parse=raw=>raw?typeof raw==='string'?JSON.parse(raw):raw:null;
const error=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
export async function loadStrengthActual(workspace,playerId,date){
  const numeric=playerId.replace(/^whoop_/,''),ids=/^\d+$/.test(numeric)?[...new Set([playerId,numeric,'whoop_'+numeric])]:[playerId],prefix=queuePrefix(workspace);
  const records=await Promise.all(ids.map(async id=>{const key=prefix+':session:'+id+':'+date,raw=await redis('get',key);return {id,key,raw,record:parse(raw)};}));
  for(const item of records){const rawFacts=await Promise.all(['session:actual','log','strength:actual-supplement'].map(type=>redis('get',`${prefix}:${type}:${item.id}:${date}`)));item.factRaws=rawFacts;[item.rawActual,item.rawLog,item.supplement]=rawFacts.map(parse);}
  const source=selectGymEdition(records);
  if(!source)error('Программа на эту дату не найдена.',404);
  const keys=[source.key,prefix+':session:actual:'+source.id+':'+date,prefix+':log:'+source.id+':'+date,supplementKey(prefix,source.id,date)],raws=[source.raw,...source.factRaws],actual=parse(raws[1]),log=parse(raws[2]),supplement=parse(raws[3]),editor=strengthMissingEditor(source.record,actual,log,supplement);
  for(const alias of records.filter(item=>item.id!==source.id)){keys.push(alias.key,...['session:actual','log','strength:actual-supplement'].map(type=>`${prefix}:${type}:${alias.id}:${date}`));raws.push(alias.raw,...alias.factRaws);}
  if(!editor)error('Заполнение доступно только после полного подтверждённого выполнения силовой. Пропуски и частичное выполнение не превращаются в завершение.');
  return {keys,raws,record:source.record,actual,log,supplement,editor,fingerprint:createHash('sha256').update(JSON.stringify(raws)).digest('hex'),sourcePlayerId:source.id};
}
export const SAVE_ACTUAL_SUPPLEMENT_SCRIPT=`for i=1,#KEYS do if (redis.call('GET',KEYS[i]) or '')~=ARGV[i] then return 0 end end; local cmds=cjson.decode(ARGV[#KEYS+1]); for _,cmd in ipairs(cmds) do redis.call(unpack(cmd)) end; return 1`;
export async function saveStrengthActual(context,{workspace,playerId,date,fingerprint,requestId,patches,reason,reconfirmRevision=null,acknowledgeStale=false},actor){
  if(typeof requestId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId) || typeof reason!=='string' || !reason.trim() || reason.length>300)error('Укажите причину подтверждения фактических данных.',400);
  const requestHash=createHash('sha256').update(JSON.stringify([fingerprint,patches,reason.trim(),reconfirmRevision,acknowledgeStale])).digest('hex');
  if(context.supplement?.requestId===requestId && context.supplement.baseFingerprint===context.editor.baseFingerprint){if(context.supplement.requestHash!==requestHash && !(context.supplement.version===1 && reconfirmRevision===null && !acknowledgeStale && context.supplement.requestHash===createHash('sha256').update(JSON.stringify([fingerprint,patches,reason.trim()])).digest('hex')))error('Запрос уже сохранён с другими данными. Обновите записи.');return {replayed:true,revision:context.supplement.revision};}
  if(context.fingerprint!==fingerprint)error('Программа или выполнение изменились. Перечитайте данные перед подтверждением.');
  if(context.editor.canConfirm===false)error('Полное выполнение не подтверждено; повторное подтверждение недоступно.');
  if(context.editor.supplementStatus==='stale' && (reconfirmRevision!==context.supplement.revision || acknowledgeStale!==true))error('Проверьте причины устаревания и явно подтвердите текущую версию дополнения.');
  const normalized=context.editor.supplementStatus==='stale' && acknowledgeStale===true && Array.isArray(patches) && !patches.length?[]:normalizeActualPatches(context.editor,patches);if(!normalized)error('Можно заполнить только отсутствующие фактические значения. Проверьте кг, повторы и RPE.',400);
  const previous=context.editor.supplementStatus==='applied'?context.supplement.patches:[],savedAt=new Date().toISOString(),revision=randomUUID();
  const supplement={version:2,sources:actualSources(context.record,context.actual,context.log),exerciseSignatures:actualExerciseSignatures(context.record),reconfirmedFrom:reconfirmRevision,baseFingerprint:context.editor.baseFingerprint,revision,savedAt,actor,reason:reason.trim(),patches:[...previous,...normalized],requestId,requestHash};
  const commands=[['SET',queuePrefix(workspace)+':strength:actual-updated:'+playerId.replace(/^whoop_/,''),JSON.stringify({revision,savedAt})],['SET',context.keys[3],JSON.stringify(supplement)],['LPUSH',context.keys[3]+':versions',JSON.stringify(supplement)],['LTRIM',context.keys[3]+':versions',0,19],...coachAuditCommands(workspace,{type:'actual_completed',playerId,date,revision,previousRevision:context.supplement?.revision || null,actor,reason:supplement.reason,changes:normalized.map(patch=>({...patch,name:context.editor.rows.find(row=>row.exercise===patch.exercise).name})),reconfirmedFrom:reconfirmRevision,staleReasons:context.editor.staleReasons || [],executionCompletedAt:context.editor.completedAt,at:savedAt})];
  const [saved]=await redisPipeline([['EVAL',SAVE_ACTUAL_SUPPLEMENT_SCRIPT,context.keys.length,...context.keys,...context.raws.map(raw=>raw || ''),JSON.stringify(commands)]]);
  if(Number(saved)!==1)error('Данные изменились в другом окне. Заполнение не сохранено; перечитайте записи.');
  return {replayed:false,revision};
}
