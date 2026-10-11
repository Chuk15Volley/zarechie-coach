import {hasLateralMovementFromC,isLateralStrengthMovement} from './strengthLateralVector.mjs';
import { prehabSymptoms } from './prehabMethodology.mjs';
import { varietyExerciseKey } from './exerciseVariety.mjs';
import { normalizeStrengthExecution } from './strengthExecution.mjs';
import { buildInSeasonStrengthContext, inSeasonStrengthDoseProfile } from './inSeasonStrength.mjs';
import { assessSessionQuality } from './sessionValidator.js';
import { buildExerciseVarietyContext } from './exerciseVariety.mjs';
import { hasRestriction } from './exerciseRestrictions.js';
import { normalizeSessionTempoDescriptions } from './tempoDescription.mjs';

// A reviewed catalogue: deterministic selection stays on the gym server.
// No player health information is sent to a model by this development path.
const catalogue = {
 lower: [
 ['Trap Bar Deadlift','Стопы устойчивы внутри грифа; спина нейтральная. Подниматься без рывка, выпрямляя таз и колени вместе.'],
 ['DB Romanian Deadlift','Гантели близко к ногам, колени слегка согнуты. Отводить таз назад до сохранения нейтральной спины, затем выпрямиться.'],
 ['Barbell Hip Thrust','Верх спины на устойчивой скамье, гриф с мягкой накладкой на тазу. Поднять таз до линии плечи–таз–колени без прогиба поясницы.'],
 ['Goblet Squat','Гантель у груди, стопы полностью на полу. Приседать в контролируемую глубину, направляя колени по стопам.'],
 ['Landmine Squat','Конец грифа удерживать у груди; крепление надёжно зафиксировано. Опускаться с устойчивыми стопами и нейтральным корпусом.'],
 ],
 press: [
 ['DB Bench Press','Лопатки устойчивы на скамье, стопы на полу. Опускать гантели без чрезмерного разведения локтей, выжимать без потери позиции.'],
 ['DB Incline Bench Press','Спинка скамьи под небольшим углом, стопы устойчивы. Опускать гантели в комфортную амплитуду, не поднимать плечи к ушам.'],
 ['Push-Up','Ладони под плечами, корпус прямой. Опускать грудь между ладонями без провисания таза, затем выпрямить руки.'],
 ],
 row: [
 ['Inverted Row','Гриф надёжно закреплён на стойке. Корпус прямой, пятки на полу; подтянуть грудь к грифу без рывка. Высотой грифа подобрать посильную нагрузку.'],
 ['Chest-Supported DB Row','Грудь на наклонной скамье, шея нейтральная. Тянуть гантели к рёбрам без рывка и разгибания поясницы.'],
 ['One-Arm DB Row (Bench Supported)','Ладонь и колено на скамье, спина нейтральная. Тянуть гантель к бедру, не разворачивая таз; выполнить обе стороны.'],
 ],
 knee: [
 ['DB Lateral Lunge','Гантели у боков, сделать контролируемый шаг в сторону. Согнуть опорное колено по линии стопы, таз отвести назад; вернуться без рывка, выполнить обе стороны.'],
 ['Goblet Lateral Lunge','Одна гантель у груди, шагнуть в сторону в комфортную ширину. Сохранять полную опору стопы и контроль колена, вернуться плавно; выполнить обе стороны.'],
 ['DB Lateral Step-Up','Встать боком к невысокой устойчивой платформе, поставить всю стопу на неё. Подняться без толчка нижней ногой и без завала таза, спуститься под контролем; выполнить обе стороны.'],
 ['DB Reverse Lunge','Сделать контролируемый шаг назад, передняя стопа полностью на полу. Опускаться без завала колена внутрь; выполнить обе стороны.'],
 ['DB Split Squat','Стопы на двух параллельных линиях, таз направлен вперёд. Опускаться вертикально с устойчивой передней стопой; выполнить обе стороны.'],
 ['DB Step-Up','Невысокая устойчивая платформа, вся стопа на ней. Подняться усилием верхней ноги без толчка нижней, спуститься под контролем.'],
 ['Rear-Foot-Elevated DB Split Squat','Задняя стопа на невысокой устойчивой опоре. Сохранять ровный таз и контроль переднего колена; выполнить обе стороны.'],
 ],
 hinge: [
 ['Single-Leg DB Romanian Deadlift','Опорное колено слегка согнуто, таз ровный. Отводить свободную ногу назад с наклоном от таза; выполнить обе стороны.'],
 ['Kickstand DB Romanian Deadlift','Основная опора на передней ноге, задний носок помогает балансу. Отвести таз назад без поворота корпуса; выполнить обе стороны.'],
 ],
 posterior: [
 ['Machine Hamstring Curl','Ось тренажёра совместить с осью колена, таз фиксирован. Сгибать ноги без рывка, возвращать вес под контролем.'],
 ['Swiss Ball Hamstring Curl','Пятки на мяче, таз приподнят без прогиба поясницы. Подкатить мяч сгибанием коленей, затем плавно выпрямить ноги.'],
 ['Slider Leg Curl','Пятки на скользящих дисках, таз удерживать без прогиба. Плавно выпрямлять и сгибать колени в контролируемой амплитуде.'],
 ['45-Degree Back Extension','Край опоры ниже сгиба таза, спина нейтральная. Двигаться от тазобедренных суставов, подниматься до линии тела без переразгибания.'],
 ],
 core: [
 ['Pallof Press','Резинка или трос закреплены сбоку, таз и рёбра неподвижны. Выпрямлять руки перед собой без разворота корпуса; выполнить обе стороны.'],
 ['Dead Bug Core','Лёжа на спине, поясница сохраняет нейтральную позицию. Поочерёдно удлинять противоположные руку и ногу без прогиба.'],
 ['Side Plank','Локоть под плечом, таз на линии корпуса. Удерживать положение с ровным дыханием; выполнить обе стороны.'],
 ['Suitcase Carry','Один снаряд сбоку, корпус вертикален. Идти короткими устойчивыми шагами без бокового наклона; выполнить обе стороны.'],
 ],
 shoulder: [
 ['Cable External Rotation','Локоть у корпуса, плечо неподвижно. Повернуть предплечье наружу без рывка и разворота туловища; выполнить обе стороны.'],
 ['Chest-Supported Prone T Raise','Грудь на скамье, руки в стороны с мягкими локтями. Поднимать лёгкие гантели без подъёма плеч и прогиба поясницы.'],
 ['Cable Face Pull','Трос на уровне лица, корпус устойчив. Тянуть канат к лицу с разведением кистей без подъёма плеч.'],
 ],
 adductor: [
 ['Side-Lying Adductor Raise','Лёжа на боку, верхняя нога на опоре впереди. Поднимать нижнюю ногу без поворота таза; выполнить обе стороны.'],
 ['Standing Band Hip Adduction','Резинка надёжно закреплена сбоку, ладонь на устойчивой опоре. Привести ногу к средней линии без движения таза; выполнить обе стороны.'],
 ],
 balance: [
 ['Supported Single-Leg Balance','Рядом устойчивая опора, глаза открыты. Стоять на одной ноге без завала таза, мягко помогая рукой; выполнить обе стороны.'],
 ['Supported Tandem Balance','Стопы одна перед другой рядом с устойчивой опорой. Удерживать ровный таз с открытыми глазами; сменить ведущую ногу.'],
 ],
 lateralPrehab: [
 ['Standing Band Hip Adduction','Резинка надёжно закреплена сбоку, ладонь на устойчивой опоре. Привести ногу к средней линии без движения таза; выполнить обе стороны.'],
 ['Standing Band Hip Abduction','Резинка закреплена сбоку, ладонь на устойчивой опоре. Отвести ногу в сторону без наклона корпуса и поворота таза; выполнить обе стороны.'],
 ['Side-Lying Adductor Raise','Лёжа на боку, верхняя нога на опоре впереди. Плавно поднимать нижнюю ногу без поворота таза; выполнить обе стороны.'],
 ],
 lowerPrehab: [
 ['Seated Soleus Calf Raise','Сидя, колени примерно 90°, передняя часть стопы на опоре. Плавно поднять пятки и опустить их без пружинящего движения.'],
 ['Standing Calf Raise','Руки на устойчивой опоре, колени мягкие. Плавно подняться на носки и опустить пятки без подпрыгивания.'],
 ['Wall Tibialis Raise','Спина опирается на стену, пятки на полу. Поднимать переднюю часть стоп без отрыва пяток и рывка.'],
 ['Side-Lying Hip Adduction','Лёжа на боку, верхняя нога на опоре впереди. Поднимать нижнюю ногу без поворота таза; выполнить обе стороны.'],
 ],
};

