import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { restrictionsKey, rosterKey, sessionKey, sessionsKey } from '../../../lib/workspacePrefix';
import { assessSessionQuality } from '../../../lib/sessionValidator';
import { advisorySessionQuality } from '../../../lib/sessionQualityPolicy.mjs';
import { sanitizeUnavailableEquipmentExercises } from '../../../lib/equipmentRestrictions.mjs';
import { buildDosePrescription } from '../../../lib/sessionDose.mjs';

function parseJSON(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { fromPlayerId, toPlayerId, date, workspace = 'zarechie' } = req.body || {};
  if (!fromPlayerId || !toPlayerId || !date) return res.status(400).json({ error: 'Missing params' });

  const raw = await redis('get', sessionKey(workspace, fromPlayerId, date)).catch(() => null);
  if (!raw) return res.status(404).json({ error: 'Source session not found' });

  let record;
  try { record = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) {
    return res.status(500).json({ error: 'Parse error' });
  }

  // Look up target player info so the copy has correct player metadata
  const [rawWhoop, rawRoster, rawWorkspaceRoster, rawRestrictions] = await Promise.all([
    redis('get', `whoop:player:${toPlayerId}`).catch(() => null),
    redis('get', `roster:player:${toPlayerId}`).catch(() => null),
    redis('get', rosterKey(workspace)).catch(() => null),
    redis('get', restrictionsKey(workspace, toPlayerId)).catch(() => null),
  ]);
  const rawPlayer = rawWhoop || rawRoster;
  let targetPlayer = null;
  if (rawPlayer) {
    try {
      const p = typeof rawPlayer === 'string' ? JSON.parse(rawPlayer) : rawPlayer;
      targetPlayer = {
        id: toPlayerId,
        name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        position: p.position || '',
      };
    } catch (_) {}
  }
  if (!targetPlayer && rawWorkspaceRoster) {
    try {
      const roster = typeof rawWorkspaceRoster === 'string' ? JSON.parse(rawWorkspaceRoster) : rawWorkspaceRoster;
      const p = Array.isArray(roster) ? roster.find(item => String(item.id) === String(toPlayerId)) : null;
      if (p) {
        targetPlayer = {
          id: toPlayerId,
          name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
          position: p.position || '',
        };
      }
    } catch (_) {}
  }

  const newRecord = {
    ...record,
    session: sanitizeUnavailableEquipmentExercises(record.session),
    player: targetPlayer || record.player,
    savedAt: new Date().toISOString(),
  };
  const restrictions = parseJSON(rawRestrictions);
  const copyQuality = advisorySessionQuality(assessSessionQuality(newRecord.session, {
    focus: newRecord.focus || '',
    trainingType: newRecord.trainingType || '',
    playerRestrictions: Array.isArray(restrictions) ? restrictions : [],
    dosePrescription: newRecord.quality?.dose?.prescription || buildDosePrescription({ focus: newRecord.focus, trainingType: newRecord.trainingType }),
    seasonDecision: newRecord.quality?.seasonDecision || null,
  }));
  if (copyQuality.blocking) {
    return res.status(422).json({ error: copyQuality.reviewMessage, quality: copyQuality });
  }
  newRecord.quality = copyQuality;
  newRecord.copiedFromPlayerId = String(fromPlayerId);

  const dateScore = parseInt(date.replace(/-/g, ''), 10);
  await Promise.all([
    redis('set', sessionKey(workspace, toPlayerId, date), JSON.stringify(newRecord)),
    redis('zadd', sessionsKey(workspace, toPlayerId), dateScore, date),
  ]);

  res.status(200).json({ ok: true });
}
