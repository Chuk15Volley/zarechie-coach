// pages/api/programs/team-status.js
// POST { playerIds, date } → gym session status for each player on that date.
// Returns: hasSession, savedAt, feedback (RPE/feel from player self-report).
// Auth: trainer API key. Does NOT duplicate HRV/recovery — that's in the main dashboard.

import { redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { developmentPlanKey, feedbackKey, injuryLogKey, liveCommandsKey, pfx, restrictionsKey, returnToPlayKey, sessionKey } from '../../../lib/workspacePrefix';
import { summarizePlayerWorkout } from '../../../lib/workoutProgress.mjs';
import { parseSavedSession, sessionTrainingLabel } from '../../../lib/sessionLabel';
import { sessionPlanFact } from '../../../lib/floorOperations.mjs';
import { evaluateReturnToPlay, recommendNextLoad } from '../../../lib/todayDecisionCenter.mjs';

function parseCommands(raw) {
  if (!raw) return [];
  const values = Array.isArray(raw) ? raw.filter((_, index) => index % 2 === 1) : Object.values(raw);
  return values.map(value => {
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch (_) { return null; }
  }).filter(command => command?.status === 'pending').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function parseJSON(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return fallback; }
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { playerIds, date, workspace = 'zarechie', readinessPlayers = [] } = req.body || {};
  if (!Array.isArray(playerIds) || !date) return res.status(400).json({ error: 'playerIds and date required' });
  if (playerIds.length > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: 'Invalid request' });

  const readinessById = new Map((Array.isArray(readinessPlayers) ? readinessPlayers : []).map(player => [String(player.id), player]));

  const status = {};
  const results = await redisPipeline(playerIds.flatMap(id => {
    const sid = String(id);
    return [
      ['GET', sessionKey(workspace, sid, date)],
      ['GET', feedbackKey(workspace, sid, date)],
      ['GET', `${pfx(workspace)}:log:${sid}:${date}`],
      ['GET', `${pfx(workspace)}:session:actual:${sid}:${date}`],
      ['HGETALL', liveCommandsKey(workspace, sid, date)],
      ['GET', restrictionsKey(workspace, sid)],
      ['GET', developmentPlanKey(workspace, sid)],
      ['GET', returnToPlayKey(workspace, sid)],
      ['GET', workspace === 'nkperf' ? injuryLogKey(workspace, sid) : `injury:log:${sid}`],
      ['GET', workspace === 'nkperf' ? injuryLogKey(workspace, `whoop_${sid.replace(/^whoop_/, '')}`) : `injury:log:whoop_${sid.replace(/^whoop_/, '')}`],
    ];
  })).catch(() => []);
  playerIds.forEach((id, index) => {
    const sid = String(id);
    const offset = index * 10;
    const [rawSession, rawFeedback, rawLog, rawActual, rawCommands, rawRestrictions, rawDevelopmentPlan, rawReturnToPlay, rawInjuryLog, rawAlternateInjuryLog] = results.slice(offset, offset + 10);

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
    const restrictions = parseJSON(rawRestrictions, []);
    const developmentPlan = parseJSON(rawDevelopmentPlan);
    const returnToPlay = evaluateReturnToPlay(parseJSON(rawReturnToPlay, {}), date);
    const injuryLog = parseJSON(rawInjuryLog, null) || parseJSON(rawAlternateInjuryLog, []) || [];
    const activeInjuries = (Array.isArray(injuryLog) ? injuryLog : []).filter(item => item?.status === 'active' || item?.status === 'monitoring').slice(0, 6);
    const playerStatus = {
      hasSession,
      savedAt,
      feedback,
      trainingLabel,
      live: hasSession ? summarizePlayerWorkout(session, log || {}, feedback) : null,
      planFact: hasSession ? sessionPlanFact(session, actual, log) : null,
      pendingCommands: parseCommands(rawCommands),
      restrictions: Array.isArray(restrictions) ? restrictions : [],
      developmentPlan: developmentPlan ? {
        cycleStart: developmentPlan.cycleStart || null,
        reviewDate: developmentPlan.reviewDate || null,
        goalCount: Array.isArray(developmentPlan.goals) ? developmentPlan.goals.length : 0,
        review: { due: Boolean(developmentPlan.reviewDate && date >= developmentPlan.reviewDate), coachDecisionRequired: developmentPlan.reviewDecision === 'pending' },
      } : null,
      returnToPlay,
      activeInjuries,
    };
    playerStatus.adaptation = recommendNextLoad({
      readiness: readinessById.get(sid) || {},
      status: playerStatus,
      restrictions: playerStatus.restrictions,
      developmentPlan: playerStatus.developmentPlan,
      returnToPlay,
      activeInjuries,
    });
    status[id] = playerStatus;
  });

  return res.status(200).json({ status });
}
