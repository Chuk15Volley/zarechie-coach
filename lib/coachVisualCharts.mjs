import {loadDayPresentation} from './coachQuickWork.mjs';

// Display only. Missing facts never become recorded zero or a new load score.
export const chartNumber=value=>value!=='' && value!=null && typeof value!=='boolean' && Number.isFinite(Number(value)) && Number(value)>=0?Number(value):null;
export function chartDateIndices(count,width,minSpacing=56){
 if(count<1)return [];if(count===1)return [0];
 const step=(width-60)/(count-1),indices=[0];
 for(let i=1;i<count-1;i++)if((i-indices.at(-1))*step>=minSpacing && (count-1-i)*step>=minSpacing)indices.push(i);
 indices.push(count-1);return indices;
}
export function nearestChartIndex(x,count,width){return count?Math.max(0,Math.min(count-1,Math.round((x-38)/(width-60)*Math.max(1,count-1)))):null;}
export function chartKeyIndex(key,index,count){
 if(!count)return null;
 if(key==='Home')return 0;if(key==='End')return count-1;
 if(key==='ArrowLeft')return Math.max(0,(index??count)-1);
 if(key==='ArrowRight')return Math.min(count-1,(index??-1)+1);
 return index;
}
export function chartObservationCounts(points,metric){
 let known=0,notPerformed=0,missing=0;
 for(const p of points){if(chartNumber(p[metric])!=null)known++;else if(['Этот вариант не выполнялся','Такого подхода нет'].includes(p.gap))notPerformed++;else missing++;}
 return {known,notPerformed,missing};
}
export function teamLoadChartRows(data={},kind='actual'){
 return (data.dates || []).map(date=>{
  const members=(data.players || []).filter(p=>p.evidenceByDay?.[date]?.source!=='no_session' && (p.evidenceByDay?.[date] || Object.hasOwn(p.plannedByDay || {},date) || Object.hasOwn(p.byDay || {},date)));
  const observed=members.map(p=>({value:chartNumber(kind==='plan'?p.plannedByDay?.[date]:p.byDay?.[date]),known:kind==='plan'?chartNumber(p.plannedByDay?.[date])!=null:loadDayPresentation(p,date).known}));
  const values=observed.filter(p=>p.known && p.value!=null);
  return {date,value:values.length?values.reduce((s,p)=>s+p.value,0):null,partial:values.length>0 && (values.length<members.length || kind==='actual' && members.some(p=>p.evidenceByDay?.[date]?.partial)),gap:members.length?'Нет записанного факта':'Нет программ'};
 });
}
export function weekPlanChartRows(data={}){
 return (data.dates || []).map(date=>{
  const days=(data.athletes || []).flatMap(a=>(a.days || []).filter(day=>day.date===date && day.hasSession));
  const values=days.map(day=>chartNumber(day.plannedTonnage)).filter(value=>value!=null);
  return {date,value:values.length?values.reduce((s,v)=>s+v,0):null,partial:values.length>0 && values.length<days.length,gap:days.length?'План не записан':'Нет программ'};
 });
}
export function historyLoadChart(session={}){
 const value=chartNumber(session.tonnage),e=session.loadEvidence,execution=session.execution || {completed:session.factReview?.completed};
 const known=value!=null && e?.source!=='missing' && e?.source!=='no_session' && (value>0 || !e?.partial && e?.supplementStatus!=='stale' && (execution?.completed || execution?.completedSets>0));
 return {actual:known?value:null,plan:chartNumber(session.plannedTonnage),partial:known && (e?.partial || e?.supplementStatus==='stale')};
}
export function confirmedQueueSaves(previous,next,scope){
 if(previous?.scope!==scope)return [];
 return next.filter(row=>row.saved===true && previous.rows.get(String(row.playerId))===false).map(row=>String(row.playerId));
}
