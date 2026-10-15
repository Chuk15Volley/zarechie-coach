import {buildGenerationInputs} from '../pages/api/programs/generate';
import {strengthCardProposals,strengthProgressionScope} from './strengthCardProgression.mjs';
import {enforceRateLimit} from './rateLimit';
import {validWorkspace} from './teamQueue.mjs';
import {validCoachDate} from './coachAuditQuery.mjs';
// No separate load algorithm here: derive the cards from the same deterministic
// server catalogue and ReadySix/history/coach decisions used by generation.
export async function strengthProgressionReview(req,res){
 const input=req.body || {},{workspace='zarechie',playerId,date,exercises=[]}=input;
 if(!validWorkspace(workspace) || (input.strengthMode!=null && !['maintenance','development'].includes(input.strengthMode)) || (input.trainingType!=null && !['full_body','anterior_chain','posterior_chain'].includes(input.trainingType)) || typeof playerId!=='string' || !/^[\w-]{1,100}$/.test(playerId) || !validCoachDate(date) || !Array.isArray(exercises) || exercises.length>30 || exercises.some(ex=>!ex || typeof ex.name!=='string' || ex.name.length>180 || !Array.isArray(ex.targetSets) || ex.targetSets.length>20))return res.status(400).json({error:'Некорректные параметры силовой прогрессии.'});
 if(!await enforceRateLimit(req,res,{scope:'strength-card-progression',limit:120,windowSeconds:600}))return;
 try{
  const request={...input,workspace,playerId,focus:'inseason_strength',manualMethodSelection:true,autoSave:false};
  const inputs=await buildGenerationInputs(request,{strengthReviewExercises:exercises});
  if(inputs.error)return res.status(inputs.status || 503).json({error:inputs.error});
  const ready=inputs.readyResult;
  if(!ready?.session)return res.status(503).json({error:'Единый силовой подбор временно недоступен. Повторите проверку.'});
  const scope=strengthProgressionScope(request),checkedAt=new Date().toISOString();
  return res.status(200).json({engine:'strength-generator-v2',scope,checkedAt,progressionBySlot:strengthCardProposals(exercises,ready.session,scope,{checkedAt,blocking:!!ready.quality?.blocking || !!ready.quality?.medicalReviewRequired || !!ready.session.methodology?.medicalHold})});
 }catch{return res.status(503).json({error:'Не удалось проверить прогрессию по ReadySix и выполнению. Подсказки не применяются.'});}
}
