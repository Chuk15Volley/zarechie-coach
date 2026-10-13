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

  // Load all players from roster.
  const rosterRaw = await redis('get', rosterKey(workspace)).catch(() => null);
  let players = [];
  if (rosterRaw) {
    try {
      const all = typeof rosterRaw === 'string' ? JSON.parse(rosterRaw) : rosterRaw;
      players = Array.isArray(all) ? all : [];
    } catch (_) {}
  }
  if (!players.length) return res.status(200).json({ dates, players: [] });

  const facts=await loadGymFacts(workspace,players.flatMap(p=>dates.map(date=>({playerId:p.id,date}))));
  const playerRows = players.map((p, pi) => {
    const byDay = {},plannedByDay={},evidenceByDay={};
    dates.forEach((d, di) => {
      const fact=facts[pi*dates.length+di],rec=fact?.record;
      plannedByDay[d]=sessionPlanFact(rec?.session).plannedTonnage;
      byDay[d]=Number(fact?.actual?.actualTonnage) || 0;
      evidenceByDay[d]=fact?.actual?.loadEvidence || {source:fact?.actual?'recorded':'missing',partial:!fact?.actual};
    });
    return {
      id: p.id,
      name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
      position: p.position || '',
      byDay,plannedByDay,evidenceByDay,
    };
  });

  return res.status(200).json({ dates, players: playerRows,loadBasis:'actual' });
}
