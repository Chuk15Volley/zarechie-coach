const fail=message=>{throw Object.assign(new Error(message),{status:409});};
// Coach edits never rewrite the clinical/methodology snapshot attached to generation.
export function correctedTeamSession(original,proposed){
 if(!original || !proposed || !Array.isArray(proposed.blocks) || JSON.stringify(proposed).length>500000)fail('Некорректный черновик');
 if(proposed.kind!==original.kind || JSON.stringify(proposed.methodology)!==JSON.stringify(original.methodology))fail('Методология и медицинское основание черновика защищены. При изменении контекста обновите подбор.');
 if(!proposed.blocks.length || proposed.blocks.length>12 || proposed.blocks.flatMap(b=>b.exercises || []).length>60)fail('Проверьте структуру и число упражнений');
 const blocks=proposed.blocks.map((block,bi)=>({...block,exercises:(block.exercises || []).map(ex=>{
  if(typeof ex.name!=='string' || !ex.name.trim() || ex.name.length>300 || !Array.isArray(ex.targetSets) || !ex.targetSets.length || ex.targetSets.length>20 || ex.targetSets.some(target=>typeof target!=='string' || target.length>60))fail('Проверьте название и рабочие подходы упражнения');
  if(ex.weightKg!=null && (!Number.isFinite(Number(ex.weightKg)) || Number(ex.weightKg)<0 || Number(ex.weightKg)>1000))fail('Проверьте рабочий вес');
  const old=(original.blocks?.[bi]?.exercises || []).find(item=>item.code && item.code===ex.code);
  if(old?.symptomAdapted && (!ex.symptomAdapted || Number(ex.weightKg)>0))fail('Симптом-адаптированная задача остаётся без отягощения. Обновите исходный контекст перед сменой допуска.');
  return {...ex};
 })}));
 return {...original,blocks};
}
