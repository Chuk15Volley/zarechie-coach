// Planned values only; no athlete evidence, dose or kg conversion is inferred.
export function plannedWeightPatch(exercise, value) {
 const kg=value==null || value===''?null:Number(String(value).replace(',','.'));
 if(kg!==null && (!Number.isFinite(kg) || kg<0))return {};
 const original=String(exercise?.weightNote || '').trim();
 const pattern=/\d+(?:[.,]\d+)?\s*(?:кг|kg)(?![a-zа-я])/i;
 let note;
 if(kg===null)note=/^\d+(?:[.,]\d+)?$/.test(original)?'':original.replace(pattern,'').replace(/^[\s·,;]+|[\s·,;]+$/g,'');
 else note=pattern.test(original)?original.replace(pattern,`${kg} кг`):!original || /^\d+(?:[.,]\d+)?$/.test(original)?`${kg} кг`:`${kg} кг · ${original}`;
 return {weightKg:kg,weightNote:note};
}
export function plannedSetParts(value){
 const raw=String(value || ''),match=raw.match(/^(\d*(?:[.,]\d*)?)(\s*(?:sec|s|сек|с|m|м))?(\s*\/\s*(?:side|сторону))?$/i);
 if(!match)return {value:raw,unit:'custom'};
 const seconds=/sec|s|сек|с/i.test(match[2] || '');
 return {value:match[1],unit:(seconds?'sec':match[2]?'m':'reps')+(match[3]?'/side':'')};
}
export function formatPlannedSet(value,unit){return String(value).trim()+(unit==='custom'?'':unit.startsWith('sec')?' sec'+(unit.endsWith('/side')?'/side':''):unit.startsWith('m')?' m'+(unit.endsWith('/side')?'/side':''):unit.endsWith('/side')?'/side':'');}
export function repeatedPlannedSets(sets,value,unit='preserve') {
 const raw=String(value).trim();
 if(!raw)return sets;
 return sets.map(set=>unit==='preserve' && /^\d+(?:[.,]\d+)?$/.test(raw)?formatPlannedSet(raw,plannedSetParts(set).unit):unit==='preserve'?raw:formatPlannedSet(raw,unit));
}
