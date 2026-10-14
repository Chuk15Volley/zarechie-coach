import {replacementTechnique} from './exerciseReplacement.mjs';
// Read-only UI helpers. Never update prescriptions, readiness or original facts.
export function executionLabel(execution){
 if(!execution)return 'Выполнение неизвестно';
 if(execution.completed)return 'Завершено';
 if(execution.completedSets>0 || execution.started)return `Частично · ${execution.completedSets ?? '—'}/${execution.totalSets ?? '—'} подходов`;
 return 'Не начато';
}
export function sourceComparisonRows(previous,current){
 const names={permission:'Допуск и рекомендации',questionnaires:'Анкеты и жалобы',medical:'Медицинские отметки',calendar:'Матчи, площадка и поездки',restrictions:'Запреты тренера'};
 return Object.entries(names).map(([key,label])=>({key,label,status:previous?.version===1 && current?.version===1 && previous.sections?.[key] && current.sections?.[key] ? previous.sections[key]===current.sections[key]?'Совпадает':'Изменился раздел':'Нет сопоставимого снимка'}));
}
export function periodFacts(points,period){
 const selected=points.filter(point=>point.date>=period.from && point.date<=period.to);
 const known=selected.filter(point=>!point.gap),latest=known.at(-1);
 return {total:selected.length,observations:known.length,complete:known.filter(p=>p.kg!=null && p.reps!=null && p.rpe!=null).length,adapted:known.filter(p=>p.adapted).length,sets:known.reduce((sum,p)=>sum+(p.sets || []).filter(set=>set.completed).length,0),dose:known.reduce((sum,p)=>sum+(p.sets || []).filter(set=>set.completed && set.kg!=null && set.reps!=null).reduce((total,set)=>total+set.kg*set.reps*(p.loadUnits || 1)*(set.perSide?2:1),0),0),kg:known.filter(p=>p.kg!=null).length,reps:known.filter(p=>p.reps!=null).length,rpe:known.filter(p=>p.rpe!=null).length,latest};
}
export function techniqueSignature(card){return JSON.stringify([card?.canonicalId,card?.title,card?.description || '',card?.video || card?.autoVideo || '',variantTechnique(card) || card?.description || replacementTechnique(card?.title)]);}
export function variantTechnique(card){
 if(card?.title==='Single-Leg DB Romanian Deadlift')return 'Румынская тяга с гантелями на одной опорной ноге: сохранять нейтральную спину и ровное положение таза, мягкое колено опорной ноги. Отводить таз назад, свободную ногу — назад; возвращаться разгибанием таза без разворота корпуса. Амплитуду и опору для равновесия согласовать с тренером.';
 return null;
}

export function overviewRestoreReady(target,updatedAt){const updated=Date.parse(updatedAt || '');return Number.isFinite(updated) && updated>=target.requestedAt;}

// Same exact variant and actual dose only. Adaptations and missing values cannot establish comparability.
export function comparablePeriods(points,a,b){
 const eligible=period=>points.filter(p=>p.date>=period.from && p.date<=period.to && !p.gap && !p.adapted && p.kg!=null && p.reps!=null && p.rpe!=null && p.sets?.filter(s=>s.completed).length && p.sets.filter(s=>s.completed).every(s=>s.kg!=null && s.reps!=null));
 const signature=p=>JSON.stringify([p.loadUnits || 1,p.sets.filter(s=>s.completed).map(s=>[s.kg,s.reps,!!s.perSide])]);
 const first=eligible(a),second=eligible(b),left=new Set(first.map(signature)),right=new Set(second.map(signature));
 return {first:first.filter(p=>right.has(signature(p))).length,second:second.filter(p=>left.has(signature(p))).length};
}
