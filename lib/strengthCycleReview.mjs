import {strengthEquipmentFamily} from './strengthEquipment.mjs';
import {compareStrengthCycles} from './strengthCycleComparison.mjs';
import { STRENGTH_CYCLE_VERSION, strengthExercises } from './strengthCycle.mjs';
import { strengthSessionCompletion } from './strengthCompletion.mjs';
import { loadUnitsForExercise } from './tonnage.js';
import { parseStrengthRepTarget } from './strengthRepProgression.mjs';
const positive = value => value !== '' && value != null && Number.isFinite(Number(String(value).replace(',','.'))) && Number(String(value).replace(',','.'))>0 ? Number(String(value).replace(',','.')) : null;
const rpe = value => { const n=positive(value); return n>=1 && n<=10 ? n : null; };
const recordedReps = value => value!=='' && value!=null && Number.isInteger(Number(value)) && Number(value)>=0 ? Number(value) : null;
const knownNumber = value => value!=='' && value!=null && Number.isFinite(Number(value)) && Number(value)>=0 ? Number(value) : null;
function execution(record, ex, bi, ei) {
  const {actual,log}=record.strengthExecutionFacts || {};
  const saved=Date.parse(record.savedAt || record.generatedAt || '');
  const fresh=value=>Number.isFinite(Date.parse(value)) && (!Number.isFinite(saved) || Date.parse(value)>=saved);
  const factIndex=(record.session.blocks || []).slice(0,bi).reduce((sum,b)=>sum+(b.exercises || []).length,0)+ei;
  const fact=actual?.exercises?.[factIndex];
  const matches=actual?.source==='player_feedback' && fresh(actual.savedAt) && fact?.name===ex.name && fact.block===(record.session.blocks[bi].label || '') && loadUnitsForExercise(fact)===loadUnitsForExercise(ex) && fact.setActuals?.length===ex.targetSets.length && fact.setActuals.every((s,i)=>String(s.target)===String(ex.targetSets[i]));
  const currentLog=log && fresh(log.savedAt) && (!matches || Date.parse(log.savedAt)>=Date.parse(actual.savedAt));
  const targets=ex.targetSets || [];
  const sets=targets.map((target,si)=>{
    const key=`${bi}-${ei}-${si}`;
    const historical=matches ? fact.setActuals[si] : null;
    const completed=currentLog ? log.done?.[key]===true && !log.skipped?.[`${bi}-${ei}`] : historical?.completed===true;
    const kg=completed ? positive(currentLog ? log.weights?.[key] : historical?.kg) : null;
    const reps=completed ? recordedReps(currentLog ? log.repetitions?.[key] : historical?.repsRecorded===true ? historical.reps : null) : null;
    const perSide=!!parseStrengthRepTarget(target)?.perSide;
    // Feedback stores total repetitions; live logs store the player's raw input.
    return {completed,requiresKg:!ex.symptomAdapted && !!(strengthEquipmentFamily(ex) || positive(ex.weightKg) || /cable|machine/i.test(ex.name)),requiresReps:!!parseStrengthRepTarget(target),kg,reps:reps==null?null:!currentLog && perSide ? reps/2 : reps,perSide};
  });
  const effortCurrent=matches && (!currentLog || Date.parse(actual.savedAt)>=Date.parse(log.lastActionAt || log.savedAt));
  const trainingType=record.trainingType || record.session.methodology.trainingType || 'full_body';
  const decision=record.session.methodology.coachCycleDecision;
  const entry=decision?.version==='strength-cycle-decision-v1' && Array.isArray(decision.entries)?decision.entries.find(entry=>entry?.trainingType===trainingType && entry.code===ex.code && typeof entry.name==='string' && ['keep','rotate'].includes(entry.exercise) && ['auto','hold'].includes(entry.progression)):null;
  const effects=record.session.methodology.coachCycleDecisionEffects;
  const effect=Array.isArray(effects)?effects.find(item=>item?.code===ex.code):null;
  const coachDecision=entry?{cycleId:decision.cycleId,revision:decision.revision || null,savedAt:decision.savedAt || null,exercise:entry.exercise,progression:entry.progression,requestedName:entry.name,volume:entry.volume==='reduce_one'?'reduce_one':'normal',volumeReason:typeof entry.volumeReason==='string'?entry.volumeReason.slice(0,300):'',note:typeof entry.note==='string'?entry.note.slice(0,300):'',effect:['applied','symptom_deferred','selection_deferred'].includes(effect?.status)?effect.status:'not_recorded'}:null;
  return {date:record.date,sets,coachVolumeDose:ex.coachVolumeDose && ['reduced','already_reduced','symptom_deferred'].includes(ex.coachVolumeDose.status)?{status:ex.coachVolumeDose.status,cap:ex.coachVolumeDose.cap,plannedSets:ex.coachVolumeDose.plannedSets}:null,strengthMode:record.strengthMode || (record.session.methodology.goal==='inseason_strength_development'?'development':record.session.methodology.goal==='inseason_strength_maintenance'?'maintenance':null),doseReason:ex.doseReason || null,targetRpeMax:ex.targetRpeMax ?? null,coachDecision,exerciseRpe:effortCurrent?rpe(fact.actualRpe):null,sessionRpe:matches?rpe(actual.sessionRpe):null,
    source:currentLog?'player_log':matches?'player_feedback':'missing',adapted:!!ex.symptomAdapted};
}
export function buildStrengthCycleReview(records=[],{asOf}={}) {
  const eligible=[...new Map(records.filter(r=>r.date<=asOf && (r.focus || r.quality?.focus)==='inseason_strength' && !r.session?.methodology?.medicalHold && r.session?.methodology?.strengthCycle?.version===STRENGTH_CYCLE_VERSION).sort((a,b)=>a.date.localeCompare(b.date)).map(r=>[r.date,r])).values()];
  const groups=new Map();
  for(const record of eligible){const id=record.session.methodology.strengthCycle.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(record);}
  const cycles=[...groups].sort(([a],[b])=>b.localeCompare(a)).slice(0,12).map(([id,plans])=>{
    // Derive completion again from execution; never trust a stored draft flag.
    const completed=plans.filter(record=>strengthSessionCompletion(record,record.strengthExecutionFacts?.actual,record.strengthExecutionFacts?.log).completed).slice(0,4);
    const rows=new Map();
    for(const record of completed) record.session.blocks.forEach((block,bi)=>(block.exercises || []).forEach((ex,ei)=>{
      if(!['A1','B1','B2'].includes(ex.code))return;
      const trainingType=record.trainingType || record.session.methodology.trainingType || 'full_body';
      const units=loadUnitsForExercise(ex);
      const key=JSON.stringify([trainingType,ex.code,ex.name,units]);
      if(!rows.has(key))rows.set(key,{key,trainingType,code:ex.code,name:ex.name,loadUnits:units,observations:[]});
      rows.get(key).observations.push(execution(record,ex,bi,ei));
    }));
    const replacements=[...new Map(plans.flatMap(record=>(record.session.coachReplacements || []).filter(e=>e.date>=id && e.date<=asOf).map(e=>[JSON.stringify([e.date,e.code,e.from,e.to,e.reason]),{date:e.date,code:e.code,from:e.from,to:e.to,reason:e.reason,note:e.note || ''}]))).values()];
    const context=plans.map(record=>({date:record.date,source:record.session.methodology.externalLoad?.source || null,playedSets:knownNumber(record.session.methodology.externalLoad?.playedSets),courtLoad:knownNumber(record.session.methodology.externalLoad?.recentCourtLoad),travelDates:(record.session.methodology.externalLoad?.travelDates || []).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)),reasons:(record.session.methodology.externalLoad?.reasons || []).map(reason=>({code:reason.code,text:reason.text})),missing:record.session.methodology.externalLoad?.missing || []}));
    const coarseStepDates=completed.filter(record=>strengthExercises(record.session).some(ex=>ex.loadProgression?.stepKg/ex.loadProgression?.observedKg>0.05+1e-8)).map(r=>r.date);
    const incomplete=plans.filter(record=>!completed.some(done=>done.date===record.date));
    return {id,status:completed.length===4?'completed':'in_progress',completedCount:completed.length,plannedCount:plans.length,completionDates:completed.map(r=>r.date),
      startDate:plans[0].date,endDate:completed.length===4?completed.at(-1).date:null,exercises:[...rows.values()],replacements,context,coarseStepDates,
      adaptedSessions:completed.filter(record=>strengthExercises(record.session).some(ex=>ex.symptomAdapted)).length,
      otherPlans:incomplete.map(record=>({date:record.date,finishReason:record.strengthExecutionFacts?.log?.finishReason || record.strengthExecutionFacts?.actual?.finishReason || null})),
      suggestions:[...coarseStepDates.length?['Проверить доступность меньшего шага веса; до этого прогрессировать повторы только в пределах методики.']:[],
        ...[...rows.values()].some(row=>row.observations.some(point=>point.exerciseRpe==null || point.sets.some(set=>set.kg==null || set.reps==null)))?['Не все фактические кг, повторы и RPE упражнения записаны: вывод о прогрессе ограничен.']:[]]};
  });
  for(let index=0;index<cycles.length;index++)cycles[index].comparison=compareStrengthCycles(cycles[index],cycles[index+1]);
  return {version:'strength-cycle-review-v1',asOf,cycles,legacySessions:records.filter(r=>r.date<=asOf && (r.focus || r.quality?.focus)==='inseason_strength' && r.session?.methodology?.strengthCycle?.version!==STRENGTH_CYCLE_VERSION).length};
}
