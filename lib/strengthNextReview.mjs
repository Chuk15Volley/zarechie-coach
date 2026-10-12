import {buildStrengthCycleReview} from './strengthCycleReview.mjs';
import {buildStrengthDevelopmentDraft} from './strengthDevelopmentDraft.mjs';
import {buildCoachAdaptation} from './coachAdaptation.mjs';
import {recommendGymSession} from './readySixGym.mjs';
import {manualMethodRecommendation} from './manualMethod.mjs';
import {strengthExercises} from './strengthCycle.mjs';
import {strengthReadySixLoad} from './strengthIndividualization.mjs';
export function buildStrengthNextReview({records=[],snapshot,date,asOf,trainingType,strengthMode,equipment={},developmentPlan=null,restrictions=[],decision=null}){
  const review=buildStrengthCycleReview(records,{asOf}),cycle=review.cycles[0] || null;
  const recommendation=recommendGymSession({snapshot,targetDate:date,recentSessions:records});
  const load=strengthReadySixLoad(snapshot,date,recommendation.calendar);
  const sourceCycle=cycle?.status==='completed'?cycle:review.cycles[1];
  const visibleDecision=sourceCycle?.status==='completed' && decision?.cycleId===sourceCycle.id?decision:null;
  // Only current, matched feedback can support the same exact-exercise proposal.
  // Later live edits invalidate an older effort report.
  const actualHistory=records.filter(r=>r.date<date && r.strengthExecutionFacts?.actual?.source==='player_feedback' && Date.parse(r.strengthExecutionFacts.actual.savedAt)>=Date.parse(r.savedAt || r.generatedAt || 0) && (!r.strengthExecutionFacts.log || Date.parse(r.strengthExecutionFacts.actual.savedAt)>=Date.parse(r.strengthExecutionFacts.log.lastActionAt || r.strengthExecutionFacts.log.savedAt))).map(r=>({...r.strengthExecutionFacts.actual,date:r.date}));
  let preview,previewError='';
  try{
    const input={snapshot,date,focus:'inseason_strength',strengthMode,trainingType,recentSessions:records,recommendation,manualMethodSelection:true,playerRestrictions:restrictions};
    preview=buildCoachAdaptation(input) || buildStrengthDevelopmentDraft({...input,recommendation:manualMethodRecommendation(recommendation,true),sourceState:recommendation.state,actualHistory,equipment,cycleDecision:decision,developmentPlan});
  }catch{previewError='Не удалось подобрать безопасные варианты. Откройте игрока для индивидуальной проверки.';}
  const rows=(cycle?.exercises || []).filter(row=>row.trainingType===trainingType);
  const facts=rows.flatMap(row=>row.observations.flatMap(point=>point.sets.filter(set=>set.completed)));
  const proposals=strengthExercises(preview?.session).filter(ex=>['A1','B1','B2'].includes(ex.code)).map(ex=>({code:ex.code,name:ex.name,sets:ex.targetSets,kg:ex.weightKg ?? null,rpe:ex.targetRpeMax ?? null,action:ex.loadProgression?.action || 'rpe_only',reason:ex.loadProgression?.reason || ex.weightNote || '',sourceDate:ex.loadEvidence?.date || null,adapted:!!ex.symptomAdapted,doseReason:ex.doseReason || null,volume:ex.coachVolumeDose || null}));
  return {version:1,date,asOf,trainingType,strengthMode,checkedAt:new Date().toISOString(),
    cycle:cycle?{id:cycle.id,status:cycle.status,completedCount:cycle.completedCount,completionDates:cycle.completionDates,adaptedSessions:cycle.adaptedSessions,suggestions:cycle.suggestions,comparison:cycle.comparison}:null,
    facts:{completedMainSets:facts.length,setsWithKgAndReps:facts.filter(set=>set.kg!=null && set.reps!=null).length,missingExerciseRpe:rows.flatMap(row=>row.observations).filter(point=>point.exerciseRpe==null).length,rows},
    load:{playedSets:load.playedSets,recentCourtLoad:load.recentCourtLoad,travelDates:load.travelDates,missing:load.missing,reasons:load.reasons,allowIncrease:load.allowIncrease},
    decision:visibleDecision?{cycleId:visibleDecision.cycleId,revision:visibleDecision.revision,savedAt:visibleDecision.savedAt,entries:visibleDecision.entries.filter(entry=>entry.trainingType===trainingType)}:null,
    decisionNeeded:cycle?.status==='completed' && !visibleDecision,
    proposal:{status:previewError?'unavailable':preview?.session?.methodology?.medicalHold?'medical_hold':preview?.quality?.medicalReviewRequired?'review_required':'ready',error:previewError,warning:preview?.quality?.medicalReviewReason || '',cycle:preview?.session?.methodology?.strengthCycle || null,decision:preview?.session?.methodology?.coachCycleDecision || null,rows:proposals},
  };
}
