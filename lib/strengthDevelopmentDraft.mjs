import {applyCycleDecision} from './strengthCycleDecisions.mjs';
import { STRENGTH_PRIORITIES, strengthPriorities, strengthReadySixLoad, STRENGTH_INDIVIDUAL_VERSION } from './strengthIndividualization.mjs';
import {buildStrengthCycle,isCycleAnchor} from './strengthCycle.mjs';
import {canonicalExerciseId} from './exerciseIdentity.mjs';
import {hasLateralMovementFromC,isLateralStrengthMovement} from './strengthLateralVector.mjs';
import { prehabSymptoms } from './prehabMethodology.mjs';
import { varietyExerciseKey } from './exerciseVariety.mjs';
import { normalizeStrengthExecution } from './strengthExecution.mjs';
import { STRENGTH_COHORT_EXPERIENCE, normalizeStrengthEquipment } from './strengthEquipment.mjs';
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
 ['Chest-Supported Neutral-Grip DB Row','Грудь на устойчивой наклонной скамье, ладони направлены друг к другу. Тянуть гантели к рёбрам без толчка ногами, рывка и разгибания поясницы.'],
 ['Chest-Supported Wide-Grip DB Row','Грудь на устойчивой наклонной скамье, локти немного отведены от корпуса. Тянуть гантели под контролем без толчка ногами и подъёма плеч к ушам.'],
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
 ['Swiss Ball Hamstring Curl','Пятки на мяче, таз приподнят без прогиба поясницы. Подкатить мяч сгибанием коленей, затем плавно выпрямить ноги.'],
 ['Slider Leg Curl','Пятки на скользящих дисках, таз удерживать без прогиба. Плавно выпрямлять и сгибать колени в контролируемой амплитуде.'],
 ['45-Degree Back Extension','Край опоры ниже сгиба таза, спина нейтральная. Двигаться от тазобедренных суставов, подниматься до линии тела без переразгибания.'],
 ],
 core: [
 ['Dead Bug Heel Tap','Лёжа на спине, удерживать согнутые ноги над тазом. Поочерёдно касаться пола пяткой без давления на стопу и прогиба поясницы.'],
 ['Supine Bent-Knee March Core','Лёжа на спине с согнутыми коленями, сохранять положение таза. Поочерёдно приподнимать согнутую ногу без толчка стопой и прогиба поясницы.'],
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
 ['Side-Lying Short-Lever Adductor Raise','Лёжа на боку, верхняя нога на опоре. Нижнее колено слегка согнуто; плавно поднимать нижнюю ногу без поворота таза, выполнить обе стороны.'],
 ['Supported Cable Hip Adduction','Трос надёжно закреплён у голени, ладонь на устойчивой опоре. Плавно привести ногу к средней линии без поворота таза; выполнить обе стороны.'],
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
 ['Single-Leg Supported Calf Raise','Ладони на устойчивой опоре, опорное колено мягкое. Плавно поднять и опустить пятку без пружины и перекоса стопы; выполнить обе стороны.'],
 ['Seated Single-Leg DB Soleus Calf Raise','Сидя, колено примерно 90°, гантель через мягкую накладку на нижней части бедра. Плавно поднять и опустить пятку; выполнить обе стороны.'],
 ['Seated Soleus Calf Raise','Сидя, колени примерно 90°, передняя часть стопы на опоре. Плавно поднять пятки и опустить их без пружинящего движения.'],
 ['Standing Calf Raise','Руки на устойчивой опоре, колени мягкие. Плавно подняться на носки и опустить пятки без подпрыгивания.'],
 ['Wall Tibialis Raise','Спина опирается на стену, пятки на полу. Поднимать переднюю часть стоп без отрыва пяток и рывка.'],
 ['Side-Lying Hip Adduction','Лёжа на боку, верхняя нога на опоре впереди. Поднимать нижнюю ногу без поворота таза; выполнить обе стороны.'],
 ],
};

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
 const regions={lower:['hip','back','knee','ankle','achilles'],press:['shoulder'],row:['shoulder'],knee:['hip','back','knee','ankle','achilles'],hinge:['hip','back','knee','ankle','achilles'],posterior:['hip','back','knee','ankle','achilles'],core:['back','shoulder'],shoulder:['shoulder'],balance:['ankle','achilles'],lowerPrehab:['ankle','achilles'],adductor:['hip'],lateralPrehab:['hip','back','knee','ankle','achilles']};

