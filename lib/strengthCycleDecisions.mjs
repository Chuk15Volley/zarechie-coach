import {canonicalExerciseId} from './exerciseIdentity.mjs';
import {strengthExercises,STRENGTH_CYCLE_VERSION} from './strengthCycle.mjs';
export const DECISION_VERSION='strength-cycle-decision-v1';
export function validateCycleDecision(cycle, entries) {
  if(cycle?.status!=='completed' || !Array.isArray(entries) || entries.length>9) return null;
  const slots=new Set();
  const normalized=[];
  for(const entry of entries) {
    const row=cycle.exercises.find(row=>row.key===entry?.key);
    if(!row || !['keep','rotate'].includes(entry.exercise) || !['auto','hold'].includes(entry.progression) || typeof entry.note!=='string' || entry.note.length>300) return null;
    const slot=row.trainingType+':'+row.code;
    if(slots.has(slot))return null;
    slots.add(slot);
    normalized.push({key:row.key,trainingType:row.trainingType,code:row.code,name:row.name,loadUnits:row.loadUnits,exercise:entry.exercise,progression:entry.progression,note:entry.note.trim()});
  }
  return normalized;
}
export function previousCycleId(records,cycleId) {
  return [...new Set(records.filter(r=>(r.focus || r.quality?.focus)==='inseason_strength' && r.session?.methodology?.strengthCycle?.version===STRENGTH_CYCLE_VERSION && !r.session.methodology.medicalHold && r.date<cycleId).map(r=>r.session.methodology.strengthCycle.id).filter(id=>id<cycleId))].sort().at(-1) || null;
}
export function applyCycleDecision(cycle,records,decision) {
  const sourceId=previousCycleId(records,cycle.id);
  const completed=records.filter(r=>(r.focus || r.quality?.focus)==='inseason_strength' && r.date<cycle.id && r.session?.methodology?.strengthCycle?.version===STRENGTH_CYCLE_VERSION && r.session.methodology.strengthCycle.id===sourceId && !r.session.methodology.medicalHold && r.strengthCompletion?.completed && ['player_feedback','player_log'].includes(r.strengthCompletion.source));
  if(decision?.version!==DECISION_VERSION || decision.cycleId!==sourceId || new Set(completed.map(r=>r.date)).size<4 || !Array.isArray(decision.entries)) return cycle;
  const anchors={...cycle.anchors},avoid=new Set(cycle.avoid),seededCodes=[];
  const entries=decision.entries.filter(entry=>entry.trainingType===cycle.trainingType);
  for(const entry of entries) {
    const source=completed.flatMap(r=>strengthExercises(r.session)).find(ex=>ex.code===entry.code && ex.name===entry.name && !ex.symptomAdapted && (ex.loadUnits || 1)===entry.loadUnits);
    if(!source)continue;
    if(entry.exercise==='rotate')avoid.add(canonicalExerciseId(entry.name));
    if(entry.exercise==='keep' && !anchors[entry.code] && !avoid.has(canonicalExerciseId(entry.name))){anchors[entry.code]=source;seededCodes.push(entry.code);}
  }
  return {...cycle,anchors,avoid:[...avoid],decisionSeededCodes:seededCodes,coachDecision:{...decision,entries}};
}
// Compare and set protects a newer coach edit from a stale browser tab.
export const SAVE_DECISION_SCRIPT=`local old=redis.call('GET',KEYS[1]); if (old or '')~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1`;
