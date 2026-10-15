import { mergeWorkoutProgress } from './workoutProgress.mjs';
import { completedSetCount } from './playerWorkout.mjs';
import { loadUnitsForExercise } from './tonnage.js';

export function serverWorkoutComplete(session, log) {
 const total=(session?.blocks || []).reduce((n,b)=>n+(b.exercises || []).reduce((m,e)=>m+(e.targetSets?.length || 0),0),0);
 return !!log?.completedAt || !!(total && completedSetCount(session,log?.done || {})===total);
}
// Viewing a server-confirmed completion must not replay a stale device snapshot.
export function restorePlayerProgress(session, server={}, local=null, pending=null) {
 if(serverWorkoutComplete(session,server)) return { ...mergeWorkoutProgress({},server,server.savedAt || server.lastActionAt), completedAt:server.completedAt || server.savedAt || null };
 return mergeWorkoutProgress(server,pending || local || {});
}
export function implementWeightLabel(ex) {
 if(loadUnitsForExercise(ex)!==2)return 'Вес снаряда, кг';
 return /dumbbell|\bdb\b|гантел|^Chest-Supported Reverse Fly$/i.test(ex?.name || '') ? 'Вес одной гантели, кг' : /kettlebell|\bkb\b|гир/i.test(ex?.name || '') ? 'Вес одной гири, кг' : 'Вес одного снаряда, кг';
}
export function actualLoadLabel(ex, value) {
 if(value==null || String(value).trim()==='')return '';
 const kg=String(value).replace('.',',');
 return loadUnitsForExercise(ex)===2 ? `2 ${/dumbbell|\bdb\b|гантел|^Chest-Supported Reverse Fly$/i.test(ex?.name || '')?'гантели':/kettlebell|\bkb\b|гир/i.test(ex?.name || '')?'гири':'снаряда'} по ${kg} кг` : `${kg} кг`;
}

export function playerSessionStatus(session,log) {
 if(log?.completedAt && log?.finishReason)return 'Завершена раньше';
 if(log?.completedAt && Object.values(log?.skipped || {}).some(Boolean))return 'Завершена с пропусками';
 if(serverWorkoutComplete(session,log))return 'Выполнена';
 return log?.startedAt ? 'В процессе' : 'Назначена';
}
