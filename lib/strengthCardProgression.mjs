import {canonicalExerciseId} from './exerciseIdentity.mjs';
import {loadUnitsForExercise} from './tonnage.js';
export const strengthProgressionKey=ex=>JSON.stringify([ex.code || '',canonicalExerciseId(ex.name),loadUnitsForExercise(ex)]);
export const strengthCardBasis=ex=>JSON.stringify([strengthProgressionKey(ex),ex.targetSets || [],ex.targetRpeMax ?? null,!!ex.symptomAdapted,ex.weightKg ?? null,ex.weightNote || '']);
export const strengthProgressionScope=input=>JSON.stringify([input.workspace,String(input.playerId),input.date,input.focus,input.strengthMode || 'maintenance',input.trainingType || 'full_body']);
export function strengthCardProposals(exercises,preview,scope,{checkedAt=new Date().toISOString(),blocking=false}={}){
 const selected=(preview?.blocks || []).flatMap(block=>block.exercises || []),result={};
 for(const ex of exercises){
  const match=selected.find(next=>strengthProgressionKey(next)===strengthProgressionKey(ex)),evidence=match?.loadEvidence,proposal=match?.loadProgression;
  const sameDose=match && !!match.symptomAdapted===!!ex.symptomAdapted && match.targetRpeMax===ex.targetRpeMax && match.targetSets?.length===ex.targetSets?.length;
  const sameTargets=match && match.targetSets?.every((target,i)=>String(target)===String(ex.targetSets?.[i]));
  const repIncrease=proposal?.action==='increase_reps' && match?.targetSets?.every((target,i)=>{const a=/^(\d+)(\/side)?$/.exec(String(ex.targetSets?.[i])),b=/^(\d+)(\/side)?$/.exec(String(target));return a && b && a[2]===b[2] && Number(b[1])===Number(a[1])+1;});
  const applicable=!!(!blocking && sameDose && (sameTargets || repIncrease) && !match?.symptomAdapted && Number(match?.weightKg)>0);
  result[strengthProgressionKey(ex)]={engine:'strength-generator-v2',basis:strengthCardBasis(ex),scope,checkedAt,applicable,
   evidenceName:match?.name || null,evidenceSets:evidence?.loggedSets || [],evidenceUnits:evidence?.loadUnits || null,evidencePerSide:evidence?.repEvidence?.perSide ?? null,kg:evidence?.observedKg ?? null,rpe:evidence?.rpeScope==='exercise'?evidence.rpe:null,rpeScope:evidence?.rpeScope || null,sourceDate:evidence?.date || null,pain:!!evidence?.pain,
   suggestedKg:applicable?match.weightKg:null,action:proposal?.action || 'rpe_only',targetSets:applicable?match.targetSets:null,weightNote:applicable?match.weightNote:null,loadEvidence:applicable?evidence:null,loadProgression:applicable?proposal:null,
   decision:blocking?'Программа требует проверки допуска; автоматическое применение нагрузки недоступно.':!match?'Генератор выбирает другой вариант упражнения. Перегенерируйте программу или подберите вес вручную по RPE.':!sameDose || !sameTargets && !repIncrease?'Доза или задание изменились. Перегенерируйте программу; старая подсказка не применяется.':proposal?.reason || match.weightNote || 'Подбор по целевому RPE без автоматической прибавки.',
  };
 }
 return result;
}
export function applyStrengthCardProposal(ex,proposal,scope,now=Date.now()){
 const checked=Date.parse(proposal?.checkedAt);
 if(!Number.isFinite(checked) || !Number.isFinite(now) || !Array.isArray(proposal?.targetSets))return ex;
 if(proposal?.engine!=='strength-generator-v2' || !proposal.applicable || proposal.scope!==scope || proposal.basis!==strengthCardBasis(ex) || !(proposal.suggestedKg>0) || proposal.pain || now-checked<0 || now-checked>300000)return ex;
 return {...ex,weightKg:proposal.suggestedKg,weightNote:proposal.weightNote,targetSets:[...proposal.targetSets],loadEvidence:proposal.loadEvidence,loadProgression:proposal.loadProgression};
}
