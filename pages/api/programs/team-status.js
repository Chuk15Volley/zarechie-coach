// pages/api/programs/team-status.js
// POST { playerIds, date } → gym session status for each player on that date.
// Returns: hasSession, savedAt, feedback (RPE/feel from player self-report).
// Auth: trainer API key. Does NOT duplicate HRV/recovery — that's in the main dashboard.

import { redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { feedbackKey, liveCommandsKey, pfx, sessionKey } from '../../../lib/workspacePrefix';
import { summarizePlayerWorkout } from '../../../lib/workoutProgress.mjs';
import { parseSavedSession, sessionTrainingLabel } from '../../../lib/sessionLabel';
import { sessionPlanFact } from '../../../lib/floorOperations.mjs';

function parseCommands(raw) {
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw.filter((_, index) => index % 2 === 1) : Object.values(raw);
  return values.map(value => {
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch (_) { return null; }
  }).filter(command => command?.status === 'pending').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { playerIds, date, workspace = 'zarechie' } = req.body || {};
  if (!Array.isArray(playerIds) || !date) return res.status(400).json({ error: 'playerIds and date required' });

  const status = {};
  const results = await redisPipeline(playerIds.flatMap(id => {
    const sid = String(id);
    return [
      ['GET', sessionKey(workspace, sid, date)],
      ['GET', feedbackKey(workspace, sid, date)],
      ['GET', `${pfx(workspace)}:log:${sid}:${date}`],
      ['GET', `${pfx(workspace)}:session:actual:${sid}:${date}`],
      ['HGETALL', liveCommandsKey(workspace, sid, date)],
    ];
  })).catch(() => []);
  playerIds.forEach((id, index) => {
    const sid = String(id);
    const offset = index * 5;
    const [rawSession, rawFeedback, rawLog, rawActual, rawCommands] = results.slice(offset, offset + 5);

    let hasSession = false;
    let savedAt = null;
    let session = null;
    let trainingLabel = '';
    if (rawSession) {
      try {
        const rec = typeof rawSession === 'string' ? JSON.parse(rawSession) : rawSession;
        hasSession = true;
        savedAt = rec.savedAt || null;
        session = parseSavedSession(rec).session;
        trainingLabel = sessionTrainingLabel(rec);
      } catch (_) {}
    }

    let feedback = null;
    if (rawFeedback) {
      try {
        feedback = typeof rawFeedback === 'string' ? JSON.parse(rawFeedback) : rawFeedback;
      } catch (_) {}
    }

    let log = null;
    if (rawLog) {
      try { log = typeof rawLog === 'string' ? JSON.parse(rawLog) : rawLog; } catch (_) {}
    }
    let actual = null;
    if (rawActual) {
      try { actual = typeof rawActual === 'string' ? JSON.parse(rawActual) : rawActual; } catch (_) {}
    }
    status[id] = {
      hasSession,
      savedAt,
      feedback,
      trainingLabel,
      live: hasSession ? summarizePlayerWorkout(session, log || {}, feedback) : null,
      planFact: hasSession ? sessionPlanFact(session, actual, log) : null,
      pendingCommands: parseCommands(rawCommands),
    };
  });

  return res.status(200).json({ status });
}
