import { getPlayerTimeZone } from '../../../lib/playerTimeZoneStore';
import { coachBannedSessionExercises, hasRestriction } from '../../../lib/exerciseRestrictions';
import { getRecentSessionRecords } from '../../../lib/sessionHistory';
import { buildExerciseVarietyContext } from '../../../lib/exerciseVariety.mjs';
import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { restrictionsKey, sessionKey } from '../../../lib/workspacePrefix';
import { getPlayerInfo } from '../../../lib/playerData';
import { assessSessionQuality } from '../../../lib/sessionValidator';
import { advisorySessionQuality } from '../../../lib/sessionQualityPolicy.mjs';
import { sanitizeUnavailableEquipmentExercises } from '../../../lib/equipmentRestrictions.mjs';
import { buildDosePrescription } from '../../../lib/sessionDose.mjs';
import { generatedDraftKey } from '../../../lib/generatedDraft.mjs';
import { programCopySession, validProgramWorkspace } from '../../../lib/programCopy.mjs';

const parse = raw => typeof raw === 'string' ? JSON.parse(raw) : raw;
const identityAliases = id => /^\d+$/.test(String(id).replace(/^whoop_/,'')) ? [...new Set([String(id), String(id).replace(/^whoop_/,''), `whoop_${String(id).replace(/^whoop_/,'')}`])] : [String(id)];
export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({error:'Unauthorized'});
  if (req.method !== 'POST') return res.status(405).end();
  const {fromPlayerId,toPlayerId,date,workspace='zarechie',targetWorkspace=workspace,targetDate=date,dryRun=false,sourceSession=null} = req.body || {};
  if (!validProgramWorkspace(workspace) || !validProgramWorkspace(targetWorkspace) || !fromPlayerId || !toPlayerId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate || '')) return res.status(400).json({error:'Выберите команды, игроков и даты.'});
  if (workspace===targetWorkspace && String(fromPlayerId).replace(/^whoop_/,'')===String(toPlayerId).replace(/^whoop_/,'') && date===targetDate) return res.status(400).json({error:'Выберите другого получателя или другую дату.'});
  try {
    const [sourceRecords,targetPlayer,restrictionRecords] = await Promise.all([
      Promise.all(identityAliases(fromPlayerId).map(id=>redis('get',sessionKey(workspace,id,date)))),
      getPlayerInfo(String(toPlayerId),targetWorkspace),
      Promise.all(identityAliases(toPlayerId).map(id=>redis('get',restrictionsKey(targetWorkspace,id)))),
    ]);
    const raw=sourceRecords.filter(Boolean).map(parse).sort((a,b)=>String(b.savedAt||'').localeCompare(String(a.savedAt||'')))[0];
    if (!raw) return res.status(404).json({error:'Сначала сохраните исходную программу на выбранную дату.'});
    if (!targetPlayer) return res.status(404).json({error:'Получатель не найден в выбранной команде.'});
    const source=parse(raw);
    if(sourceSession && JSON.stringify(sourceSession)!==JSON.stringify(source.session)) return res.status(409).json({error:'В исходной программе есть несохранённые изменения. Сохраните её перед копированием.'});
    const session=sanitizeUnavailableEquipmentExercises(programCopySession(source.session));
    const banned=coachBannedSessionExercises(source.session);
    if (banned.length) return res.status(409).json({error:'В исходной программе есть запрещённые тренером упражнения. Замените их перед копированием.',banned});
    const restrictions=restrictionRecords.flatMap(raw=>parse(raw)||[]);
    const violations=session.blocks.flatMap(b=>b.exercises).filter(e=>hasRestriction(e.name,restrictions)).map(e=>e.name);
    if (violations.length) return res.status(409).json({error:'Программа нарушает ограничения получателя. Нужна индивидуальная замена.',exercises:violations});
    let recent;
    try {recent=await getRecentSessionRecords(String(toPlayerId),source.focus==='inseason_strength'?42:12,targetWorkspace,targetDate,{strict:true});}
    catch {return res.status(503).json({error:'Не удалось проверить историю получателя. Повторите копирование позже.'});}
    const copyQuality=advisorySessionQuality(assessSessionQuality(session,{
      focus:source.focus||'',trainingType:source.trainingType||'',playerRestrictions:restrictions,
      varietyContext:buildExerciseVarietyContext(recent,{targetDate,focus:source.focus,trainingType:source.trainingType}),
      dosePrescription:buildDosePrescription({focus:source.focus,trainingType:source.trainingType}),
      medicalReviewRequired:true,medicalReviewReason:'Проверьте ReadySix и индивидуальную дозировку получателя перед назначением.',
    }));
    if (source.focus==='inseason_strength' && copyQuality.variety?.needsCorrection) return res.status(409).json({error:'У получателя уже были эти упражнения. Нужны замены перед копированием.',repeated:copyQuality.variety.repeated});
    const record={session,player:targetPlayer,date:targetDate,timeZone:await getPlayerTimeZone(String(toPlayerId),targetWorkspace),focus:source.focus||'',trainingType:source.trainingType||'',strengthMode:source.strengthMode||null,trainingLabel:'Копия программы · проверка тренером',quality:copyQuality,draft:true,generatedAt:new Date().toISOString(),copiedFromPlayerId:String(fromPlayerId),copiedFromWorkspace:workspace,copiedFromDate:date};
    if (dryRun === true) return res.status(200).json({ok:true,draft:true,preview:true,record});
    await redis('set',generatedDraftKey(targetWorkspace,String(toPlayerId),targetDate),JSON.stringify(record));
    return res.status(200).json({ok:true,draft:true,record});
  } catch {return res.status(503).json({error:'Не удалось скопировать программу. Повторите попытку.'});}
}