export function buildStrengthDevelopmentDraft({ snapshot, recommendation, date, dayGoal='', recentSessions=[], actualHistory=[], playerRestrictions=[], coachRecovery='green', manualMethodSelection=false, sourceState=null, trainingType='full_body', strengthMode='development', developmentPlan=null, equipment={}, cycleDecision=null }) {
 trainingType=['anterior_chain','posterior_chain'].includes(trainingType)?trainingType:'full_body';
 const cycle=applyCycleDecision(buildStrengthCycle(recentSessions,{targetDate:date,trainingType}),recentSessions,cycleDecision);
 const individual=strengthPriorities(developmentPlan,date);
 const externalLoad=strengthReadySixLoad(snapshot,date,recommendation?.calendar);
 const context=buildInSeasonStrengthContext({focus:'inseason_strength',requestedMode:strengthMode,strengthCycle:cycle,targetDate:date,trainingType,lateralVector:true,externalLoad,position:snapshot.player?.position,calendar:recommendation?.calendar,recoveryStatus:manualMethodSelection?'green':coachRecovery,actualHistory});
 context.strengthExperience=STRENGTH_COHORT_EXPERIENCE.value;
 context.strengthEquipment=normalizeStrengthEquipment(equipment);
 const symptoms = prehabSymptoms(snapshot, sourceState || recommendation?.state || {}, date, [], {hip:/пах|тазобедр|groin|hip/i,ankle:/икронож|икр[ауы]|calf|голеностоп|голен[ьи]|стоп[аыуе]|foot|shin|ankle/i,back:/спин|поясниц|позвоноч|шея|neck|back|lumbar|spine/i,shoulder:/плеч|shoulder/i});
 context.regionalZones=symptoms.zones;
 const adaptedCodes = [];
 const varietyContext=buildExerciseVarietyContext(recentSessions,{targetDate:date,focus:'inseason_strength',trainingType});
 varietyContext.strengthCycle=cycle;
 const excluded=new Set(varietyContext.recent.map(entry=>entry.key));
 const used=new Set();
 function selectOption(options, code, permitted = () => true) {
  const ranked=[...options].sort((a,b)=>(cycle.preferred.includes(b[0])?1:0)-(cycle.preferred.includes(a[0])?1:0));
  return ranked.find(([name])=>!cycle.avoid.includes(canonicalExerciseId(name))&&!used.has(varietyExerciseKey(name))&&(!excluded.has(varietyExerciseKey(name))||isCycleAnchor({name,code},cycle))&&!hasRestriction(name,playerRestrictions)&&permitted(name));
 }
 // Symptoms are not diagnoses: affected patterns are unloaded movement trials,
 // reviewed by the coach. Healthy patterns retain the selected strength method.
 function choose(family,code,reps){
  if (symptoms.zones.some(zone=>regions[family]?.includes(zone))) {
   const trial=selectOption(trials[family],code) || trials[family].find(([name])=>!used.has(varietyExerciseKey(name))&&!hasRestriction(name,playerRestrictions)&&!cycle.avoid.includes(canonicalExerciseId(name)));
   if(!trial)throw new Error(`Нет безопасной новой региональной замены для ${code}; требуется подбор тренером.`);
   used.add(varietyExerciseKey(trial[0]));adaptedCodes.push(code);
   const unilateral=/side.?lying|hip abduction|hip adduction|knee extension|knee march/i.test(trial[0]);
   const target = unilateral || !['core','posterior','hinge','row'].includes(family) ? '6/side' : '6';
   return {code,strengthFamily:family,name:trial[0],cue:trial[1],targetSets:[target,target],tempo:'2-0-2-0',weightNote:'Без отягощения; RPE 2–4. Только безболезненная проба движения после проверки тренером.',symptomAdapted:true,autoReg:'Боль или усиление симптомов — остановить упражнение; подобрать замену с тренером.',alternatives:[],loadUnits:1};
  }

  let options=family==='lower' && trainingType!=='full_body'
   ? catalogue.lower.filter(([name])=>trainingType==='anterior_chain' ? /squat/i.test(name) : /deadlift|hip thrust/i.test(name))
   : [...catalogue[family]];
  if(family==='lateralPrehab' && individual.priorities.includes('adductor')) options.sort((a,b)=>Number(/adduct/i.test(b[0]))-Number(/adduct/i.test(a[0])));
  if(family==='lowerPrehab' && individual.priorities.includes('calf')) options=options.filter(([name])=>/calf|soleus/i.test(name));
  if(family==='row' && symptoms.zones.some(zone=>['back','ankle','achilles'].includes(zone))) options=options.filter(([name])=>/chest.supported/i.test(name));
  if(family==='core' && symptoms.zones.some(zone=>['ankle','achilles'].includes(zone))) options=options.filter(([name])=>/dead bug|supine.*core/i.test(name));
  if(cycle.anchors[code]) options=[...options].sort((a,b)=>(b[0]===cycle.anchors[code].name?1:0)-(a[0]===cycle.anchors[code].name?1:0));
  const savedAnchor=cycle.anchors[code];
  if(savedAnchor && !cycle.decisionSeededCodes?.includes(code) && !(family==='row' && symptoms.zones.some(zone=>['back','ankle','achilles'].includes(zone))) && !(family==='core' && symptoms.zones.some(zone=>['ankle','achilles'].includes(zone))) && !options.some(([name])=>name===savedAnchor.name)) options.unshift([savedAnchor.name,savedAnchor.cue]);
  const anchorOption=options.find(([name])=>name===cycle.anchors[code]?.name&&!hasRestriction(name,playerRestrictions)&&!cycle.avoid.includes(canonicalExerciseId(name)));
  const option=anchorOption || selectOption(options,code,()=>!(family === 'press' && playerRestrictions.includes('SHOULDER')));
  if(!option)throw new Error(`Нет безопасной новой вариации для ${code}; требуется подбор тренером.`);
  used.add(varietyExerciseKey(option[0]));
  if (/one-arm.*row/i.test(option[0])) reps='5/side';
  if (code === 'E1' && family === 'shoulder' && !/rotation/i.test(option[0])) reps='10';
  if (family === 'adductor' || family === 'lateralPrehab') reps='8/side';
  if (family === 'shoulder' && /rotation/i.test(option[0])) reps='8/side';
  if (family === 'lowerPrehab') reps=/single-leg|seated db/i.test(option[0])?'10/side':!/side-lying/i.test(option[0])?'10':reps;
  return {code,strengthFamily:family,name:option[0],cue:option[1],targetSets:[reps,reps],tempo:'2-0-X-0',weightNote:family === 'balance' ? 'Без отягощения; лёгкий контроль положения.' : 'Вес по текущему RPE, без отказа.',autoReg:'Новая или усилившаяся боль, потеря позиции или RPE > 8 — остановить подход.',alternatives:[],loadUnits:/\bDB\b/.test(option[0]) && !/one-arm|single-leg|goblet|single[ -]arm/i.test(option[0])?2:1};
 }
 const a=choose('lower','A1','4');
 const hinge=/deadlift|hip thrust/i.test(a.name);
 const core=choose('core','D2','8/side');if(/plank/i.test(core.name))core.targetSets=['25 sec/side','25 sec/side'];if(/carry/i.test(core.name))core.targetSets=['25 sec/side','25 sec/side'];
 const c1=choose(hinge?'knee':'hinge','C1','5/side');
 const lateralInC=isLateralStrengthMovement(c1);
 const accessoryPriorities=individual.priorities.filter(key=>['shoulder','adductor','calf'].includes(key));
 const priorityFamily=key=>key==='calf'?'lowerPrehab':key;
 const e1=choose(priorityFamily(accessoryPriorities[0]) || (context.positionGroup === 'libero'?'adductor':'shoulder'),'E1','10/side');
 const e2Family=!lateralInC && !symptoms.zones.includes('hip')?'lateralPrehab':priorityFamily(accessoryPriorities[1]) || (['libero','setter'].includes(context.positionGroup)?'balance':context.positionGroup==='outside'?'adductor':'lowerPrehab');
 const e2=choose(e2Family,'E2',e2Family==='balance'?'25 sec/side':'10/side');
 let session={kind:'strength_training_draft',blocks:[{label:'A',exercises:[a]},{label:'B',exercises:[choose('press','B1','5'),choose('row','B2','5')]},{label:'C',exercises:[c1]},{label:'D',exercises:[choose('posterior','D1','8'),core]},{label:'E',exercises:[e1,e2]}],assessment:'Силовая с контролем утомления перед вечерней площадкой. Перед выполнением обновить сведения ReadySix; новая боль требует адаптации.'};
 if(strengthMode==='maintenance') {
  const [a,b,c,d,e]=session.blocks;
  session.blocks=[a,b,{label:'C',exercises:[...c.exercises,{...d.exercises[0],code:'C2'}]},{label:'D',exercises:[{...d.exercises[1],code:'D1'},...e.exercises.map((ex,i)=>({...ex,code:'D'+(i+2)}))]}];
 }
 session=normalizeSessionTempoDescriptions(normalizeStrengthExecution(session,'inseason_strength',context));
 session.methodology.selection='reviewed_catalogue_server_only';
 if(cycle.coachDecision)session.methodology.coachCycleDecision=cycle.coachDecision;
 session.methodology.individualizationVersion=STRENGTH_INDIVIDUAL_VERSION;
 session.methodology.externalLoad=externalLoad;
 session.methodology.strengthExperience=context.strengthExperience;
 session.methodology.strengthExperienceBasis=STRENGTH_COHORT_EXPERIENCE;
 session.methodology.equipmentPolicy='workspace_available_weights_v1';
 const taskFamilies={posterior:['posterior'],unilateral:['knee','hinge'],core:['core'],shoulder:['shoulder'],adductor:['adductor'],calf:['lowerPrehab']};
 const all=session.blocks.flatMap(block=>block.exercises);
 if(cycle.coachDecision) {
  session.methodology.coachCycleDecisionEffects=cycle.coachDecision.entries.map(entry=>{
   const selected=all.find(ex=>ex.code===entry.code);
   return {code:entry.code,requestedName:entry.name,selectedName:selected?.name || null,exercise:entry.exercise,progression:entry.progression,note:entry.note,volume:entry.volume || 'normal',volumeReason:entry.volumeReason || '',volumeStatus:selected?.coachVolumeDose?.status || null,
    status:selected?.symptomAdapted?'symptom_deferred':entry.exercise==='keep' && selected?.name!==entry.name?'selection_deferred':'applied'};
  });
  session.assessment+=' Решения тренера по циклу '+cycle.coachDecision.cycleId+': '+session.methodology.coachCycleDecisionEffects.map(entry=>entry.code+' — '+(entry.status==='symptom_deferred'?'отложено из-за симптомов':entry.status==='selection_deferred'?'сохранение варианта недоступно из-за ограничений или каталога':entry.exercise==='keep'?'сохранить вариант':'сменить вариант')+(entry.progression==='hold'?'; удерживать нагрузку':'')+(entry.volume==='reduce_one'?'; запрошено снижение объёма выбранного движения: '+entry.volumeReason:'')+(entry.note?'; '+entry.note:'')).join('. ')+'.';
 }

 session.methodology.individualPriorities={...individual,tasks:individual.priorities.map(key=>{
  const matched=all.filter(ex=>taskFamilies[key].includes(ex.strengthFamily) || key==='adductor' && ex.strengthFamily==='lateralPrehab' && /adduct/i.test(ex.name));
  matched.forEach(ex=>{ex.individualPriority=key;});
  return {key,codes:matched.filter(ex=>!ex.symptomAdapted).map(ex=>ex.code),status:matched.some(ex=>!ex.symptomAdapted)?'applied':matched.length?'symptom_deferred':'structure_deferred'};
 })};
 const loadText=externalLoad.reasons.map(reason=>reason.text).join(' ');
 if(loadText) session.assessment+=' '+loadText;
 if(individual.priorities.length) session.assessment+=' Приоритеты тренера: '+individual.priorities.map(key=>STRENGTH_PRIORITIES[key]).join(', ')+'. '+session.methodology.individualPriorities.tasks.filter(task=>task.status!=='applied').map(task=>STRENGTH_PRIORITIES[task.key]+': отложено из-за симптомов или обязательной структуры.').join(' ');
 if(individual.status==='review_due') session.assessment+=' Срок плана развития истёк: подтвердите новые приоритеты.';
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
  session.assessment = warning+' '+session.assessment; session.warnings = [session.warnings,warning].filter(Boolean).join(" ");
  quality.medicalReviewRequired = true; quality.medicalReviewReason = warning;
 }

 return {session,quality,player:snapshot.player,date,dayGoal,focus:'inseason_strength',strengthMode,trainingType,dataSummary:recommendation?.state?.detail||'',autoSaved:false,saveWarning:'Черновик готов для проверки и сохранения тренером.'};
}

