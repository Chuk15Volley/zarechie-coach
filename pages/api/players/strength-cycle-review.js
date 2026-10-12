import { isAuthorized } from '../../../lib/auth';
import { getRecentSessionRecords } from '../../../lib/sessionHistory';
import { buildStrengthCycleReview } from '../../../lib/strengthCycleReview.mjs';
import { shiftIsoDate } from '../../../lib/developmentPlan.mjs';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (!isAuthorized(req)) return res.status(401).json({error:'Unauthorized'});
  if (req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const {workspace='zarechie',playerId,asOf:requestedDate}=req.query;
  if (!['zarechie','nkperf'].includes(workspace) || typeof playerId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(playerId)) return res.status(400).json({error:'Invalid workspace or playerId'});
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(new Date());
  if (requestedDate && (typeof requestedDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !Number.isFinite(Date.parse(requestedDate)) || new Date(requestedDate).toISOString().slice(0,10)!==requestedDate)) return res.status(400).json({error:'Invalid date'});
  const asOf=requestedDate && requestedDate<today?requestedDate:today;
  try {
    const records=await getRecentSessionRecords(playerId,42,workspace,shiftIsoDate(asOf,1),{strict:true,includeCycleHistory:true,includeStrengthExecution:true});
    return res.status(200).json(buildStrengthCycleReview(records,{asOf}));
  } catch { return res.status(503).json({error:'Не удалось проверить фактическое выполнение цикла. Повторите загрузку.'}); }
}
