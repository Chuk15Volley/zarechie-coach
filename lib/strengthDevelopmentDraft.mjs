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

export function buildStrengthDevelopmentDraft({ snapshot, recommendation, date, dayGoal='', recentSessions=[], actualHistory=[], playerRestrictions=[], coachRecovery='green' }) {
 const context=buildInSeasonStrengthContext({focus:'inseason_strength',requestedMode:'development',targetDate:date,position:snapshot.player?.position,calendar:recommendation?.calendar,recoveryStatus:coachRecovery,actualHistory});
 const recent=recentSessions.filter(r=>r.date<date&&(Date.parse(date)-Date.parse(r.date))/86400000<=7);
 const excluded=new Set(recent.flatMap(r=>(r.session?.blocks||[]).flatMap(b=>b.exercises||[])).map(e=>varietyExerciseKey(e.name)));
 const used=new Set();
 function choose(family,code,reps){
  const option=catalogue[family].find(([name])=>!excluded.has(varietyExerciseKey(name))&&!used.has(varietyExerciseKey(name))&&!hasRestriction(name,playerRestrictions) && !(family === 'press' && playerRestrictions.includes('SHOULDER')));
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
 quality.readySixState = recommendation?.state || null;
 return {session,quality,player:snapshot.player,date,dayGoal,focus:'inseason_strength',strengthMode:'development',trainingType:'full_body',dataSummary:recommendation?.state?.detail||'',autoSaved:false,saveWarning:'Черновик готов для проверки и сохранения тренером.'};
}
