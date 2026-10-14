import {createHash} from 'node:crypto';
import {coachAuditKey} from './coachAudit.mjs';
export const AUDIT_TYPES=['cycle_decision','program_published','draft_reviewed','draft_corrected','draft_unreviewed','actual_completed','equipment_changed'];
export const validCoachDate=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const bad=message=>{throw Object.assign(new Error(message),{status:400});};
export function auditFilters(input){
  const {playerId='',type='',from='',to=''}=input;
  if(typeof playerId!=='string' || playerId && !/^[\w-]{1,100}$/.test(playerId) || typeof type!=='string' || type && !AUDIT_TYPES.includes(type) || from && !validCoachDate(from) || to && !validCoachDate(to) || from && to && from>to)bad('Некорректные фильтры журнала.');
  return {playerId,type,from,to};
}
export async function coachAuditPage(redis,workspace,input={}){
  const filters=auditFilters(input),digest=createHash('sha256').update(JSON.stringify([workspace,filters])).digest('hex').slice(0,20);
  let after=null;if(input.cursor){try{if(typeof input.cursor!=='string' || input.cursor.length>256)bad('Некорректная страница журнала.');const cursor=JSON.parse(Buffer.from(input.cursor,'base64url').toString());if(cursor.digest!==digest || !/^[0-9a-f-]{36}$/.test(cursor.id))bad('Фильтры журнала изменились. Начните с первой страницы.');after=cursor.id;}catch{bad('Некорректная страница журнала.');}}
  let found=!after,more=false,last=null;const events=[],seen=new Set();
  for(let offset=0;offset<2000;offset+=100){const raws=await redis('zrevrange',coachAuditKey(workspace),offset,Math.min(offset+99,1999));
    for(const raw of raws){const event=typeof raw==='string'?JSON.parse(raw):raw;if(!found){if(event.id===after)found=true;continue;}
      if(seen.has(event.id))continue;seen.add(event.id);
      const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(new Date(event.at));
      if(filters.playerId && event.playerId!==filters.playerId || filters.type && event.type!==filters.type || filters.from && day<filters.from || filters.to && day>filters.to)continue;
      if(events.length===50){more=true;break;}events.push(event);last=event.id;
    }
    if(more || raws.length<100)break;
  }
  if(!found)throw Object.assign(new Error('Страница журнала вышла за срок хранения. Обновите журнал.'),{status:409});
  return {events,retained:2000,nextCursor:more?Buffer.from(JSON.stringify({id:last,digest})).toString('base64url'):null,filters};
}
