// Coach presentation only. Source facts and prescriptions remain untouched.
export function separateReadinessServiceReasons(reasons=[]) {
 return reasons.flatMap(reason=>{
  const text=String(reason);
  // Split only the known service suffix of a symptom; keep both fragments verbatim.
  const at=text.indexOf('Недостаточно данных:');
  return /^Боль\s/.test(text) && at>0?[text.slice(0,at).trimEnd(),text.slice(at)]:[text];
 });
}
export function commonPlannedRepeat(sets,parts) {
 if(sets.length<2)return '';
 const first=parts(sets[0]);
 return sets.every(set=>{const part=parts(set);return part.value===first.value && part.unit===first.unit;})?first.value:'';
}
export function samePlannedSets(before,after) {
 return before.length===after.length && before.every((set,index)=>set===after[index]);
}
export function conciseFactText(text) {
 return text==='Факт ещё не записан'?'Факт: ожидается':text==='Нет факта'?'Факт: не записан':/^\d/.test(text)?`Факт: ${text}`:text;
}
