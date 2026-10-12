import {createHash, createHmac} from 'node:crypto';
const identity = id => String(id).replace(/^whoop_/,'');
const digest = session => createHash('sha256').update(JSON.stringify((session?.blocks||[]).flatMap(b=>(b.exercises||[]).map(e=>[e.code||'',e.name||''])))).digest('hex');
const sign = (value, secret) => createHmac('sha256',secret).update(JSON.stringify(value)).digest('hex');
export function createCopyRepeatException(session, {workspace,playerId,date,sourceWorkspace,sourcePlayerId,sourceDate}, secret=process.env.SESSION_SECRET) {
  if (!secret) throw new Error('Missing server signing key');
  const value={kind:'explicit_coach_copy',workspace,playerId:identity(playerId),date,sourceWorkspace,sourcePlayerId:String(sourcePlayerId),sourceDate,exercisesDigest:digest(session),approvedAt:new Date().toISOString()};
  return {...value,signature:sign(value,secret)};
}
export function validCopyRepeatException(session,{workspace,playerId,date},secret=process.env.SESSION_SECRET) {
  const exception=session?.copyRepeatException;
  if(!exception || !secret) return false;
  const {signature,...value}=exception;
  return value.kind==='explicit_coach_copy' && value.workspace===workspace && value.playerId===identity(playerId) && value.date===date && value.exercisesDigest===digest(session) && signature===sign(value,secret);
}
export function sessionPlayerAliases(playerId) {
  const id=identity(playerId);
  return /^\d+$/.test(id)?[id,`whoop_${id}`]:[String(playerId)];
}
