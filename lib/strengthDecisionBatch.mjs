import {randomUUID,createHash} from 'node:crypto';
import {DECISION_VERSION,validateCycleDecision} from './strengthCycleDecisions.mjs';
import {coachAuditCommands} from './coachAudit.mjs';
import {queuePrefix} from './teamQueue.mjs';
export const SAVE_DECISION_BATCH_SCRIPT=`local rows=cjson.decode(ARGV[1]); for i,row in ipairs(rows) do if (redis.call('GET',KEYS[i]) or '')~=row.old then return 0 end end; for i,row in ipairs(rows) do redis.call('SET',KEYS[i],row.value) end; local cmds=cjson.decode(ARGV[2]); for _,cmd in ipairs(cmds) do redis.call(unpack(cmd)) end; return 1`;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export async function saveDecisionBatch({workspace,trainingType,requestId,items,actor,loadReview,redis}){
  if(!['zarechie','nkperf'].includes(workspace) || !['full_body','anterior_chain','posterior_chain'].includes(trainingType) || typeof requestId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId) || !Array.isArray(items) || !items.length || items.length>30)fail('Выберите от 1 до 30 игроков и цепь.');
  const ids=new Set();for(const item of items){if(typeof item?.playerId!=='string' || !/^[\w-]{1,100}$/.test(item.playerId) || ids.has(item.playerId))fail('Некорректный или повторяющийся игрок.');ids.add(item.playerId);}
  const manifest=createHash('sha256').update(JSON.stringify([workspace,trainingType,items.map(item=>[item.playerId,item.cycleId]).sort()])).digest('hex');
  const deadline=Date.now()+45000;
  const checkTime=()=>{if(Date.now()>=deadline)fail('Проверка группы превысила 45 секунд. Решения не записаны; повторите меньшей группой.',503);};
  const pending=new Array(items.length);let cursor=0;
  async function worker(){while(cursor<items.length){checkTime();const index=cursor++,item=items[index];
    const review=await loadReview(item.playerId),cycle=review.cycles[0];
    if(cycle?.id!==item.cycleId || cycle.status!=='completed')fail('Цикл '+item.playerId+' изменился или ещё не завершён. Обновите обзор.',409);
    const selected=validateCycleDecision(cycle,item.entries);
    if(!selected?.length || selected.some(entry=>entry.trainingType!==trainingType || !entry.note.trim()))fail('Для каждого выбранного движения укажите индивидуальную причину.');
    const codes=new Set(cycle.exercises.filter(row=>row.trainingType===trainingType).map(row=>row.code));
    if(selected.length!==codes.size || selected.some(entry=>!codes.has(entry.code)))fail('Выберите по одному варианту каждого основного движения выбранной цепи.');
    const key=queuePrefix(workspace)+':strength:cycle-decision:'+item.playerId+':'+cycle.id,raw=await redis('get',key),previous=raw?JSON.parse(raw):null;
    const replay=previous?.requestId===requestId;
    if(replay && previous.batchManifest!==manifest)fail('Состав сохранённой группы изменён. Обновите обзор.',409);
    if(replay && JSON.stringify(previous.entries.filter(entry=>entry.trainingType===trainingType))!==JSON.stringify(selected))fail('Этот запрос уже сохранён с другими решениями. Обновите обзор.',409);
    if(!replay && (previous?.revision || null)!==(item.expectedRevision || null))fail('Решения '+item.playerId+' уже изменены в другом окне. Обновите обзор.',409);
    const entries=validateCycleDecision(cycle,[...(previous?.entries || []).filter(entry=>entry.trainingType!==trainingType),...selected]);
    if(!entries)fail('Предыдущие решения требуют индивидуальной проверки.',409);
    const decision=replay?previous:{version:DECISION_VERSION,cycleId:cycle.id,entries,savedAt:new Date().toISOString(),revision:randomUUID(),actor,requestId,batchManifest:manifest};
    pending[index]={key,old:raw || '',value:JSON.stringify(decision),decision,playerId:item.playerId,replay,previous};
  }}
  await Promise.all([worker(),worker()]);
  if(pending.every(row=>row.replay))return {replayed:true,decisions:pending.map(({playerId,decision})=>({playerId,decision}))};
  if(pending.some(row=>row.replay))fail('Состав сохранённой группы изменён. Обновите обзор.',409);
  checkTime();
  const commands=pending.flatMap(row=>coachAuditCommands(workspace,{type:'cycle_decision',playerId:row.playerId,cycleId:row.decision.cycleId,revision:row.decision.revision,previousRevision:row.previous?.revision || null,before:row.previous?.entries || [],after:row.decision.entries,actor,requestId,at:row.decision.savedAt}));
  const saved=await redis('eval',SAVE_DECISION_BATCH_SCRIPT,pending.length,...pending.map(row=>row.key),JSON.stringify(pending.map(({old,value})=>({old,value}))),JSON.stringify(commands));
  if(Number(saved)!==1)fail('Решения изменились в другом окне. Ни одно решение группы не перезаписано. Обновите обзор.',409);
  return {replayed:false,decisions:pending.map(({playerId,decision})=>({playerId,decision}))};
}
