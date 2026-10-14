import {createHash} from 'node:crypto';
import {strengthSessionCompletion} from './strengthCompletion.mjs';
import {strengthEquipmentFamily} from './strengthEquipment.mjs';
import {parseStrengthRepTarget} from './strengthRepProgression.mjs';
import {loadUnitsForExercise} from './tonnage.js';
const num=value=>value!=='' && value!=null && typeof value!=='boolean' && Number.isFinite(Number(String(value).replace(',','.')))?Number(String(value).replace(',','.')):null;
const validRpe=value=>num(value)>=1 && num(value)<=10?num(value):null;
export const supplementKey=(prefix,id,date)=>`${prefix}:strength:actual-supplement:${id}:${date}`;
export const actualFingerprint=(record,actual,log)=>createHash('sha256').update(JSON.stringify([record,actual || null,log || null])).digest('hex');
const hash=value=>createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
export const actualSources=(record,actual,log)=>({program:hash(record),feedback:hash(actual),log:hash(log)});
export const actualExerciseSignatures=record=>Object.fromEntries((record?.session?.blocks || []).flatMap((block,bi)=>(block.exercises || []).map((ex,ei)=>[`${bi}-${ei}`,hash([block.label,ex.code,ex.name,loadUnitsForExercise(ex),ex.targetSets,!!ex.symptomAdapted])])));
export function supplementStaleReasons(record,actual,log,supplement){
 if(!supplement)return [];
 const completion=strengthSessionCompletion(record,actual,log),changed=supplement.baseFingerprint!==actualFingerprint(record,actual,log),sources=actualSources(record,actual,log),reasons=[];
 if(changed){if(!supplement.sources)reasons.push({code:'legacy_sources',text:'Изменились исходные записи; у старого подтверждения нет раздельных отпечатков источников.'});else for(const [key,text] of Object.entries({program:'Изменилась сохранённая программа.',feedback:'Изменились фактические ответы игрока.',log:'Изменился журнал выполнения: подходы, веса, повторы или отметки завершения.'}))if(supplement.sources[key]!==sources[key])reasons.push({code:key,text});}
 if(!completion.completed)reasons.push({code:'completion',text:'Полное выполнение больше не подтверждено. Дополнение не применяется и не может восстановить завершение.'});
 return reasons;
}
// Materialize existing completed evidence only; never invent a completion or copy planned kg/reps.
function materialize(record,actual,log){
  const completion=strengthSessionCompletion(record,actual,log);if(!completion.completed)return null;
  const fresh=value=>Number.isFinite(Date.parse(value)) && Date.parse(value)>=Date.parse(record.savedAt || record.generatedAt || '');
  const currentLog=log && fresh(log.savedAt) && (!actual || Date.parse(log.savedAt)>=Date.parse(actual.savedAt));
  let index=0;const exercises=(record.session.blocks || []).flatMap((block,bi)=>(block.exercises || []).map((ex,ei)=>{
    const fact=actual?.exercises?.[index++],matched=actual?.source==='player_feedback' && fresh(actual.savedAt) && fact?.name===ex.name && fact.block===(block.label || '') && loadUnitsForExercise(fact)===loadUnitsForExercise(ex) && fact.setActuals?.length===ex.targetSets.length && fact.setActuals.every((set,i)=>String(set.target)===String(ex.targetSets[i]));
    const effortFresh=matched && (!currentLog || Date.parse(actual.savedAt)>=Date.parse(log.lastActionAt || log.savedAt));
    const sets=ex.targetSets.map((target,si)=>{const key=`${bi}-${ei}-${si}`,old=matched?fact.setActuals[si]:null,parsed=parseStrengthRepTarget(target),kg=currentLog?num(log.weights?.[key]):old?.kgRecorded || num(old?.kg)>0?num(old?.kg):null;
      const reps=currentLog?num(log.repetitions?.[key]):old?.repsRecorded===true?num(old.reps):null;
      return {set:si+1,target:String(target),completed:true,kg:kg ?? 0,kgRecorded:kg!=null,reps:reps==null?0:currentLog && parsed?.perSide?reps*2:reps,repsRecorded:reps!=null};});
    return {...(matched?fact:{}),name:ex.name,block:block.label || '',loadUnits:loadUnitsForExercise(ex),plannedSets:sets.length,completedSets:sets.length,completed:true,actualRpe:effortFresh?validRpe(fact.actualRpe):null,setActuals:sets};
  }));
  return {...(actual || {}),source:'coach_verified',savedAt:new Date(Math.max(Date.parse(actual?.savedAt)||0,Date.parse(log?.savedAt)||0,Date.parse(log?.lastActionAt)||0)).toISOString(),executionCompletedAt:completion.completedAt,exercises};
}
export function resolveStrengthSupplement(record,actual,log,supplement){
  const baseFingerprint=actualFingerprint(record,actual,log),valid=[1,2].includes(supplement?.version) && supplement.baseFingerprint===baseFingerprint;
  const effective=valid?materialize(record,actual,log):null;
  if(!effective)return {actual,log,supplementStatus:supplement?'stale':'none',baseFingerprint,staleReasons:supplementStaleReasons(record,actual,log,supplement)};
  for(const patch of supplement.patches || []){const [bi,ei]=patch.exercise.split('-').map(Number),index=record.session.blocks.slice(0,bi).reduce((sum,block)=>sum+(block.exercises || []).length,0)+ei,fact=effective.exercises[index];
    if(patch.field==='rpe')fact.actualRpe=patch.value;
    else{const set=fact.setActuals[patch.set];if(patch.field==='kg'){set.kg=patch.value;set.kgRecorded=true;}else{set.reps=patch.value*(parseStrengthRepTarget(set.target)?.perSide?2:1);set.repsRecorded=true;}}
  }
  for(const fact of effective.exercises)fact.actualKg=Math.max(0,...fact.setActuals.map(set=>Number(set.kg)||0));
  effective.actualTonnage=Math.round(effective.exercises.reduce((sum,fact)=>sum+fact.setActuals.reduce((total,set)=>total+(set.kgRecorded && set.repsRecorded?set.kg*set.reps*fact.loadUnits:0),0),0));
  effective.coachSupplement={revision:supplement.revision,confirmedAt:supplement.savedAt,reason:supplement.reason,actor:supplement.actor};
  return {actual:effective,log:null,supplementStatus:'applied',baseFingerprint,staleReasons:[]};
}
export function strengthMissingEditor(record,actual,log,supplement){
  if((record.focus || record.quality?.focus)!=='inseason_strength')return null;
  const completion=strengthSessionCompletion(record,actual,log);if(!completion.completed){if(!supplement)return null;return {baseFingerprint:actualFingerprint(record,actual,log),supplementStatus:'stale',staleReasons:supplementStaleReasons(record,actual,log,supplement),completedAt:null,canConfirm:false,rows:[],reconfirmation:{revision:supplement.revision,patches:[]}};}
  const resolved=resolveStrengthSupplement(record,actual,log,supplement),effective=resolved.supplementStatus==='applied'?resolved.actual:materialize(record,actual,log);
  let index=0;const rows=(record.session.blocks || []).flatMap((block,bi)=>(block.exercises || []).flatMap((ex,ei)=>{
    const fact=effective.exercises[index++];
    const requiresKg=!ex.symptomAdapted && !!(strengthEquipmentFamily(ex) || Number(ex.weightKg)>0 || /cable|machine/i.test(ex.name));
    const sets=fact.setActuals.map((set,si)=>({set:si,target:set.target,kg:set.kgRecorded?set.kg:null,reps:set.repsRecorded?set.reps/(parseStrengthRepTarget(set.target)?.perSide?2:1):null,missingKg:requiresKg && !set.kgRecorded,missingReps:!!parseStrengthRepTarget(set.target) && !set.repsRecorded}));
    return [{exercise:`${bi}-${ei}`,code:ex.code,name:ex.name,loadUnits:fact.loadUnits,sets,rpe:fact.actualRpe,missingRpe:fact.actualRpe==null}];
  }));
  const signatures=actualExerciseSignatures(record);
  const reconfirmation=resolved.supplementStatus==='stale'?{revision:supplement.revision,patches:(supplement.patches || []).map(patch=>{
    const row=rows.find(row=>row.exercise===patch.exercise),same=supplement.exerciseSignatures?.[patch.exercise]===signatures[patch.exercise],available=normalizeActualPatches({rows},[patch])!==null;
    return {...patch,name:row?.name || 'Прежнее упражнение',eligible:same && available,reason:!same?'Версия упражнения или подходов не подтверждена — внесите известное значение заново.':!available?'Поле уже заполнено исходными данными; перезапись запрещена.':'Значение отсутствует; можно подтвердить повторно после проверки.'};})}:null;
  return {baseFingerprint:resolved.baseFingerprint,supplementStatus:resolved.supplementStatus,staleReasons:resolved.staleReasons,completedAt:completion.completedAt,canConfirm:true,rows,reconfirmation};
}
export function normalizeActualPatches(editor,patches){
  if(!editor || !Array.isArray(patches) || !patches.length || patches.length>100)return null;
  const ids=new Set(),result=[];
  for(const patch of patches){const row=editor.rows.find(row=>row.exercise===patch?.exercise),set=row?.sets.find(set=>set.set===patch.set),value=num(patch?.value),id=JSON.stringify([patch?.exercise,patch?.set ?? null,patch?.field]);
    if(!row || ids.has(id) || value==null || !['kg','reps','rpe'].includes(patch.field))return null;ids.add(id);
    if(patch.field==='rpe'){if(patch.set!=null || !row.missingRpe || !Number.isInteger(value) || value<1 || value>10)return null;}
    else if(!set || patch.field==='kg' && (!set.missingKg || value<0 || value>1000) || patch.field==='reps' && (!set.missingReps || !Number.isInteger(value) || value<0 || value>200))return null;
    result.push({exercise:patch.exercise,set:patch.field==='rpe'?null:patch.set,field:patch.field,value});
  }
  return result.sort((a,b)=>JSON.stringify([a.exercise,a.set,a.field]).localeCompare(JSON.stringify([b.exercise,b.set,b.field])));
}
export function strengthActualHistory(records,targetDate){
  return records.filter(record=>record.date<targetDate && ['player_feedback','coach_verified'].includes(record.strengthExecutionFacts?.actual?.source) && Date.parse(record.strengthExecutionFacts.actual.savedAt)>=Date.parse(record.savedAt || record.generatedAt || 0) && (!record.strengthExecutionFacts.log || Date.parse(record.strengthExecutionFacts.actual.savedAt)>=Date.parse(record.strengthExecutionFacts.log.lastActionAt || record.strengthExecutionFacts.log.savedAt))).map(record=>({...record.strengthExecutionFacts.actual,date:record.date}));
}
