import {incidentGroups} from './coachOperationsPresentation.mjs';
// Coach UI only: discovery, navigation and labels never alter stored prescriptions.
export function correctionNeighbours(rows,playerId){
 const current=rows.find(row=>String(row.playerId)===String(playerId));
 const list=current?rows.filter(row=>row.status==='done' && !!row.saved===!!current.saved && row.workspace===current.workspace && row.date===current.date):[];
 const index=list.findIndex(row=>String(row.playerId)===String(playerId));
 return {previous:index>0?list[index-1]:null,next:index>=0?list[index+1] || null:null,index,total:list.length};
}
export function correctionQueueFilter(choice,scope,rows){
 const complete=rows.length>0 && rows.every(row=>row.saved);
 return choice?.scope===scope && !(choice.value==='remaining' && complete && !choice.complete)?choice.value:complete?'saved':'remaining';
}
export function missingFactText(missing={}){
 return [['kg','кг'],['reps','повторы'],['rpe','RPE упражнения']].filter(([key])=>Number(missing[key])>0).map(([key,label])=>`${label} ${missing[key]}`).join(' · ');
}
export function weekFactText(day){
 if(!day.completed && !(day.completedSets>0) && !(day.actualTonnage>0) && (!day.loadEvidence || day.loadEvidence.source==='missing'))return null;
 return true;
}
export function coachHealthSummary(data={}){
 const active=(data.activeReasons || []).filter(reason=>!/^Ошибок в журнале за 24 часа:/.test(reason));
 const firing=incidentGroups(data.notifications || []).active.length>0;
 const unknown=!data.status || !data.services || !data.checks;
 const needsAttention=unknown || data.status==='error' || active.length>0 || Object.values(data.services || {}).some(ok=>ok===false) || data.checks?.historyIntegrity===false || data.generationPerformance?.needsAttention || firing;
 return {label:needsAttention?'Требуется внимание':'Текущих проблем не выявлено',active,journal:`Ошибок в журнале за 24 часа: ${data.errors24h || 0}`,needsAttention};
}
