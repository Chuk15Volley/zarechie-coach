// Coach display/navigation only. No prescription, medical or result mutation.
export function correctionPreview(storage,workspace,fallback=false){
 try{const value=storage?.getItem('gym-coach-mode-v1:'+workspace);return value==='preview'?true:value==='editor'?false:fallback;}catch{return fallback;}
}
export function rememberCorrectionPreview(storage,workspace,preview){try{storage?.setItem('gym-coach-mode-v1:'+workspace,preview?'preview':'editor');}catch{}}
export function readinessSummary(issues=[]){
 const labels={whoop:'WHOOP',survey:'опрос ReadySix',neuro:'прыжковые / скоростные тесты',lsi:'LSI'};
 const missing=issues.filter(i=>i.kind==='missing').map(i=>labels[i.source] || (i.source?i.source:i.text)),stale=issues.filter(i=>i.kind==='stale').map(i=>labels[i.source] || (i.source?i.source:i.text));
 return [missing.length?'Нет: '+[...new Set(missing)].join(', '):'',stale.length?'Устарело: '+[...new Set(stale)].join(', '):'',...issues.filter(i=>!['missing','stale','updating'].includes(i.kind)).map(i=>i.text)].filter(Boolean).join(' · ');
}
export function loadDayPresentation(player,date){
 const evidence=player.evidenceByDay?.[date],execution=player.executionByDay?.[date],missing=player.factFieldsByDay?.[date]?.missing || {};
 const noSession=evidence?.source==='no_session',stale=evidence?.supplementStatus==='stale';
 const actual=Number(player.byDay?.[date]) || 0;
 const waiting=!noSession && execution?.completed===false && !execution.started && !(execution.completedSets>0) && !(actual>0);
 const gap=!noSession && (stale || !waiting && (evidence?.source==='missing' || evidence?.partial || Object.values(missing).some(v=>v>0)));
 const known=!noSession && !!evidence && evidence.source!=='missing' && !stale && (actual>0 || !evidence.partial && (execution?.completed || execution?.completedSets>0));
 return {waiting,gap,known,stale};
}
export function recordedTotal(player,dates=[]){return dates.some(date=>loadDayPresentation(player,date).known);}
export function weekBudgetCoverage(athletes=[]){
 const valid=athletes.filter(a=>a.budget?.status!=='calibrating' && (a.budget?.sets>0 || a.budget?.tonnage>0));
 return 'Персональная база: '+valid.length+' из '+athletes.length+' игроков';
}
export function progressionSummary(proposal){
 const text=String(proposal?.decision || '');
 // Only these exact repetitive explanations may fold. Any individual/clinical text stays visible.
 const generic=/^(?:Вес подобрать подводящими подходами по технике и усилию; точные кг заранее не назначены\.|Без отягощения; только разрешённая комфортная амплитуда\.) RPE [0-9–—. ,]+; без отказа\. Сопоставимой фактической истории для этого упражнения нет; вес другой вариации не переносить\. При ухудшении техники или усилии выше цели снизить вес; автоматически не повышать\.$/;
 return generic.test(text)?text.startsWith('Без отягощения')?'Без отягощения · комфортная амплитуда · без автоматической прибавки':'Подбор по RPE · нет сопоставимого веса · без автоматической прибавки':null;
}
