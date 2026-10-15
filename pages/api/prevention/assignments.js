import { isAuthorized, coachAuditActor } from '../../../lib/auth';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { preventionIdentity, listAssignments, loadAssignment, assignCourse, updateAssignment, publicAssignment, preventionSafety } from '../../../lib/prevention/store';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!await enforceRateLimit(req, res, { scope: 'prevention-coach', limit: 180, windowSeconds: 600 })) return;
  const input = req.method === 'GET' ? req.query : req.body || {};
  try {
    const identity = await preventionIdentity(input.workspace, input.playerId);
    if (req.method === 'GET') {
      if (input.assignmentId) return res.status(200).json({ assignment: publicAssignment((await loadAssignment(identity, input.assignmentId)).assignment) });
      const [assignments, safety] = await Promise.all([listAssignments(identity), preventionSafety(identity)]);
      return res.status(200).json({ assignments, safety });
    }
    if (!['assign', 'archive', 'refresh'].includes(input.action)) return res.status(400).json({ error: 'Выполнение отмечает игрок в своём разделе.' });
    const assignment = input.action === 'assign' ? await assignCourse(identity, input, coachAuditActor(req)) : await updateAssignment(identity, input, { coach: true });
    return res.status(200).json({ assignment: publicAssignment(assignment) });
  } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : 'Не удалось сохранить назначение. Обновите раздел и повторите попытку.' }); }
}
