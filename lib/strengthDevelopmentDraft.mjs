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
 ['Barbell Bench Press','Лопатки устойчивы, страхующий рядом. Опустить гриф к нижней части груди без отбива, выжать с контролем.'],
 ['DB Incline Bench Press','Спинка скамьи под небольшим углом, стопы устойчивы. Опускать гантели в комфортную амплитуду, не поднимать плечи к ушам.'],
 ['Push-Up','Ладони под плечами, корпус прямой. Опускать грудь между ладонями без провисания таза, затем выпрямить руки.'],
 ],
 row: [
 ['Chest-Supported DB Row','Грудь на наклонной скамье, шея нейтральная. Тянуть гантели к рёбрам без рывка и разгибания поясницы.'],
 ['Seated Cable Row','Стопы устойчивы, корпус нейтрален. Тянуть рукоять к нижним рёбрам без раскачивания и подъёма плеч.'],
 ['One-Arm DB Row (Bench Supported)','Ладонь и колено на скамье, спина нейтральная. Тянуть гантель к бедру, не разворачивая таз; выполнить обе стороны.'],
 ],
 knee: [
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
 lowerPrehab: [
 ['Seated Soleus Calf Raise','Сидя, колени примерно 90°, передняя часть стопы на опоре. Плавно поднять пятки и опустить их без пружинящего движения.'],
 ['Standing Calf Raise','Руки на устойчивой опоре, колени мягкие. Плавно подняться на носки и опустить пятки без подпрыгивания.'],
 ['Wall Tibialis Raise','Спина опирается на стену, пятки на полу. Поднимать переднюю часть стоп без отрыва пяток и рывка.'],
 ['Side-Lying Hip Adduction','Лёжа на боку, верхняя нога на опоре впереди. Поднимать нижнюю ногу без поворота таза; выполнить обе стороны.'],
 ],
};

