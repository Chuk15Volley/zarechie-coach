import { mergeWorkoutProgress } from './workoutProgress.mjs';
import { completedSetCount } from './playerWorkout.mjs';
import { loadUnitsForExercise } from './tonnage.js';
import { needsLoadEntry, repetitionInput, validActualWeight, validRepetitions, playerExerciseName, targetLabel, russianCount } from './playerGym.mjs';

export function serverWorkoutComplete(session, log) {
 const total=(session?.blocks || []).reduce((n,b)=>n+(b.exercises || []).reduce((m,e)=>m+(e.targetSets?.length || 0),0),0);
 return !!log?.completedAt || !!(total && completedSetCount(session,log?.done || {})===total);
}
// Viewing a server-confirmed completion must not replay a stale device snapshot.
export function restorePlayerProgress(session, server={}, local=null, pending=null) {
 if(serverWorkoutComplete(session,server)) return { ...mergeWorkoutProgress({},server,server.savedAt || server.lastActionAt), completedAt:server.completedAt || server.savedAt || null };
 return mergeWorkoutProgress(server,pending || local || {});
}
export function implementWeightLabel(ex) {
 if(loadUnitsForExercise(ex)!==2)return 'Вес снаряда, кг';
 return /dumbbell|\bdb\b|гантел|^Chest-Supported Reverse Fly$/i.test(ex?.name || '') ? 'Вес одной гантели, кг' : /kettlebell|\bkb\b|гир/i.test(ex?.name || '') ? 'Вес одной гири, кг' : 'Вес одного снаряда, кг';
}
export function actualLoadLabel(ex, value) {
 if(value==null || String(value).trim()==='')return '';
 const kg=String(value).replace('.',',');
 return loadUnitsForExercise(ex)===2 ? `2 ${/dumbbell|\bdb\b|гантел|^Chest-Supported Reverse Fly$/i.test(ex?.name || '')?'гантели':/kettlebell|\bkb\b|гир/i.test(ex?.name || '')?'гири':'снаряда'} по ${kg} кг` : `${kg} кг`;
}

export function playerSessionStatus(session,log) {
 if(log?.completedAt && log?.finishReason)return 'Завершена раньше';
 if(log?.completedAt && Object.values(log?.skipped || {}).some(Boolean))return 'Завершена с пропусками';
 if(serverWorkoutComplete(session,log))return 'Выполнена';
 return log?.startedAt ? 'В процессе' : 'Назначена';
}

// Presentation only. An absent external load is never inferred as bodyweight.
export function visibleLoadPrescription(ex, label) {
 if (/^Вес назначить индивидуально по фактической истории/i.test(label || '')) {
  return needsLoadEntry(ex) ? 'Вес уточнить у тренера' : '';
 }
 return label || '';
}

export function resultInputsChanged({ ex, target, weight, repetitions, kg, reps }) {
 const numericEqual=(a,b,parse)=>String(a ?? '')===String(b ?? '') || (parse(a)!=null && parse(a)===parse(b));
 const info=repetitionInput(target);
 return (needsLoadEntry(ex) && !numericEqual(weight ?? '',kg,validActualWeight)) ||
  (!!info && !numericEqual(repetitions ?? String(info.planned),reps,validRepetitions));
}

export function weightChangeLabels(session,item) {
 const ex=(session?.blocks || []).flatMap(b=>b.exercises || []).find(e=>e.code===item.code && playerExerciseName(e)===item.name) || {};
 return { planned:actualLoadLabel(ex,item.planned), actual:item.actual.map(kg=>actualLoadLabel(ex,kg)).join(' / ') };
}

export function historyMonthGroups(items=[]) {
 const groups=new Map();
 for(const item of items) {
  const month=/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(item.date || '') ? item.date.slice(0,7) : 'other';
  if(!groups.has(month))groups.set(month,{key:month,label:month==='other'?'Другие даты':new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z')),items:[]});
  groups.get(month).items.push(item);
 }
 return [...groups.values()];
}

export function pairWeightLegend(ex) {
 if(loadUnitsForExercise(ex)!==2)return '';
 const noun=implementWeightLabel(ex).replace(/^Вес /,'').replace(/, кг$/,'');
 return `2 ${/гантели/.test(noun)?'гантели':/гири/.test(noun)?'гири':'снаряда'} · вес ${noun}`;
}
export function compactActualLoadLabel(ex,value) {
 const label=actualLoadLabel(ex,value);
 return loadUnitsForExercise(ex)===2 && label ? `${String(value).replace('.',',')} кг` : label;
}
export function compactSetPrescription(targets=[]) {
 if(!targets.length)return '';
 if(targets.every(target=>String(target)===String(targets[0]))) {
  const count=targets.length,info=repetitionInput(targets[0]);
  return `${count} ${russianCount(count,'подход','подхода','подходов')} по ${info ? `${info.planned} ${russianCount(info.planned,'повторению','повторения','повторений')}${info.perSide?' на сторону':''}` : targetLabel(targets[0])}`;
 }
 return targets.map((target,i)=>`${i+1}: ${targetLabel(target)}`).join(' · ');
}

// Read-only display of the existing API facts, never a rewrite of the log.
export function historySetRows(ex,bi,ei,block,meta={}) {
 meta=meta || {};
 if(!Array.isArray(ex?.targetSets) || !ex.targetSets.length)return [];
 const matches=(Array.isArray(meta.actual?.exercises)?meta.actual.exercises:[]).filter(item=>item?.name===ex.name && item.block===(block.label || '') && loadUnitsForExercise(item)===loadUnitsForExercise(ex) && Array.isArray(item.setActuals) && item.setActuals.length===ex.targetSets.length && item.setActuals.every((set,i)=>String(set?.target)===String(ex.targetSets[i])));
 const actual=matches.length===1 ? matches[0] : null,log=meta.log;
 return (ex.targetSets || []).map((target,si)=>{
  const key=`${bi}-${ei}-${si}`,set=actual?.setActuals?.[si];
  const done=log?.done && typeof log.done==='object' ? log.done[key]===true : set?.completed===true;
  const skipReason=log?.skipped?.[`${bi}-${ei}`] || meta.feedback?.skipped?.[`${bi}-${ei}`] || meta.actual?.skipped?.[`${bi}-${ei}`] || actual?.skippedReason || '';
  const hasWeight=Object.prototype.hasOwnProperty.call(log?.weights || {},key);
  const fallbackWeight=set?.kgRecorded===true || (set?.kgRecorded!==false && Number(set?.kg)>0) ? validActualWeight(set.kg) : null;
  const weight=hasWeight ? validActualWeight(log.weights[key]) : fallbackWeight;
  const hasReps=Object.prototype.hasOwnProperty.call(log?.repetitions || {},key),info=repetitionInput(target);
  const reps=hasReps ? validRepetitions(log.repetitions[key]) : set?.repsRecorded===true && info ? validRepetitions(Number(set.reps)/(info.perSide?2:1)) : null;
  return {key,si,target,done,skipReason,weight:done?weight:null,reps:done?reps:null};
 });
}
