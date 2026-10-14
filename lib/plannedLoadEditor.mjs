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
export function repeatedPlannedSets(sets,value) {
 return String(value).trim()?sets.map(()=>String(value).trim()):sets;
}
