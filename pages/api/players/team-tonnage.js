import {playerHistoryFacts} from '../../../lib/playerHistoryFacts.mjs';
import {factTasks} from '../../../lib/factPeriod.mjs';
import {strengthSessionCompletion} from '../../../lib/strengthCompletion.mjs';
import {workspaceRoster} from '../../../lib/workspaceRoster';
import {sessionPlanFact} from '../../../lib/floorOperations.mjs';
import {loadGymFacts} from '../../../lib/gymLoadStore';
// pages/api/players/team-tonnage.js
// GET ?days=7 → tonnage per player per day for the last N days.
// Tonnage = sets × reps × weight per implement × number of implements.
// Returns { dates, players: [{ id, name, position, byDay: { date: kg } }] }

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { rosterKey, sessionKey } from '../../../lib/workspacePrefix';
import { exerciseTonnage, weightKgFromExercise } from '../../../lib/tonnage';

function windowDates(days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).end();

  const days = Math.min(parseInt(req.query.days || '7', 10), 14);
  const workspace = String(req.query.workspace || 'zarechie');
  const dates = windowDates(days);

  let roster;try{roster=await workspaceRoster(workspace);}catch{return res.status(503).json({error:'Состав ReadySix временно недоступен. Полнота команды не подтверждена; обновите экран.'});}
  const players=roster.players;
  if (!players.length) return res.status(200).json({ dates, players: [] });

  const facts=await loadGymFacts(workspace,players.flatMap(p=>dates.map(date=>({playerId:p.id,date}))));
  const playerRows = players.map((p, pi) => {
    const byDay = {},plannedByDay={},evidenceByDay={},executionByDay={},factFieldsByDay={};
    dates.forEach((d, di) => {
      const fact=facts[pi*dates.length+di],rec=fact?.record;
      const completion=rec?strengthSessionCompletion(rec,fact.rawActual,fact.rawLog):null;
      const saved=Date.parse(rec?.savedAt || rec?.generatedAt || '');
      const currentLog=fact?.rawLog && Date.parse(fact.rawLog.savedAt)>=saved && (!fact.rawActual || Date.parse(fact.rawLog.savedAt)>=Date.parse(fact.rawActual.savedAt))?fact.rawLog:null;
      const progress=sessionPlanFact(rec?.session,fact?.actual,currentLog);
      const review=rec?playerHistoryFacts(rec,fact.rawActual,fact.rawLog,fact.supplement):null;
      factFieldsByDay[d]=review?{completed:review.completed,missing:review.missing,rows:factTasks(review)}:null;
      executionByDay[d]=rec?{...completion,completedSets:progress.completedSets,totalSets:progress.plannedSets}:null;
      plannedByDay[d]=sessionPlanFact(rec?.session).plannedTonnage;
      byDay[d]=Number(fact?.actual?.actualTonnage) || 0;
      evidenceByDay[d]=fact?.actual?.loadEvidence || {source:fact?.actual?'recorded':rec?'missing':'no_session',partial:!!rec && !fact?.actual,supplementStatus:fact?.supplementStatus || 'none'};
    });
    return {
      id: p.id,
      name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
      position: p.position || '',
      byDay,plannedByDay,evidenceByDay,executionByDay,factFieldsByDay,
    };
  });

  return res.status(200).json({ dates, players: playerRows,loadBasis:'actual',rosterSource:roster.source,rosterRevision:roster.revision || null });
}
