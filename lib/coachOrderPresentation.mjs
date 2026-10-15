// Coach-only presentation. No saved program or generation policy is rewritten.
import {techniqueQuality} from './exerciseReplacement.mjs';
export const commonWeightGuidance='Вес назначить индивидуально по фактической истории этого упражнения и текущей переносимости; вес другого игрока не переносится.';
export function previewWeightNote(note,shared=false){return shared?String(note || '').replace(commonWeightGuidance,'').trim():note;}
export function sharesWeightGuidance(session){return (session?.blocks || []).flatMap(b=>b.exercises || []).filter(ex=>String(ex.weightNote || '').includes(commonWeightGuidance)).length>1;}
export function coachTechniqueWarning(name,text=''){
 if(/^dead bug heel tap$/i.test(String(name).trim()) && !/пятк|heel/.test(String(text).toLowerCase()))return 'В названии — касание пяткой, а описание не уточняет этот вариант. Сверьте движение и видео; исходный текст сохранён.';
 return techniqueQuality(name,text);
}
export function coachCount(value,forms=['подход','подхода','подходов']){const n=Number(value),a=Math.abs(n)%100,b=a%10;return `${n.toLocaleString('ru-RU')} ${forms[a>=11 && a<=14?2:b===1?0:b>=2 && b<=4?1:2]}`;}
export function liveCommandValid(type,text,replacement){return type==='message'?!!String(text || '').trim():type==='replace_exercise'?!!String(replacement || '').trim():true;}
export function exactWarmupNames(exercise){return [...new Set([exercise?.name,exercise?.nameEn].map(v=>String(v || '').trim()).filter(Boolean))];}
export function firstMissingFact(rows=[],field){for(const row of rows){if(row.fields){const found=row.fields.find(f=>!field || f.field===field);if(found)return found;}for(const set of row.sets || []){for(const type of ['kg','reps'])if((!field || field===type) && set[type==='kg'?'missingKg':'missingReps'])return {exercise:row.exercise,set:set.set,field:type};}if((!field || field==='rpe') && row.missingRpe)return {exercise:row.exercise,set:null,field:'rpe'};}return {};}

export function exactWarmupVideo(names,cards){for(const name of names){const card=cards.find(item=>String(item.title).trim().toLowerCase()===name.trim().toLowerCase());if(card?.video || card?.autoVideo)return card.video || card.autoVideo;}return null;}
