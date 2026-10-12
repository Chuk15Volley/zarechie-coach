const round=value=>Math.round(value*100)/100;
const uniform=values=>values.length && values.every(value=>value!=null && value===values[0])?values[0]:null;
function endpoint(row) {
  const observation=row?.observations?.at(-1);
  if(!observation)return null;
  const sets=observation.sets || [];
  const full=sets.length>0 && sets.every(set=>set.completed);
  const perSide=uniform(sets.map(set=>set.perSide));
  return {...observation,setCount:sets.length,kg:full?uniform(sets.map(set=>set.kg)):null,
    reps:full?uniform(sets.map(set=>set.reps)):null,perSide,full};
}
function decisions(row,previousId) {
  return (row?.observations || []).filter(point=>point.coachDecision?.cycleId===previousId).map(point=>({date:point.date,...point.coachDecision}));
}
function context(cycle) {
  return {adaptedSessions:cycle.adaptedSessions,exposures:cycle.context.filter(item=>cycle.completionDates.includes(item.date))};
}
// Adjacent means exactly the previous stored cycle, never the nearest convenient
// completed cycle. Values describe last actual exposures, not estimated strength.
export function compareStrengthCycles(current,previous) {
  if(!previous)return {status:'no_previous',rows:[]};
  if(current.status!=='completed' || previous.status!=='completed')return {status:'awaiting_completion',previousId:previous.id,previousCompleted:previous.completedCount,currentCompleted:current.completedCount,rows:[]};
  if(previous.endDate>=current.completionDates[0])return {status:'overlapping_cycles',previousId:previous.id,rows:[]};
  const keys=[...new Set([...current.exercises,...previous.exercises].map(row=>row.key))];
  const rows=keys.map(key=>{
    const beforeRow=previous.exercises.find(row=>row.key===key),afterRow=current.exercises.find(row=>row.key===key);
    const row=afterRow || beforeRow;
    const before=endpoint(beforeRow),after=endpoint(afterRow);
    let status=!beforeRow?'new_variant':!afterRow?'previous_variant':before?.adapted || after?.adapted?'adapted':
      !before?.full || !after?.full || before.kg==null || after.kg==null || before.reps==null || after.reps==null || before.perSide==null || after.perSide==null?'missing_or_mixed_sets':
      before.perSide!==after.perSide?'units_changed':
      !before.strengthMode || !after.strengthMode || !before.doseReason || !after.doseReason || before.targetRpeMax==null || after.targetRpeMax==null?'context_unknown':
      before.strengthMode!==after.strengthMode || before.doseReason!==after.doseReason || before.setCount!==after.setCount || before.targetRpeMax!==after.targetRpeMax?'dose_changed':'comparable';
    const comparable=status==='comparable';
    const sameWork=comparable && before.kg===after.kg && before.reps===after.reps;
    return {key,code:row.code,trainingType:row.trainingType,name:row.name,loadUnits:row.loadUnits,status,before,after,
      delta:comparable?{kg:round(after.kg-before.kg),reps:round(after.reps-before.reps),exerciseRpe:sameWork && before.exerciseRpe!=null && after.exerciseRpe!=null?round(after.exerciseRpe-before.exerciseRpe):null}:null,
      effortComparable:!!(sameWork && before.exerciseRpe!=null && after.exerciseRpe!=null),
      decisions:decisions(afterRow,previous.id)};
  });
  return {status:'ready',previousId:previous.id,currentId:current.id,rows,
    summary:{comparable:rows.filter(row=>row.status==='comparable').length,newVariants:rows.filter(row=>row.status==='new_variant').length,limited:rows.filter(row=>!['comparable','new_variant','previous_variant'].includes(row.status)).length},
    context:{before:context(previous),after:context(current)}};
}