export function buildStrengthDevelopmentDraft({ snapshot, recommendation, date, dayGoal='', recentSessions=[], actualHistory=[], playerRestrictions=[], coachRecovery='green', manualMethodSelection=false, sourceState=null }) {
 const context=buildInSeasonStrengthContext({focus:'inseason_strength',requestedMode:'development',targetDate:date,position:snapshot.player?.position,calendar:recommendation?.calendar,recoveryStatus:coachRecovery,actualHistory});
 const symptoms = manualMethodSelection ? prehabSymptoms(snapshot, sourceState || recommendation?.state || {}, date) : {zones:[]};
 const adaptedCodes = [];
 const recent=recentSessions.filter(r=>r.date<date&&(Date.parse(date)-Date.parse(r.date))/86400000<=7);
 const excluded=new Set(recent.flatMap(r=>(r.session?.blocks||[]).flatMap(b=>b.exercises||[])).map(e=>varietyExerciseKey(e.name)));
 const used=new Set();
 const rotationExceptions=[];
 // Manual selection may reuse a safe reviewed option when the finite catalogue
 // is exhausted. Prohibitions and symptom adaptations still apply.
 function selectOption(options, code, permitted = () => true) {
  const safe=options.filter(([name])=>!used.has(varietyExerciseKey(name))&&!hasRestriction(name,playerRestrictions)&&permitted(name));
  const fresh=safe.find(([name])=>!excluded.has(varietyExerciseKey(name)));
  if(fresh || !manualMethodSelection) return fresh;
  const repeated=safe[0];
  if(repeated) rotationExceptions.push({code,name:repeated[0]});
  return repeated;
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
 const regions={lower:['back','knee','ankle','achilles'],press:['shoulder'],row:['shoulder'],knee:['back','knee','ankle','achilles'],hinge:['back','ankle','achilles'],posterior:['back','knee'],core:['back','shoulder'],shoulder:['shoulder'],balance:['ankle','achilles'],lowerPrehab:['ankle','achilles'],adductor:[]};
 function choose(family,code,reps){
  if (symptoms.zones.some(zone=>regions[family]?.includes(zone))) {
   const trial=selectOption(trials[family],code);
   if(!trial)throw new Error(`Нет безопасной новой региональной замены для ${code}; требуется подбор тренером.`);
   used.add(varietyExerciseKey(trial[0]));adaptedCodes.push(code);
   const target = ['core','posterior','hinge','row'].includes(family) ? '6' : '6/side';
   return {code,name:trial[0],cue:trial[1],targetSets:[target,target],tempo:'2-0-2-0',weightNote:'Без отягощения; RPE 2–4. Только безболезненная проба движения после проверки тренером.',symptomAdapted:true,autoReg:'Боль или усиление симптомов — остановить упражнение; подобрать замену с тренером.',alternatives:[],loadUnits:1};
  }

  const option=selectOption(catalogue[family],code,()=>!(family === 'press' && playerRestrictions.includes('SHOULDER')));
  if(!option)throw new Error(`Нет безопасной новой вариации для ${code}; требуется подбор тренером.`);
  used.add(varietyExerciseKey(option[0]));
  if (/one-arm.*row/i.test(option[0])) reps='5/side';
  if (code === 'E1' && family === 'shoulder' && !/rotation/i.test(option[0])) reps='10';
  if (family === 'adductor') reps='8/side';
  if (family === 'shoulder' && /rotation/i.test(option[0])) reps='8/side';
  if (family === 'lowerPrehab' && !/side-lying/i.test(option[0])) reps='10';
  return {code,name:option[0],cue:option[1],targetSets:[reps,reps],tempo:'2-0-X-0',weightNote:family === 'balance' ? 'Без отягощения; лёгкий контроль положения.' : 'Вес по текущему RPE, без отказа.',autoReg:'Новая или усилившаяся боль, потеря позиции или RPE > 8 — остановить подход.',alternatives:[],loadUnits:/\bDB\b/.test(option[0]) && !/one-arm|single-leg|goblet|single[ -]arm/i.test(option[0])?2:1};
 }
 const a=choose('lower','A1','4');
 const hinge=/deadlift|hip thrust/i.test(a.name);
 const core=choose('core','D2','8/side');if(/plank/i.test(core.name))core.targetSets=['25 sec/side','25 sec/side'];if(/carry/i.test(core.name))core.targetSets=['25 sec/side','25 sec/side'];
 const e1=choose(context.positionGroup === 'libero'?'adductor':'shoulder','E1','10/side');
 const e2=choose(['libero','setter'].includes(context.positionGroup)?'balance':context.positionGroup==='outside'?'adductor':'lowerPrehab','E2',['libero','setter'].includes(context.positionGroup)?'25 sec/side':'10/side');
 let session={kind:'strength_training_draft',blocks:[{label:'A',exercises:[a]},{label:'B',exercises:[choose('press','B1','5'),choose('row','B2','5')]},{label:'C',exercises:[choose(hinge?'knee':'hinge','C1','5/side')]},{label:'D',exercises:[choose('posterior','D1','8'),core]},{label:'E',exercises:[e1,e2]}],assessment:'Развивающая силовая с контролем утомления перед вечерней площадкой. Перед выполнением обновить сведения ReadySix; новая боль требует адаптации.'};
 session=normalizeSessionTempoDescriptions(normalizeStrengthExecution(session,'inseason_strength',context));
 session.methodology.selection='reviewed_catalogue_server_only';
 const quality=assessSessionQuality(session,{focus:'inseason_strength',trainingType:'full_body',playerRestrictions,dosePrescription:inSeasonStrengthDoseProfile(context),varietyContext:buildExerciseVarietyContext(recentSessions,{targetDate:date,focus:'inseason_strength',trainingType:'full_body'})});
 quality.readySixState = sourceState || recommendation?.state || null;
 session.methodology.manualMethodSelection = manualMethodSelection;
 if(rotationExceptions.length) {
  session.methodology.rotationExceptions=rotationExceptions;
  const warning='Ручной выбор: безопасные варианты каталога исчерпаны; повторены упражнения за последние 7 дней: '+rotationExceptions.map(e=>`${e.code} ${e.name}`).join(', ')+'. Проверить с тренером перед выполнением.';
  session.warnings=warning;
  quality.warnings.push(warning);
 }
 if (adaptedCodes.length) {
  session.methodology.regionalAdaptation = {codes:adaptedCodes,zones:symptoms.zones};
  const warning = 'Региональные замены по боли — без отягощения, только после проверки тренером. Здоровые двигательные задачи сохраняют силовую дозу; болезненные заменены пробами комфортного движения. Полной развивающей нагрузкой для затронутых областей этот план не является.';
  session.assessment = warning; session.warnings = [session.warnings,warning].filter(Boolean).join(" ");
  quality.medicalReviewRequired = true; quality.medicalReviewReason = warning;
 }

 return {session,quality,player:snapshot.player,date,dayGoal,focus:'inseason_strength',strengthMode:'development',trainingType:'full_body',dataSummary:recommendation?.state?.detail||'',autoSaved:false,saveWarning:'Черновик готов для проверки и сохранения тренером.'};
}
