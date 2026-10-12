import {applyCycleDecision,previousCycleId} from '../../../lib/strengthCycleDecisions.mjs';
import {recordCoachReplacements} from '../../../lib/strengthCycle.mjs';
import {validCopyRepeatException, sessionPlayerAliases} from '../../../lib/manualCopyRepeat.mjs';
import {getPlayerTimeZone} from '../../../lib/playerTimeZoneStore';
import { coachBannedSessionExercises } from '../../../lib/exerciseRestrictions';
import { reconcileReplacementDescriptions } from '../../../lib/exerciseReplacement.mjs';
import { getRecentSessionRecords } from '../../../lib/sessionHistory';
import { buildExerciseVarietyContext } from '../../../lib/exerciseVariety.mjs';
import { approveProgramSession, approvedProgramLabel } from '../../../lib/programApproval.mjs';
// pages/api/programs/save.js
// POST { playerId, date, session, player, dataSummary, dayGoal } → persists a session.
// Also maintains a sorted set coach:sessions:{playerId} (score = YYYYMMDD integer) so
// getRecentSessionSummaries() can fetch the N most recent dates in one ZRANGE call.
// Writes per-exercise weight records (coach:exweight:{playerId}:{normName}) for progression.
// Writes per-exercise weight history (coach:exhist:{playerId}:{normName}) HASH field=date value=kg.

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { normExName } from '../players/progression';
import { pfx, sessionKey, sessionsKey, exweightKey, exhistKey, gymTonnageKey, gymTonnageDatesKey } from '../../../lib/workspacePrefix';
import { loadUnitsForExercise, weightKgFromExercise } from '../../../lib/tonnage';
import { assessSessionQuality } from '../../../lib/sessionValidator';
import { advisorySessionQuality } from '../../../lib/sessionQualityPolicy.mjs';
import { sanitizeUnavailableEquipmentExercises } from '../../../lib/equipmentRestrictions.mjs';
import { buildDosePrescription } from '../../../lib/sessionDose.mjs';
import { normalizeSessionTempoDescriptions } from '../../../lib/tempoDescription.mjs';
import { ensureSessionExerciseIds, exerciseId } from '../../../lib/exerciseIdentity.mjs';

