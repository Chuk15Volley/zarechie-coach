import {randomUUID} from 'node:crypto';
import {coachAuditActor} from '../../../lib/auth';
import {coachAuditCommands} from '../../../lib/coachAudit.mjs';
import {redis} from '../../../lib/redis';
import {pfx} from '../../../lib/workspacePrefix';
import {DECISION_VERSION,validateCycleDecision,SAVE_DECISION_SCRIPT} from '../../../lib/strengthCycleDecisions.mjs';
import { isAuthorized } from '../../../lib/auth';
import { getRecentSessionRecords } from '../../../lib/sessionHistory';
import { buildStrengthCycleReview } from '../../../lib/strengthCycleReview.mjs';
import { shiftIsoDate } from '../../../lib/developmentPlan.mjs';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (!isAuthorized(req)) return res.status(401).json({error:'Unauthorized'});
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  const {workspace='zarechie',playerId,asOf:requestedDate}=req.method==='POST'?req.body || {}:req.query;
  if (!['zarechie','nkperf'].includes(workspace) || typeof playerId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(playerId)) return res.status(400).json({error:'Invalid workspace or playerId'});
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(new Date());
  if (requestedDate && (typeof requestedDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !Number.isFinite(Date.parse(requestedDate)) || new Date(requestedDate).toISOString().slice(0,10)!==requestedDate)) return res.status(400).json({error:'Invalid date'});
  const asOf=requestedDate && requestedDate<today?requestedDate:today;
  try {
    const records=await getRecentSessionRecords(playerId,42,workspace,shiftIsoDate(asOf,1),{strict:true,includeCycleHistory:true,includeStrengthExecution:true});
    const review=buildStrengthCycleReview(records,{asOf});
    const key=id=>`${pfx(workspace)}:strength:cycle-decision:${playerId}:${id}`;
    if(req.method==='POST') {
      const cycle=review.cycles.find(c=>c.id===req.body.cycleId);
      const entries=validateCycleDecision(cycle,req.body.entries);
      if(!entries)return res.status(400).json({error:'Решения доступны только для завершённого цикла. Выберите один вариант каждого слота и допустимые действия; для снижения объёма укажите причину.'});
      const raw=await redis('get',key(cycle.id));
      const previous=raw?JSON.parse(raw):null;
      if((previous?.revision || null)!==(req.body.expectedRevision || null))return res.status(409).json({error:'Решения уже изменены. Обновите обзор перед сохранением.'});
      const decision={version:DECISION_VERSION,cycleId:cycle.id,entries,savedAt:new Date().toISOString(),revision:randomUUID(),actor:coachAuditActor(req)};
      const saved=await redis('eval',SAVE_DECISION_SCRIPT,1,key(cycle.id),raw || '',JSON.stringify(decision),JSON.stringify(coachAuditCommands(workspace,{type:'cycle_decision',playerId,cycleId:cycle.id,actor:decision.actor,revision:decision.revision,previousRevision:previous?.revision || null,before:previous?.entries || [],after:entries,at:decision.savedAt})));
      if(Number(saved)!==1)return res.status(409).json({error:'Решения уже изменены. Обновите обзор перед сохранением.'});
      return res.status(200).json({decision});
    }
    for(const cycle of review.cycles) {
      const raw=await redis('get',key(cycle.id));
      cycle.decision=raw?JSON.parse(raw):null;
    }
    return res.status(200).json(review);
  } catch { return res.status(503).json({error:'Не удалось проверить фактическое выполнение цикла. Повторите загрузку.'}); }
}
