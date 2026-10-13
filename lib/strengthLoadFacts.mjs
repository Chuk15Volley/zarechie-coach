import {strengthEquipmentFamily} from './strengthEquipment.mjs';
import {resolveStrengthSupplement} from './strengthActualSupplement.mjs';
import {loadUnitsForExercise} from './tonnage.js';
import {parseStrengthRepTarget} from './strengthRepProgression.mjs';
const num=value=>value!=='' && value!=null && Number.isFinite(Number(value))?Number(value):null;
// Every consumer derives factual load from the same original sources. Cached plan
// tonnage cannot replace absent repetitions or survive a later undo.
export function gymLoadFacts(record,actual,log,supplement){
 if((record?.focus || record?.quality?.focus)!=='inseason_strength')return {actual,log,supplementStatus:'none'};
 const resolved=resolveStrengthSupplement(record,actual,log,supplement);
 const saved=Date.parse(record.savedAt || record.generatedAt || ''),fresh=value=>Number.isFinite(Date.parse(value)) && (!Number.isFinite(saved) || Date.parse(value)>=saved);
 const currentLog=log && fresh(log.savedAt) && (!actual || Date.parse(log.savedAt)>=Date.parse(actual.savedAt));
 let index=0,knownSets=0,missingSets=0;
 const exercises=(record.session?.blocks || []).flatMap((block,bi)=>(block.exercises || []).map((ex,ei)=>{
  const old=actual?.exercises?.[index],verified=resolved.supplementStatus==='applied'?resolved.actual.exercises[index]:null;index++;
  const matched=actual?.source==='player_feedback' && fresh(actual.savedAt) && old?.name===ex.name && old.block===(block.label || '') && loadUnitsForExercise(old)===loadUnitsForExercise(ex) && old.setActuals?.length===ex.targetSets?.length && old.setActuals.every((set,i)=>String(set.target)===String(ex.targetSets[i]));
  const sets=(ex.targetSets || []).map((target,si)=>{
   const key=`${bi}-${ei}-${si}`,source=verified?.setActuals?.[si] || (matched?old.setActuals[si]:null),parsed=parseStrengthRepTarget(target);
   const completed=verified?true:currentLog?log.done?.[key]===true && !log.skipped?.[`${bi}-${ei}`]:source?.completed===true;
   const kg=verified?source.kgRecorded?num(source.kg):null:currentLog?num(log.weights?.[key]):source?.kgRecorded || num(source?.kg)>0?num(source?.kg):null;
   const reps=verified?source.repsRecorded?num(source.reps):null:currentLog?num(log.repetitions?.[key])==null?null:num(log.repetitions[key])*(parsed?.perSide?2:1):source?.repsRecorded===true?num(source.reps):null;
   if(completed && parsed && !ex.symptomAdapted && (strengthEquipmentFamily(ex) || Number(ex.weightKg)>0 || /cable|machine/i.test(ex.name))){if(kg!=null && reps!=null)knownSets++;else missingSets++;}
   return {set:si+1,target:String(target),completed,kg:kg ?? 0,kgRecorded:kg!=null,reps:reps ?? 0,repsRecorded:reps!=null};
  });
  return {...(verified || (matched?old:{})),name:ex.name,block:block.label || '',loadUnits:loadUnitsForExercise(ex),plannedSets:sets.length,completedSets:sets.filter(set=>set.completed).length,completed:sets.every(set=>set.completed),actualKg:Math.max(0,...sets.filter(set=>set.completed && set.kgRecorded).map(set=>set.kg)),setActuals:sets};
 }));
 const actualTonnage=Math.round(exercises.reduce((sum,ex)=>sum+ex.setActuals.reduce((total,set)=>total+(set.completed && set.kgRecorded && set.repsRecorded?set.kg*set.reps*ex.loadUnits:0),0),0));
 const hasEvidence=!!(currentLog || actual && fresh(actual.savedAt) || resolved.supplementStatus==='applied');
 return {...resolved,log,actual:hasEvidence?{...(resolved.actual || actual || {}),actualTonnage,exercises,loadEvidence:{knownSets,missingSets,partial:missingSets>0,source:resolved.supplementStatus==='applied'?'coach_verified':currentLog?'player_log':'player_feedback',supplementStatus:resolved.supplementStatus}}:null};
}