function formatKg(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function targetSetReps(value) {
  const multiple = String(value || '').match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (multiple) return parseInt(multiple[1], 10) * parseInt(multiple[2], 10);
  return parseInt(value, 10) || 0;
}

function normalizeSavedWeights(session) {
  if (!session?.blocks) return session;
  return {
    ...session,
    blocks: session.blocks.map(block => ({
      ...block,
      exercises: (block.exercises || []).map(ex => {
        const kg = formatKg(weightKgFromExercise(ex));
        const normalized = { ...ex, ...(kg ? { weightKg: parseFloat(kg) } : {}), loadUnits: loadUnitsForExercise(ex) };
        if (!kg || String(ex.weightNote || '').trim()) return normalized;
        return { ...normalized, weightNote: `${kg} кг` };
      }),
    })),
  };
}

export default async function handler(req,res){return saveProgram(req,res);}
export async function saveProgram(req, res, publicationGuard=null) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { playerId, date, session, player, dataSummary, dayGoal, focus = '', trainingType = '', trainingLabel = '', strengthMode = null, quality = null, saveRequestId = '', workspace = 'zarechie' } = req.body || {};
  if (!playerId || !date || !session) {
    return res.status(400).json({ error: 'playerId, date and session are required' });
  }

  try {
  const banned = coachBannedSessionExercises(session);
  if (banned.length) return res.status(409).json({error:'В программе есть упражнения, запрещённые тренером. Замените их перед сохранением.', banned});
  const previousRaw = await redis('get', sessionKey(workspace, playerId, date));
  const previousRecord = typeof previousRaw === 'string' ? JSON.parse(previousRaw) : previousRaw;
  const requestId = /^[a-zA-Z0-9-]{16,80}$/.test(saveRequestId) ? saveRequestId : '';
  if (requestId && previousRecord?.saveRequestId === requestId) return res.status(200).json({status:'ok',session:previousRecord.session,quality:previousRecord.quality,trainingLabel:previousRecord.trainingLabel,approval:previousRecord.approval,savedAt:previousRecord.savedAt});
  let recentSessions;
  try {
    recentSessions = await getRecentSessionRecords(String(playerId), focus === 'inseason_strength' ? 42 : 12, workspace, date, { strict: true, includeCycleHistory: focus === 'inseason_strength' });
  } catch {
    return res.status(503).json({ error: 'Не удалось проверить предыдущую тренировку. Повторите сохранение после восстановления истории.' });
  }
  const describedSession = recordCoachReplacements(reconcileReplacementDescriptions(session, previousRecord?.session || previousRecord), previousRecord?.session || previousRecord, date);
  const timeZone = await getPlayerTimeZone(String(playerId),workspace);
  const savedAt = new Date().toISOString();
  const normalizedSession = approveProgramSession(normalizeSessionTempoDescriptions(
    ensureSessionExerciseIds(sanitizeUnavailableEquipmentExercises(normalizeSavedWeights(describedSession)))
  ), savedAt);
  const varietyContext=buildExerciseVarietyContext(recentSessions,{targetDate:date,focus,trainingType,seasonDecision:quality?.seasonDecision});
  if(varietyContext.strengthCycle) {
    const sourceCycleId=previousCycleId(recentSessions,varietyContext.strengthCycle.id);
    const rawDecision=sourceCycleId?await redis('get',`${pfx(workspace)}:strength:cycle-decision:${String(playerId)}:${sourceCycleId}`):null;
    const decision=typeof rawDecision==='string'?JSON.parse(rawDecision):rawDecision;
    varietyContext.strengthCycle=applyCycleDecision(varietyContext.strengthCycle,recentSessions,decision);
  }
  const saveQuality = advisorySessionQuality(assessSessionQuality(normalizedSession, {
    focus,
    trainingType,
    varietyContext,
    dosePrescription: quality?.dose?.prescription || buildDosePrescription({ focus, trainingType }),
    seasonDecision: quality?.seasonDecision || null,
    medicalReviewRequired: session.kind === 'prehab_training_draft' && (session.methodology?.mode === 'regional' || session.methodology?.preliminary === true),
    medicalReviewReason: session.kind === 'prehab_training_draft' ? String(quality?.medicalReviewReason || 'Проверить ограничения и допуск перед выполнением.') : '',
  }));
  const repeatException=validCopyRepeatException(normalizedSession,{workspace,playerId,date});
  if (repeatException) saveQuality.copyRepeatException=normalizedSession.copyRepeatException;
  if (focus === 'inseason_strength' && saveQuality.variety?.needsCorrection && !repeatException) {
    return res.status(409).json({ error: 'Силовая содержит упражнения из предыдущих программ. Замените повторы перед сохранением.', repeated: saveQuality.variety.repeated });
  }
  const persistenceQuality = saveQuality.blocking
    ? {
        ...saveQuality,
        coachOverrideApplied: true,
        coachOverrideAt: savedAt,
      }
    : saveQuality;

  const record = {
    session: normalizedSession,
    timeZone,
    player: player || null,
    dataSummary: dataSummary || '',
    dayGoal: dayGoal || '',
    focus: focus || '',
    trainingType: trainingType || '',
    trainingLabel: approvedProgramLabel(trainingLabel),
    approval: normalizedSession.approval,
    strengthMode: strengthMode || quality?.dose?.prescription?.strengthContext?.selectedMode || null,
    quality: persistenceQuality,
    date,
    savedAt,
    ...(publicationGuard?.receipt?{publicationReceipt:publicationGuard.receipt}:{}),
    ...(requestId ? {saveRequestId:requestId} : {}),
  };

  // Score is the date as a plain integer (20260618) — sorts chronologically.
  const dateScore = parseInt(date.replace(/-/g, ''), 10);

  // Collect per-exercise weight records and history entries to write in one pipeline.
  const exweightCmds = [];
  for (const block of normalizedSession.blocks || []) {
    for (const ex of block.exercises || []) {
      const kg = weightKgFromExercise(ex);
      if (!kg || kg <= 0 || !ex.name) continue;
      const norm = exerciseId(ex) || normExName(ex.name);
      exweightCmds.push(['HSET', exweightKey(workspace, playerId, norm), 'kg', String(kg), 'date', date, 'loadUnits', String(loadUnitsForExercise(ex))]);
      exweightCmds.push(['HSET', exhistKey(workspace, playerId, norm), date, String(kg)]);
    }
  }

  // Weight is per implement; loadUnits is one or two DB/KB.
  let totalTonnage = 0;
  for (const block of normalizedSession.blocks || []) {
    for (const ex of block.exercises || []) {
      const kg = weightKgFromExercise(ex);
      const targetSets = Array.isArray(ex.targetSets) ? ex.targetSets : [];
      const totalReps = targetSets.length
        ? targetSets.reduce((total, set) => total + targetSetReps(set), 0)
        : (parseInt(ex.sets, 10) || 3) * (parseInt(ex.reps, 10) || 8);
      if (kg > 0) totalTonnage += kg * loadUnitsForExercise(ex) * totalReps;
    }
  }
  const tonnageCmds = [];
  if (totalTonnage > 0) {
    tonnageCmds.push(['SET', gymTonnageKey(workspace, playerId, date), String(Math.round(totalTonnage))]);
    tonnageCmds.push(['ZADD', gymTonnageDatesKey(workspace, playerId), dateScore, date]);
  }

  try {
    const versionEntry = JSON.stringify({ ...record, savedAt: new Date().toISOString() });
    // Keep legacy player links and the ReadySix coach id on the same saved edition.
    const cmds = [
      ...sessionPlayerAliases(playerId).flatMap(id => [
        ['SET', sessionKey(workspace, id, date), JSON.stringify(record)],
        ['ZADD', sessionsKey(workspace, id), dateScore, date],
        ['LPUSH', `${sessionKey(workspace, id, date)}:versions`, versionEntry],
        ['LTRIM', `${sessionKey(workspace, id, date)}:versions`, '0', '9'],
      ]),
      ...exweightCmds,
      ...tonnageCmds,
    ];
    if(publicationGuard){
      if(publicationGuard.receipt)cmds.push(['HSET',publicationGuard.key+':publication',String(playerId),JSON.stringify(publicationGuard.receipt)],['EXPIRE',publicationGuard.key+':publication',604800]);
      // CAS all writes against the reviewed job and absence of an independently saved edition.
      const script="if redis.call('GET',KEYS[1]) or redis.call('GET',KEYS[4])~=ARGV[4] then return 0 end; for i=5,#KEYS do if redis.call('EXISTS',KEYS[i])==1 then return 0 end end; if redis.call('HGET',KEYS[2],ARGV[1])~=ARGV[2] then return 0 end; local current=redis.call('HGET',KEYS[3],ARGV[1]); if current and current~=ARGV[2] then return 0 end; local cmds=cjson.decode(ARGV[3]); for _,cmd in ipairs(cmds) do redis.call(unpack(cmd)) end; return 1";
      const [written]=await redisPipeline([['EVAL',script,4+sessionPlayerAliases(playerId).filter(id=>String(id)!==String(playerId)).length,sessionKey(workspace,playerId,date),publicationGuard.key+':reviews',publicationGuard.key+':jobs',publicationGuard.lock,...sessionPlayerAliases(playerId).filter(id=>String(id)!==String(playerId)).map(id=>sessionKey(workspace,id,date)),String(playerId),publicationGuard.batchId,JSON.stringify(cmds),publicationGuard.token]]);
      if(Number(written)!==1)return res.status(409).json({error:'Программа или проверка изменились. Откройте игрока и проверьте актуальную версию.'});
    }else await redisPipeline(cmds);
    return res.status(200).json({ status: 'ok', quality: persistenceQuality, session: normalizedSession, trainingLabel: record.trainingLabel, approval: record.approval, savedAt });
  } catch (e) {
    return res.status(503).json({ error: 'Не удалось подтвердить сохранение. Правки остаются на экране; повторите сохранение.' });
  }
  } catch {
    return res.status(503).json({error:'Хранилище временно недоступно. Правки остаются на экране; повторите сохранение.'});
  }
}
