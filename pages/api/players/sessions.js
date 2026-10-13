import {playerHistoryFacts} from '../../../lib/playerHistoryFacts.mjs';
import {validCoachDate} from '../../../lib/coachAuditQuery.mjs';
import {sessionPlanFact} from '../../../lib/floorOperations.mjs';
import {loadGymFacts,gymSessionDates} from '../../../lib/gymLoadStore';
// pages/api/players/sessions.js
// GET ?playerId&limit=20 — last N saved sessions with tonnage + exercise metadata.

import { isAuthorized } from '../../../lib/auth';
import { sessionTrainingLabel } from '../../../lib/sessionLabel';
import { exerciseTonnage, weightKgFromExercise } from '../../../lib/tonnage';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).end();

  const { playerId, limit = '20', workspace = 'zarechie',before } = req.query;
  res.setHeader('Cache-Control','private, no-store');
  if(typeof playerId!=='string' || !/^[\w-]{1,100}$/.test(playerId) || !['zarechie','nkperf'].includes(workspace) || before && (typeof before!=='string' || !validCoachDate(before)))return res.status(400).json({error:'Некорректный игрок, пространство или дата истории.'});

  const lim = Math.min(parseInt(limit, 10) || 20, 40);
  const allDates = await gymSessionDates(workspace,playerId);
  const eligible=(Array.isArray(allDates)?allDates:[]).filter(date=>!before || date<before);
  const dates=eligible.slice(-Math.max(1,lim)).reverse();
  const nextCursor=eligible.length>dates.length?dates.at(-1):null;

  if (!dates || !dates.length) return res.status(200).json({ sessions: [],nextCursor:null,total:allDates.length });

  const records=await loadGymFacts(workspace,dates.map(date=>({playerId,date})));

  const sessions = [];
  dates.forEach((date, i) => {
    const facts=records[i],raw=facts?.record;
    if (!raw) return;
    try {
      const rec = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const blocks = rec.session?.blocks || [];
      let tonnage = 0;
      const exercises = [];
      for (const block of blocks) {
        for (const ex of block.exercises || []) {
          const kg = weightKgFromExercise(ex);
          const sets = ex.targetSets || ex.sets || [];
          let totalReps = 0;
          for (const s of sets) {
            const m = String(s).match(/^(\d+)[x×](\d+)/i);
            if (m) { totalReps += parseInt(m[1]) * parseInt(m[2]); continue; }
            const n = parseInt(s); if (!isNaN(n)) totalReps += n;
          }
          if (kg > 0) tonnage += exerciseTonnage(ex, totalReps, kg);
          if (ex.name) exercises.push({ name: ex.name, kg, blockCode: block.code || '' });
        }
      }
      sessions.push({
        date,focus:rec.focus || rec.quality?.focus || '',trainingType:rec.trainingType || '',
        factReview:playerHistoryFacts(rec,facts.rawActual,facts.rawLog,facts.supplement),
        dayGoal: rec.dayGoal || '',
        trainingLabel: sessionTrainingLabel(rec),
        tonnage: Number(facts.actual?.actualTonnage) || 0,
        plannedTonnage:sessionPlanFact(rec.session).plannedTonnage,loadEvidence:facts.actual?.loadEvidence || {source:facts.actual?'recorded':'missing',partial:!facts.actual,supplementStatus:facts.supplementStatus || 'none'},
        exerciseCount: exercises.length,
        blockCount: blocks.length,
        exercises,
        assessment: rec.session?.assessment || '',
      });
    } catch (_) {}
  });

  return res.status(200).json({ sessions,nextCursor,total:allDates.length });
}
