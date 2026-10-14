// Browser work copies contain planned session edits only. No server publication or facts.
export const WORK_COPY_TTL=7*86400000;
export function workCopyKey({workspace,playerId,date,queueId='',batchId=''}){return 'gym-program-work-v1:'+JSON.stringify([workspace,String(playerId),date,queueId,batchId]);}
export function workCopyBasis(record){return JSON.stringify([record?.date,record?.savedAt || '',record?.teamDraft?.version || '',record?.session]);}
export function recoverableWorkCopy(copy,basis,now=Date.now()){return !!copy && copy.basis===basis && Number.isFinite(copy.at) && now>=copy.at && now-copy.at<=WORK_COPY_TTL && Array.isArray(copy.session?.blocks);}
export function rpePresentation(ex={}){
 const match=String(ex.weightNote || '').match(/RPE\s*[≤<]?\s*(\d+(?:[.,]\d+)?)(?:\s*[–—-]\s*(\d+(?:[.,]\d+)?))?/i);
 const note=match?match[1]+(match[2]?'–'+match[2]:''):'';
 return {value:ex.targetRpeMax ?? '',note,conflict:ex.targetRpeMax!=null && !!match && Number((match[2] || match[1]).replace(',','.'))!==Number(ex.targetRpeMax)};
}
export function plannedRpePatch(ex,value){
 const target=value==='' || value==null?null:Number(value);
 const note=String(ex.weightNote || '');
 // A deliberate edit synchronizes an existing textual RPE. Loading never rewrites it.
 return {targetRpeMax:target,weightNote:target!=null && Number.isFinite(target) && target>=1 && target<=10?note.replace(/RPE\s*[≤<]?\s*\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?/ig,`RPE ≤ ${target}`):note};
}
export function plannedInputIssues(session){
 const issues=[];
 for(const [bi,b] of (session?.blocks || []).entries())for(const [ei,e] of (b.exercises || []).entries()){
  const code=e.code || `${b.label || bi+1}.${ei+1}`,add=(field,message)=>issues.push({bi,ei,code,field,message});
  if(e.targetRpeMax!=null && (!Number.isFinite(Number(e.targetRpeMax)) || Number(e.targetRpeMax)<1 || Number(e.targetRpeMax)>10))add('целевой RPE упражнения','RPE должен быть от 1 до 10.');
  if(e.weightKg!=null && (!Number.isFinite(Number(e.weightKg)) || Number(e.weightKg)<0))add('плановый вес в кг','Вес должен быть числом не меньше нуля.');
  if(!String(e.name || '').trim())add('название упражнения','Укажите название упражнения.');
  if(!e.targetSets?.length)add('повторы всем подходам','Добавьте хотя бы один подход.');
  (e.targetSets || []).forEach((s,i)=>{if(!String(s).trim() || /^(?:-|-?0(?:[.,]0+)?(?:\s|\/|$))/.test(String(s).trim()) || /^(?:sec|сек|m|м|\/side)(?:\/side)?$/.test(String(s).trim()))add(`подход ${i+1} · повторы или время`,'Укажите положительное задание подхода.');});
 }
 return issues;
}
