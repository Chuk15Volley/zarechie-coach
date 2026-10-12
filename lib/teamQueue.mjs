export const TEAM_QUEUE_TTL = 7 * 86400;
export const validWorkspace = value => ['zarechie', 'nkperf'].includes(value);
export const validQueueId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export const queuePrefix = workspace => workspace === 'nkperf' ? 'nkperf' : 'coach';
export const teamQueueKey = (workspace, id) => `${queuePrefix(workspace)}:team-queue:${id}`;
export const teamQueueLatestKey = (workspace, date) => `${queuePrefix(workspace)}:team-queue-latest:${date}`;
export const generationJobTTL = record => record?.teamQueueId ? TEAM_QUEUE_TTL : 3600;
export function parseQueueJSON(raw) { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
const invalid = message => Object.assign(new Error(message),{status:400});
export function queueRequest(body) {
  if (!validWorkspace(body?.workspace) || !/^\d{4}-\d{2}-\d{2}$/.test(body?.date || '') || (!Number.isFinite(Date.parse(body.date)) || new Date(body.date).toISOString().slice(0,10)!==body.date)) throw invalid('Некорректное пространство или дата');
  const request = {workspace:body.workspace, date:body.date, manualMethodSelection:true, autoSave:false};
  for (const key of ['focus','trainingType','strengthMode','powerMode','coachRecovery']) if (body[key] != null) request[key] = String(body[key]).slice(0, 80);
  for (const key of ['dayGoal','notes']) if (body[key] != null) request[key] = String(body[key]).slice(0, 4000);
  request.days = Math.max(1, Math.min(28, Number(body.days) || 7));
  return request;
}
export function queuePlayers(players) {
  if (!Array.isArray(players) || !players.length || players.length > 50) throw invalid('Выберите от 1 до 50 игроков');
  const ids = new Set();
  return players.map(player => {
    const playerId = String(player?.id ?? player?.playerId ?? '');
    if (!/^[\w-]{1,100}$/.test(playerId) || ids.has(playerId)) throw invalid('Некорректный или повторяющийся игрок');
    ids.add(playerId);
    return {playerId, name:String(player.name || playerId).slice(0,120), position:String(player.position || '').slice(0,80)};
  });
}
export function reviewPreview(record) {
  if (!record?.session) return null;
  return {
    kind:record.session.kind, medicalHold:!!record.session.methodology?.medicalHold,
    valid:record.quality?.valid === true, blocking:!!record.quality?.blocking,
    warning:record.quality?.reviewMessage || record.quality?.medicalReviewReason || '',
    explanation:record.session.periodization_note || record.session.periodizationLogic || record.session.periodization || '',
    exercises:(record.session.blocks || []).flatMap(block => (block.exercises || []).map(exercise => ({
      code:exercise.code || '', name:exercise.name, sets:exercise.targetSets || [], weightKg:exercise.weightKg ?? null,
      weightNote:exercise.weightNote || '', autoReg:exercise.autoReg || '',
    }))),
  };
}
