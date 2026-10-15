import {searchableExercise} from './exerciseLibraryView.mjs';
// Coach display/discovery only: never normalize stored exercise identity or evidence.
export function programExerciseRows(blocks=[]){return blocks.flatMap((block,bi)=>(block.exercises || []).map((ex,ei)=>({bi,ei,code:ex.code || `${block.label}.${ei+1}`,name:ex.name || ''})));}
export function findProgramExercises(blocks,query){const q=searchableExercise(query);return programExerciseRows(blocks).filter(row=>searchableExercise(row.code+' '+row.name).includes(q));}
export function correctionCheckTargets(label,blocks=[]){
 return programExerciseRows(blocks).flatMap(row=>{const ex=blocks[row.bi].exercises[row.ei],main=/^[ABC]1\b/i.test(row.code),note=String(ex.weightNote || '').toLowerCase();
 if(label==='Вес/RPE' && main && ex.weightKg==null && !['rpe','вручную','вес тела','без отягощения'].some(word=>note.includes(word)))return [{...row,field:'плановый вес в кг'}];
 if(label==='Альтернативы' && (main && (ex.alternatives || []).length<2 || ['D','E'].includes(String(blocks[row.bi].label)) && ex.alternatives?.length))return [{...row,field:'замена'}];
 return [];
 });
}
export function isGenericCopyAssessment(text){return String(text || '').trim()==='Копия структуры программы для индивидуальной проверки тренером. Перед сохранением проверьте состояние ReadySix, ограничения, упражнения и дозировку получателя.';}
export const LIBRARY_VARIANTS=[['all','Все варианты'],['single','Одна опорная нога'],['supported','С опорой'],['hold','Удержание'],['dynamic','Без удержания']];
export function libraryVariantMatches(name,variant='all'){
 if(variant==='single')return /single[ -]?leg|\bsl\b/i.test(name);
 if(variant==='supported')return /supported|kickstand/i.test(name);
 if(variant==='hold')return /\biso(?:metric)?\b|\bhold\b/i.test(name);
 if(variant==='dynamic')return !/\biso(?:metric)?\b|\bhold\b/i.test(name);
 return true;
}
export function additionalSourceReasons(reasons,highlights,label){
 // Split only the exact sentences already displayed above; retain every new qualifier.
 return (reasons || []).filter(reason=>reason!==label).map(reason=>{let value=String(reason);for(const text of highlights || [])value=value.split(text).join('');return value.replace(/^[\s;,·]+|[\s;,·]+$/g,'').trim();}).filter(Boolean);
}
export function remainingQueueCount(queue){return (queue?.rows || []).filter(row=>!row.saved).length;}
export function performanceSearch(series,query){const words=searchableExercise(query).split(/\s+/).filter(Boolean);return series.filter(row=>{const text=searchableExercise(row.code+' '+row.name);return words.every(word=>text.includes(word));});}
export function progressionBasisLabel(record,dateLabel){
 const dates=(Array.isArray(record?.recentExposures)?record.recentExposures:[]).slice(-3).map(row=>row.date).filter(Boolean);
 const source=({planned:'плановый вес',player_feedback:'запись игрока',player:'запись игрока',coach:'запись тренера',coach_confirmed:'подтверждено тренером',actual:'фактическая запись'})[record?.source] || 'тип записи не указан';
 const stored=`Запись ${record?.date?dateLabel(record.date):'без даты'} · ${source}`;
 return stored+' · '+(dates.length?`История: ${dates.map(dateLabel).join(', ')}${record.completionPercent!=null?' · полнота последних '+dates.length+' записей '+record.completionPercent+'%':''}`:'Факт для рекомендации не передан; процент выполнения не подтверждён');
}
