import { varietyExerciseKey } from './exerciseVariety.mjs';
import { loadUnitsForExercise } from './tonnage.js';
import { nextWorkoutSet, restSecondsFor, actualRepsFromTarget } from './playerWorkout.mjs';

export const STRENGTH_VERSION = 'inseason-strength-v2-2026-10';

// Logged kilograms are evidence only for the same execution and implement count.
// Session RPE is retained as context; it is never presented as set-level RPE.
export function strengthLoadEvidence(exercise, records = [], targetDate = '') {
  const key = varietyExerciseKey(exercise.name);
  const candidates = records.filter(r => r.date && r.date < targetDate)
    .sort((a,b) => b.date.localeCompare(a.date));
  for (const record of candidates) {
    if ((new Date(`${targetDate}T12:00:00Z`) - new Date(`${record.date}T12:00:00Z`)) / 86400000 > 42) continue;
    const ex = (record.exercises || []).find(e => varietyExerciseKey(e.name) === key && loadUnitsForExercise(e) === loadUnitsForExercise(exercise));
    if (!ex || ex.skippedReason) continue;
    const sets = (ex.setActuals || []).filter(s => s.completed && Number(s.kg) > 0 && Number(s.reps) > 0);
    if (!sets.length) continue;
    const planned = actualRepsFromTarget(exercise.targetSets?.[0]);
    const comparable = sets.filter(s => Math.abs(Number(s.reps) - planned) <= 2);
    const blockRpe = record.blockFeedback?.[ex.block]?.rpe;
    const rpe = Number(ex.actualRpe ?? blockRpe ?? record.sessionRpe);
    const rpeScope = ex.actualRpe != null ? 'exercise' : blockRpe != null ? 'block' : 'session';
    const pain = !!ex.pain || !!record.blockFeedback?.[ex.block]?.pain || (record.painAreas || []).length > 0;
    const kg = comparable.length && !pain && rpe >= 1 && rpe <= 8 ? Math.min(...comparable.map(s => Number(s.kg))) : null;
    return {date:record.date,exerciseKey:key,loadUnits:loadUnitsForExercise(ex),kg,rpe:Number.isFinite(rpe)&&rpe>0?rpe:null,rpeScope,pain,loggedSets:sets.map(s=>({kg:Number(s.kg),reps:Number(s.reps)}))};
  }
  return null;
}

export function normalizeStrengthExecution(session, focus, context) {
  if (focus !== 'inseason_strength' || !context || context.selectedMode !== 'maintenance' || !session?.blocks) return session;
  const red = context.mode === 'red_adaptation';
  const reduced = context.doseStatus === 'yellow';
  const blocks = session.blocks.map(block => {
    const code = String(block.code || block.label || '').match(/^[A-E]/)?.[0];
    const rest = red ? 60 : code === 'A' ? (reduced ? 150 : 180) : code === 'B' ? (reduced ? 120 : 150) : code === 'C' ? (reduced ? 90 : 120) : 60;
    return {...block,exerciseOrder:'sequential',restSeconds:rest,transitionRestSeconds:60,
      rest_note:`${rest} сек между подходами; 60 сек на переход между упражнениями. Выполнить все подходы упражнения последовательно. Подводящие подходы к рабочему весу — отдельно от рабочих.`,
      exercises:(block.exercises || []).map(ex => {
        const main = /^[ABC]/.test(ex.code || '');
        const unloaded = /без веса|без отягощ|bodyweight|unloaded/i.test(`${ex.name} ${ex.weightNote || ''}`);
        const targetRpe = unloaded ? '2–4' : red ? '4–5' : reduced && /^C2$/.test(ex.code || '') ? '5–6' : main ? reduced ? '6–7' : '7–8' : '6–7';
        const evidence = strengthLoadEvidence(ex, context.actualHistory, context.targetDate);
        const kg = !unloaded && !red && evidence?.kg && !reduced ? evidence.kg : null;
        const history = red ? '' : evidence ? ` Фактическая история этого упражнения: ${evidence.date}${evidence.rpe ? `; RPE ${evidence.rpe} (${evidence.rpeScope === 'session' ? 'сессии, не отдельного подхода' : evidence.rpeScope === 'block' ? 'блока' : 'упражнения'})` : '; RPE отсутствует'}.` : ' Сопоставимой фактической истории для этого упражнения нет; вес другой вариации не переносить.';
        return {...ex,targetSets:reduced && /^C[12]$/.test(ex.code || '') ? (ex.targetSets || []).slice(0,1) : ex.targetSets,controlledExecution: /^D/.test(ex.code || '') || unloaded,weightKg:kg,restSeconds:undefined,rest_seconds:undefined,rest:undefined,loadEvidence:evidence,
          weightNote:`${unloaded ? 'Без отягощения; только разрешённая комфортная амплитуда.' : kg ? `Начальный ориентир ${kg} кг${loadUnitsForExercise(ex)===2?' на каждый снаряд':''}; подтвердить подводящими подходами.` : 'Вес подобрать подводящими подходами по технике и усилию; точные кг заранее не назначены.'} RPE ${targetRpe}; без отказа.${history} При ухудшении техники или усилии выше цели снизить вес; автоматически не повышать.`,
          autoReg:'Новая или усилившаяся боль, потеря позиции, предельное усилие или RPE > 8 → завершить подход и сообщить тренеру.',
        };
      }),
    };
  });
  const result = {...session,blocks,methodology:{...(session.methodology || {}),version:STRENGTH_VERSION,goal:'inseason_strength_maintenance',weeklySessions:1,preferredMatchDays:[-4,-3],eveningCourt:true,rotation:'all_exercises_weekly',loadSource:'completed_set_weights_and_recorded_rpe',timing:{targetMainMinutes:red?25:45,plannedMainMinutes:red?25:45,warmupIncluded:false,rampUpIncluded:true,cooldownIncluded:false},daysToGame:context.daysToGame ?? null}};
  result.methodology.timing.estimatedMainMinutes = estimateStrengthMinutes(result);
  result.periodization_note = `Поддержание силы в сезоне: 1 занятие в неделю утром после командной разминки, предпочтительно MD−4/MD−3. ${red?'Облегчённая адаптация по состоянию вместо тяжёлой силы.':'40–50 минут основной части с подводящими подходами, паузами и настройкой.'} Вечером площадка: не добавлять объём ради заполнения времени, без отказа и выраженной мышечной болезненности. Все упражнения ротируются; двигательные задачи сохраняются. ${context.reason}`;
  return result;
}

export function estimateStrengthMinutes(session) {
  let seconds = 6*60 + (session.blocks || []).length*90; // specific ramp-up and block setup
  const done={};let last=null;
  while(true){const next=nextWorkoutSet(session,done);if(!next)break;
    if(last)seconds+=restSecondsFor(last.block,last.exercise,{bi:last.bi,ei:last.ei,next});
    const hold=String(next.target).match(/(\d+)\s*(?:sec|сек)/i);
    seconds+=hold ? Number(hold[1])*(/\/side|\/ст/.test(next.target)?2:1) : Math.max(15,actualRepsFromTarget(next.target)*4);
    done[next.key]=true;last=next;
  }
  return Math.round(seconds/60);
}