export function buildStrengthDevelopmentDraft({ snapshot, recommendation, date, dayGoal='', recentSessions=[], actualHistory=[], playerRestrictions=[], coachRecovery='green', manualMethodSelection=false, sourceState=null, trainingType='full_body' }) {
 trainingType=['anterior_chain','posterior_chain'].includes(trainingType)?trainingType:'full_body';
 const context=buildInSeasonStrengthContext({focus:'inseason_strength',requestedMode:'development',targetDate:date,trainingType,lateralVector:true,position:snapshot.player?.position,calendar:recommendation?.calendar,recoveryStatus:coachRecovery,actualHistory});
 const symptoms = manualMethodSelection ? prehabSymptoms(snapshot, sourceState || recommendation?.state || {}, date, [], {hip:/пах|тазобедр|groin|hip/i}) : {zones:[]};
 const adaptedCodes = [];
 const varietyContext=buildExerciseVarietyContext(recentSessions,{targetDate:date,focus:'inseason_strength',trainingType});
 const excluded=new Set(varietyContext.recent.map(entry=>entry.key));
 const used=new Set();
 function selectOption(options, code, permitted = () => true) {
  return options.find(([name])=>!used.has(varietyExerciseKey(name))&&!excluded.has(varietyExerciseKey(name))&&!hasRestriction(name,playerRestrictions)&&permitted(name));
 }
 // Symptoms are not diagnoses: affected patterns are unloaded movement trials,
 // reviewed by the coach. Healthy patterns retain the selected strength method.
 const trials = {
  lower:[['Supine Heel Slide','Лёжа на спине, медленно скользить пяткой к тазу. Работать только в безболезненной амплитуде без давления на стопу.']],
  press:[['Supported Shoulder Flexion','Предплечья на столе, плавно скользить руками вперёд. Остановиться до появления боли, не поднимать плечи к ушам.']],
  row:[['Seated Scapular Retraction','Сидя с опорой спины, мягко свести лопатки. Не тянуть руки назад и не преодолевать боль.']],
  knee:[['Supine Hip Abduction','Лёжа на спине, скользить прямой ногой в сторону. Сохранять таз неподвижным и безболезненную амплитуду.']],
  hinge:[['Prone Glute Set','Лёжа на животе, мягко напрячь ягодицы без движения таза. Дышать свободно, прекращать при дискомфорте.']],
  posterior:[['Supine Glute Set','Лёжа на спине, мягко напрячь ягодицы без подъёма таза. Сохранять свободное дыхание, прекращать при дискомфорте.']],
  core:[['Supine Diaphragmatic Breathing','Лёжа на спине с опорой под коленями, спокойно вдохнуть. На выдохе мягко контролировать рёбра без напряжения поясницы.']],
  shoulder:[['Seated Supported Shoulder Rotation','Сидя с опорой спины, положить предплечье на стол. Мягко повернуть предплечье наружу в малой безболезненной амплитуде.']],
  balance:[['Seated Foot Tripod','Сидя, поставить стопу на пол без дополнительного давления. Мягко ощущать три точки опоры, не поджимая пальцы.']],
  lowerPrehab:[['Seated Ankle Circles','Сидя, держать стопу свободно без опоры на неё. Выполнять малые плавные круги только без боли.']],
  adductor:[['Supine Bent-Knee Fallout','Лёжа на спине, стопы на полу, колени согнуты. Мягко отвести одно колено в сторону без поворота таза и боли.']],
 };
 trials.lower.push(['Seated Knee Extension Unloaded','Сидя с опорой спины, плавно разогнуть колено без веса. Стопа свободна; остановиться до боли.'],['Supine Bent-Knee March','Лёжа на спине, поочерёдно слегка поднимать согнутое колено без опоры на стопу. Таз неподвижен, движение только без боли.']);
 trials.hinge.push(['Side-Lying Clamshell Unloaded','Лёжа на боку, колени согнуты, стопы вместе. Мягко открыть верхнее колено без поворота таза и без резинки; остановиться при дискомфорте.'],['Side-Lying Hip Abduction Unloaded','Лёжа на боку, нижняя нога согнута. Плавно приподнять верхнюю ногу без веса и поворота таза, только без боли.']);
 trials.balance.push(['Seated Toe Spread Unloaded','Сидя, стопа свободна без давления на пол. Мягко развести пальцы без резинки и боли, затем расслабить.']);
 trials.knee.push(['Supine Short-Arc Knee Extension','Лёжа на спине, колено на мягком валике. Плавно выпрямить голень без веса и давления на стопу, только без боли.']);
 trials.lowerPrehab.push(['Seated Ankle Dorsiflexion Unloaded','Сидя, держать стопу свободно над полом. Плавно подтянуть носок к себе без резинки, только в комфортной амплитуде.'],['Seated Ankle Eversion Unloaded','Сидя с опорой спины, стопа свободна. Мягко повернуть подошву наружу без веса и движения колена; остановиться при боли.']);
 trials.lateralPrehab=[['Supine Hip Abduction','Лёжа на спине, плавно скользить ногой в сторону без веса. Сохранять таз неподвижным, работать только в безболезненной амплитуде.'],...trials.hinge.filter(([name])=>/Hip Abduction/.test(name))];
 trials.hinge.reverse();
 const regions={lower:['hip','back','knee','ankle','achilles'],press:['shoulder'],row:['shoulder'],knee:['hip','back','knee','ankle','achilles'],hinge:['hip','back','ankle','achilles'],posterior:['hip','back','knee'],core:['back','shoulder'],shoulder:['shoulder'],balance:['ankle','achilles'],lowerPrehab:['ankle','achilles'],adductor:['hip'],lateralPrehab:['hip','back','knee','ankle','achilles']};
 function choose(family,code,reps){
  if (symptoms.zones.some(zone=>regions[family]?.includes(zone))) {
   const trial=selectOption(trials[family],code);
   if(!trial)throw new Error(`Нет безопасной новой региональной замены для ${code}; требуется подбор тренером.`);
   used.add(varietyExerciseKey(trial[0]));adaptedCodes.push(code);
   const unilateral=/side.?lying|hip abduction|hip adduction|knee extension|knee march/i.test(trial[0]);
   const target = unilateral || !['core','posterior','hinge','row'].includes(family) ? '6/side' : '6';
   return {code,name:trial[0],cue:trial[1],targetSets:[target,target],tempo:'2-0-2-0',weightNote:'Без отягощения; RPE 2–4. Только безболезненная проба движения после проверки тренером.',symptomAdapted:true,autoReg:'Боль или усиление симптомов — остановить упражнение; подобрать замену с тренером.',alternatives:[],loadUnits:1};
  }

  const options=family==='lower' && trainingType!=='full_body'
   ? catalogue.lower.filter(([name])=>trainingType==='anterior_chain' ? /squat/i.test(name) : /deadlift|hip thrust/i.test(name))
   : catalogue[family];
  const option=selectOption(options,code,()=>!(family === 'press' && playerRestrictions.includes('SHOULDER')));
  if(!option)throw new Error(`Нет безопасной новой вариации для ${code}; требуется подбор тренером.`);
  used.add(varietyExerciseKey(option[0]));
  if (/one-arm.*row/i.test(option[0])) reps='5/side';
  if (code === 'E1' && family === 'shoulder' && !/rotation/i.test(option[0])) reps='10';
  if (family === 'adductor' || family === 'lateralPrehab') reps='8/side';
  if (family === 'shoulder' && /rotation/i.test(option[0])) reps='8/side';
  if (family === 'lowerPrehab' && !/side-lying/i.test(option[0])) reps='10';
  return {code,name:option[0],cue:option[1],targetSets:[reps,reps],tempo:'2-0-X-0',weightNote:family === 'balance' ? 'Без отягощения; лёгкий контроль положения.' : 'Вес по текущему RPE, без отказа.',autoReg:'Новая или усилившаяся боль, потеря позиции или RPE > 8 — остановить подход.',alternatives:[],loadUnits:/\bDB\b/.test(option[0]) && !/one-arm|single-leg|goblet|single[ -]arm/i.test(option[0])?2:1};
 }
 const a=choose('lower','A1','4');
 const hinge=/deadlift|hip thrust/i.test(a.name);
 const core=choose('core','D2','8/side');if(/plank/i.test(core.name))core.targetSets=['25 sec/side','25 sec/side'];if(/carry/i.test(core.name))core.targetSets=['25 sec/side','25 sec/side'];
 const c1=choose(hinge?'knee':'hinge','C1','5/side');
 const lateralInC=isLateralStrengthMovement(c1);
 const e1=choose(context.positionGroup === 'libero'?'adductor':'shoulder','E1','10/side');
 const e2=choose(!lateralInC && !symptoms.zones.includes('hip')?'lateralPrehab':['libero','setter'].includes(context.positionGroup)?'balance':context.positionGroup==='outside'?'adductor':'lowerPrehab','E2',['libero','setter'].includes(context.positionGroup)?'25 sec/side':'10/side');
 let session={kind:'strength_training_draft',blocks:[{label:'A',exercises:[a]},{label:'B',exercises:[choose('press','B1','5'),choose('row','B2','5')]},{label:'C',exercises:[c1]},{label:'D',exercises:[choose('posterior','D1','8'),core]},{label:'E',exercises:[e1,e2]}],assessment:'Развивающая силовая с контролем утомления перед вечерней площадкой. Перед выполнением обновить сведения ReadySix; новая боль требует адаптации.'};
 session=normalizeSessionTempoDescriptions(normalizeStrengthExecution(session,'inseason_strength',context));
 session.methodology.selection='reviewed_catalogue_server_only';
 session.methodology.trainingType=trainingType;
 session.methodology.lateralVectorFromBlock='C';
 if(!hasLateralMovementFromC(session))session.methodology.lateralVectorDeferred='Нет безопасного нового латерального движения; подбор тренером с учётом симптомов и запретов.';
 session.methodology.rotationHistoryDates=varietyContext.historyDates;
 const quality=assessSessionQuality(session,{focus:'inseason_strength',trainingType,playerRestrictions,dosePrescription:inSeasonStrengthDoseProfile(context),varietyContext});
 quality.readySixState = sourceState || recommendation?.state || null;
 session.methodology.manualMethodSelection = manualMethodSelection;
 if(session.methodology.lateralVectorDeferred) {
  session.warnings=session.methodology.lateralVectorDeferred;
  quality.warnings.push(session.methodology.lateralVectorDeferred);
  quality.medicalReviewRequired=true;
  quality.medicalReviewReason=session.methodology.lateralVectorDeferred;
 }
 if (adaptedCodes.length) {
  session.methodology.regionalAdaptation = {codes:adaptedCodes,zones:symptoms.zones};
  const warning = 'Региональные замены по боли — без отягощения, только после проверки тренером. Здоровые двигательные задачи сохраняют силовую дозу; болезненные заменены пробами комфортного движения. Полной развивающей нагрузкой для затронутых областей этот план не является.';
  session.assessment = warning; session.warnings = [session.warnings,warning].filter(Boolean).join(" ");
  quality.medicalReviewRequired = true; quality.medicalReviewReason = warning;
 }

 return {session,quality,player:snapshot.player,date,dayGoal,focus:'inseason_strength',strengthMode:'development',trainingType,dataSummary:recommendation?.state?.detail||'',autoSaved:false,saveWarning:'Черновик готов для проверки и сохранения тренером.'};
}
