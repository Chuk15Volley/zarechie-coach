import crypto from 'node:crypto';
function stable(value) {
  if(Array.isArray(value))return value.map(stable);
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>!['generatedAt','fetchedAt','capturedAt'].includes(key)).map(key=>[key,stable(value[key])]));
  return value;
}
// Store a digest, never another copy of the medical source or a new readiness score.
export function readySixPublicationCheck(snapshot, restrictions) {
  if(!snapshot?.readySixMeta || !snapshot.readySixDecision)return null;
  const fields=['targetDate','readySixDecision','readySixCalendar','readySixPlanning','morning','surveys','postMorningSurveys','injuryLog','annotations','manual','overtraq','overtraqHistory'];
  const context=Object.fromEntries(fields.map(key=>[key,snapshot[key] ?? null]));
  return crypto.createHash('sha256').update(JSON.stringify(stable({...context,restrictions:restrictions || []}))).digest('hex');
}
