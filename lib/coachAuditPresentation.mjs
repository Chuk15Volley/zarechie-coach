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
 return {total:selected.length,observations:known.length,kg:known.filter(p=>p.kg!=null).length,reps:known.filter(p=>p.reps!=null).length,rpe:known.filter(p=>p.rpe!=null).length,latest};
}
export function techniqueSignature(card){return JSON.stringify([card?.canonicalId,card?.title,card?.description || '',card?.video || card?.autoVideo || '',variantTechnique(card)]);}
export function variantTechnique(card){
 if(card?.title==='Single-Leg DB Romanian Deadlift')return 'Румынская тяга с гантелями на одной опорной ноге: сохранять нейтральную спину и ровное положение таза, мягкое колено опорной ноги. Отводить таз назад, свободную ногу — назад; возвращаться разгибанием таза без разворота корпуса. Амплитуду и опору для равновесия согласовать с тренером.';
 return null;
}

export function overviewRestoreReady(target,updatedAt){const updated=Date.parse(updatedAt || '');return Number.isFinite(updated) && updated>=target.requestedAt;}
