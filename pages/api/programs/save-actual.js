// pages/api/programs/save-actual.js
// POST { playerId, date, workspace='zarechie', exercises: [{name, plannedKg, actualKg, actualRpe, completed}] }
// Persists the "actual" (as-performed) side of a session for Plan vs Actual comparison.
// Computes compliance (% of loaded exercises hit at >=80% of planned kg) and actual tonnage.

import { redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { normExName } from '../players/progression';
import { pfx, exweightKey, exhistKey, gymTonnageKey, gymTonnageDatesKey } from '../../../lib/workspacePrefix';
import { loadUnitsForExercise } from '../../../lib/tonnage';

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { playerId, date, workspace = 'zarechie', exercises = [], blockFeedback = {} } = req.body || {};
  if (!playerId || !date) {
    return res.status(400).json({ error: 'playerId and date are required' });
  }

  // Compliance: among exercises with plannedKg > 0, share that were completed
  // and reached at least 80% of planned weight.
  let planned = 0;
  let hit = 0;
  // actualKg is per implement; loadUnits accounts for a DB/KB pair.
  let actualTonnage = 0;

  for (const ex of exercises) {
    const plannedKg = parseFloat(ex.plannedKg) || 0;
    const actualKg = parseFloat(ex.actualKg) || 0;
    const totalReps = parseInt(ex.totalReps, 10) || (parseInt(ex.sets, 10) || 3) * (parseInt(ex.reps, 10) || 8);

    if (actualKg > 0) actualTonnage += actualKg * loadUnitsForExercise(ex) * totalReps;

    if (plannedKg > 0) {
      planned += 1;
      if (ex.completed && actualKg >= plannedKg * 0.8) hit += 1;
    }
  }

  const compliance = planned > 0 ? Math.round((hit / planned) * 100) : 0;
  actualTonnage = Math.round(actualTonnage);

  const record = {
    exercises,
    blockFeedback,
    compliance,
    actualTonnage,
    savedAt: new Date().toISOString(),
  };

  const p = pfx(workspace);
  const cmds = [
    ['SET', `${p}:session:actual:${playerId}:${date}`, JSON.stringify(record)],
  ];
  for (const ex of exercises) {
    const actualKg = parseFloat(ex.actualKg) || 0;
    if (!actualKg || !ex.name) continue;
    const norm = normExName(ex.name);
    const block = ex.block || '';
    const blockFb = block ? blockFeedback[block] || {} : {};
    const rpe = ex.actualRpe != null && ex.actualRpe !== '' ? String(ex.actualRpe) : '';
    const pain = ex.pain || blockFb.pain ? '1' : '0';
    const blockRpe = blockFb.rpe != null && blockFb.rpe !== '' ? String(blockFb.rpe) : '';
    cmds.push([
      'HSET',
      exweightKey(workspace, playerId, norm),
      'kg', String(actualKg),
      'date', date,
      'loadUnits', String(loadUnitsForExercise(ex)),
      'rpe', rpe,
      'pain', pain,
      'block', block,
      'blockRpe', blockRpe,
      'source', 'actual',
    ]);
    cmds.push(['HSET', exhistKey(workspace, playerId, norm), date, String(actualKg)]);
  }
  if (actualTonnage > 0) {
    cmds.push(['SET', `${p}:gym_tonnage_actual:${playerId}:${date}`, String(actualTonnage)]);
    cmds.push(['SET', gymTonnageKey(workspace, playerId, date), String(actualTonnage)]);
    cmds.push(['ZADD', gymTonnageDatesKey(workspace, playerId), parseInt(String(date).replace(/-/g, ''), 10), date]);
  }

  try {
    await redisPipeline(cmds);
    return res.status(200).json({ ok: true, compliance, actualTonnage });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
