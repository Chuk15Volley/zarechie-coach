import { resolveShareToken } from '../../../lib/shareToken';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { preventionIdentity, listAssignments, loadAssignment, updateAssignment, publicAssignment, preventionSafety } from '../../../lib/prevention/store';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!await enforceRateLimit(req, res, { scope: 'prevention-player', limit: 360, windowSeconds: 600 })) return;
  const input = req.method === 'GET' ? req.query : req.body || {};
  if (typeof input.token !== 'string' || input.token.length > 160) return res.status(400).json({ error: 'Некорректная ссылка.' });
  try {
    const resolved = await resolveShareToken(input.token);
    if (!resolved?.playerId) return res.status(404).json({ error: 'Ссылка недействительна.' });
    const identity = await preventionIdentity(resolved.workspace, resolved.playerId, { rosterCheck: false });
    if (req.method === 'GET') {
      if (input.assignmentId) {
        const [{ assignment }, safety] = await Promise.all([loadAssignment(identity, input.assignmentId), preventionSafety(identity)]);
        return res.status(200).json({ assignment: publicAssignment(assignment), safety });
      }
      return res.status(200).json({ assignments: await listAssignments(identity) });
    }
    if (!['mark', 'complete'].includes(input.action)) return res.status(400).json({ error: 'Недопустимая операция.' });
    const assignment = await updateAssignment(identity, input);
    return res.status(200).json({ assignment: publicAssignment(assignment) });
  } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : 'Прогресс не сохранён. Проверьте соединение и повторите попытку.' }); }
}
