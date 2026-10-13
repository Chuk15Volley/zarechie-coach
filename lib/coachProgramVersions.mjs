import {createHash} from 'node:crypto';
import {loadUnitsForExercise} from './tonnage.js';
export function coachProgramVersion(record){
  const identity={session:record.session,requestId:record.saveRequestId || null,restoredAt:record.restoredAt || null,focus:record.focus || '',trainingType:record.trainingType || '',strengthMode:record.strengthMode || null};
  const id=createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const exercises=(record.session.blocks || []).flatMap((block,bi)=>(block.exercises || []).map((ex,ei)=>({slot:bi+'-'+ei,block:block.label || '',code:ex.code || '',name:ex.name,loadUnits:loadUnitsForExercise(ex),sets:ex.targetSets || [],kg:ex.weightKg ?? null,rpe:ex.targetRpeMax ?? null,adapted:!!ex.symptomAdapted})));
  return {id,savedAt:record.savedAt || null,revision:record.saveRequestId || record.savedAt || null,restoredFrom:record.restoredFrom || null,exercises,decision:record.session.methodology?.coachCycleDecision?{cycleId:record.session.methodology.coachCycleDecision.cycleId,revision:record.session.methodology.coachCycleDecision.revision,entries:(record.session.methodology.coachCycleDecision.entries || []).map(({key,code,name,exercise,progression,volume,volumeReason,note})=>({key,code,name,exercise,progression,volume,volumeReason,note}))}:null};
}
export function compareCoachPrograms(before,after){
  const slots=[...new Set([...before.exercises,...after.exercises].map(ex=>ex.slot))];
  return {before:{id:before.id,savedAt:before.savedAt,revision:before.revision},after:{id:after.id,savedAt:after.savedAt,revision:after.revision},rows:slots.map(slot=>{
    const a=before.exercises.find(ex=>ex.slot===slot),b=after.exercises.find(ex=>ex.slot===slot),same=!!(a && b && a.name===b.name && a.loadUnits===b.loadUnits && a.code===b.code);
    return {slot,before:a || null,after:b || null,status:!a?'added':!b?'removed':!same?'replaced':JSON.stringify(a)===JSON.stringify(b)?'unchanged':'changed',kgDelta:same && a.kg!=null && b.kg!=null?Number(b.kg)-Number(a.kg):null};
  }),decisions:{before:before.decision,after:after.decision}};
}
