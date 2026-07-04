// pages/api/programs/save-actual.js
// POST { playerId, date, workspace='zarechie', exercises: [{name, plannedKg, actualKg, actualRpe, completed}] }
// Persists the "actual" (as-performed) side of a session for Plan vs Actual comparison.
// Computes compliance (% of loaded exercises hit at >=80% of planned kg) and actual tonnage.

import { redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { pfx } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { playerId, date, workspace = 'zarechie', exercises = [] } = req.body || {};
  if (!playerId || !date) {
    return res.status(400).json({ error: 'playerId and date are required' });
  }

  // Compliance: among exercises with plannedKg > 0, share that were completed
  // and reached at least 80% of planned weight.
  let planned = 0;
  let hit = 0;
  // Actual tonnage = Σ(actualKg × sets × reps), sets/reps default 3/8.
  let actualTonnage = 0;

  for (const ex of exercises) {
    const plannedKg = parseFloat(ex.plannedKg) || 0;
    const actualKg = parseFloat(ex.actualKg) || 0;
    const sets = parseInt(ex.sets, 10) || 3;
    const reps = parseInt(ex.reps, 10) || 8;

    if (actualKg > 0) actualTonnage += actualKg * sets * reps;

    if (plannedKg > 0) {
      planned += 1;
      if (ex.completed && actualKg >= plannedKg * 0.8) hit += 1;
    }
  }

  const compliance = planned > 0 ? Math.round((hit / planned) * 100) : 0;
  actualTonnage = Math.round(actualTonnage);

  const record = {
    exercises,
    compliance,
    actualTonnage,
    savedAt: new Date().toISOString(),
  };

  const p = pfx(workspace);
  const cmds = [
    ['SET', `${p}:session:actual:${playerId}:${date}`, JSON.stringify(record)],
  ];
  if (actualTonnage > 0) {
    cmds.push(['SET', `${p}:gym_tonnage_actual:${playerId}:${date}`, String(actualTonnage)]);
  }

  try {
    await redisPipeline(cmds);
    return res.status(200).json({ ok: true, compliance, actualTonnage });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
