// Only server-read execution facts may establish completion, never a plan flag.
export function strengthSessionCompletion(record, actual = null, log = null) {
  const planned = (record?.session?.blocks || []).flatMap((block,bi)=>(block.exercises || []).map((ex,ei)=>({ex,bi,ei,block:block.label || ''})));
  const saved = Date.parse(record?.savedAt || record?.generatedAt || '');
  const fresh = value => Number.isFinite(Date.parse(value)) && (!Number.isFinite(saved) || Date.parse(value) >= saved);
  const incomplete = {completed:false,source:null};
  if (!planned.length || planned.some(({ex})=>!ex.targetSets?.length) || record?.session?.methodology?.medicalHold) return incomplete;
  // A newer progress log can undo a former completion or record a skip.
  const logCurrent = log && fresh(log.savedAt) && (!actual || Date.parse(log.savedAt) >= Date.parse(actual.savedAt));
  if (logCurrent) {
    const complete = !log.finishReason && fresh(log.completedAt) && planned.every(({ex,bi,ei})=>!log.skipped?.[`${bi}-${ei}`] && ex.targetSets.every((_,si)=>log.done?.[`${bi}-${ei}-${si}`] === true));
    return complete ? {completed:true,source:'player_log',completedAt:log.completedAt} : incomplete;
  }
  if (actual?.source !== 'player_feedback' || !fresh(actual.savedAt) || actual.finishReason || Object.values(actual.skipped || {}).some(Boolean) || actual.exercises?.length !== planned.length) return incomplete;
  const complete = planned.every(({ex,block},i)=>{
    const fact=actual.exercises[i];
    return fact?.name===ex.name && fact.block===block && fact.completed===true && fact.plannedSets===ex.targetSets.length && fact.setActuals?.length===ex.targetSets.length && fact.setActuals.every((s,si)=>s.completed===true && String(s.target)===String(ex.targetSets[si]));
  });
  return complete ? {completed:true,source:'player_feedback',completedAt:actual.savedAt} : incomplete;
}