// New strength drafts use the same reviewed catalogue for one-exercise swaps.
// No athlete symptoms or session contents are sent to an external model.
export function strengthReplacementCandidate({exercise,session,varietyContext,playerRestrictions=[],symptoms={zones:[]}}) {
 const family=exercise.strengthFamily;
 const adapted=symptoms.zones.some(zone=>regions[family]?.includes(zone));
 let options=adapted?trials[family]:catalogue[family];
 if(!options) return null;
 if(!adapted && exercise.individualPriority==='calf') options=options.filter(([name])=>/calf|soleus/i.test(name));
 const type=session.methodology?.trainingType;
 if(!adapted && family==='lower' && type!=='full_body') options=options.filter(([name])=>type==='anterior_chain'?/squat/i.test(name):/deadlift|hip thrust/i.test(name));
 if(!adapted && family==='row' && symptoms.zones.some(zone=>['back','ankle','achilles'].includes(zone))) options=options.filter(([name])=>/chest.supported/i.test(name));
 if(!adapted && family==='core' && symptoms.zones.some(zone=>['ankle','achilles'].includes(zone))) options=options.filter(([name])=>/dead bug|supine.*core/i.test(name));
 const excluded=new Set([...varietyContext.recent.map(e=>e.key),...session.blocks.flatMap(b=>b.exercises || []).map(e=>varietyExerciseKey(e.name))]);
 const permitted=([name])=>!excluded.has(varietyExerciseKey(name))&&!hasRestriction(name,playerRestrictions)&&!varietyContext.strengthCycle?.avoid.includes(canonicalExerciseId(name));
 const option=options.find(permitted);
 if(!option) return null;
 const rpe=adapted?'2–4':exercise.targetRpeMax>=8?'7–8':exercise.targetRpeMax>=7?'6–7':'5–6';
 return {...exercise,name:option[0],cue:option[1],compactDescription:undefined,descriptionOverride:undefined,descriptionExerciseId:undefined,exerciseId:undefined,
  weightKg:null,loadEvidence:null,loadProgression:null,actualKg:undefined,actualRpe:undefined,
  weightNote:adapted?'Без отягощения; RPE 2–4. Только комфортная проба после проверки тренером.':`Вес нового упражнения подобрать подводящими подходами по технике; RPE ${rpe}. Вес прежнего варианта не переносить.`,
  symptomAdapted:adapted,controlledExecution:adapted || exercise.controlledExecution,targetRpeMax:Number(rpe.split('–').at(-1)),
  targetSets:adapted?['6/side','6/side']:exercise.targetSets,tempo:adapted?'2-0-2-0':exercise.tempo,
  loadUnits:/\bDB\b/.test(option[0])&&!/one-arm|goblet|single-leg/i.test(option[0])?2:1,
  replacementFrom:exercise.replacementSavedName===exercise.name?exercise.name:exercise.replacementFrom || exercise.name,replacementReason:undefined,replacementNote:'',alternatives:[],
  autoReg:'Новая или усилившаяся боль, потеря позиции или усилие выше цели — завершить подход и сообщить тренеру.'};
}
