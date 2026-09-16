import { redis } from '../../../lib/redis';
import { resolveShareToken } from '../../../lib/shareToken';
import { parseSavedSession, sessionDayGoal, sessionTrainingLabel } from '../../../lib/sessionLabel';
import { sessionKey, pfx, feedbackKey } from '../../../lib/workspacePrefix';
import { sanitizeUnavailableEquipmentExercises } from '../../../lib/equipmentRestrictions.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  const { token, date } = req.query;
  if (!token || !date) return res.status(400).json({ error: 'Missing params' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date' });

  const resolved = await resolveShareToken(token);
  if (!resolved?.playerId) return res.status(404).json({ error: 'Invalid token' });
  const { playerId, workspace } = resolved;

  const raw = await redis('get', sessionKey(workspace, playerId, date)).catch(() => null);
  if (!raw) return res.status(404).json({ error: 'Not found' });

  const parsed = parseSavedSession(raw);
  if (!parsed.session) return res.status(500).json({ error: 'Parse error' });

  const [logRaw, feedbackRaw, actualRaw] = await Promise.all([
    redis('get', `${pfx(workspace)}:log:${playerId}:${date}`),
    redis('get', feedbackKey(workspace, playerId, date)),
    redis('get', `${pfx(workspace)}:session:actual:${playerId}:${date}`),
  ]);
  const parse = raw => { try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return null; } };
  const log = parse(logRaw);
  res.status(200).json({
    log: log ? { done: log.done, weights: log.weights, completedAt: log.completedAt, elapsedSeconds: log.elapsedSeconds, finishReason: log.finishReason } : null,
    feedback: parse(feedbackRaw),
    actual: parse(actualRaw),
    session: sanitizeUnavailableEquipmentExercises(parsed.session),
    label: sessionTrainingLabel(parsed.record),
    dayGoal: sessionDayGoal(parsed.record),
  });
}
