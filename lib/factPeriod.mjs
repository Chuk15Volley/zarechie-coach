import {calendarToday,validCalendarDate,shiftCalendarDate} from './coachCalendar.mjs';
export function factPeriod(days=90,to=calendarToday()) {
  return {from:shiftCalendarDate(to,-(Number(days)-1)),to};
}
export function validFactPeriod(from,to) {
  return typeof from==='string' && typeof to==='string' && validCalendarDate(from) && validCalendarDate(to) && from<=to && (Date.parse(to)-Date.parse(from))/86400000<366;
}
export function factTasks(fact) {
  return (fact?.rows || []).map(row=>({...row,fields:[...(row.sets || []).flatMap(set=>[...(set.missingKg?[{exercise:row.exercise,set:set.set,field:'kg',label:`Подход ${set.set+1} · кг`}]:[]),...(set.missingReps?[{exercise:row.exercise,set:set.set,field:'reps',label:`Подход ${set.set+1} · повторы`}]:[])]),...(row.missingRpe?[{exercise:row.exercise,set:null,field:'rpe',label:'RPE упражнения'}]:[])]})).filter(row=>row.fields.length);
}
