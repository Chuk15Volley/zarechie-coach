// Preserve the coach's original exercise names in every athlete view.
export function playerExerciseName(ex) {
 return typeof ex === 'string' ? ex : ex?.name || '';
}
export function compactWorkoutTitle(label) {
 const value = String(label || 'Тренировка');
 return /^профилактика\s*·\s*индивидуальная программа(?:\s*·\s*Восстановление \/ профилактика)?$/i.test(value) ? 'Профилактика' : value.replace(/\s*·\s*индивидуальная программа/gi, '');
}
export function repetitionInput(target) {
 const m = String(target ?? '').trim().match(/^(\d+)(?:\s*\/(side|leg|arm)|\s*на\s+(сторону|ногу|руку))?$/i);
 return m ? { planned: Number(m[1]), perSide: !!(m[2] || m[3]) } : null;
}
export function validRepetitions(value) {
 if (!['string', 'number'].includes(typeof value) || value === '') return null;
 const n = Number(value);
 return Number.isInteger(n) && n >= 0 && n <= 200 ? n : null;
}
export function actualTarget(target, value) {
 const count = validRepetitions(value), info = repetitionInput(target);
 return count != null && info ? `${count}${info.perSide ? '/side' : ''}` : target;
}
export function targetLabel(target) {
 const info = repetitionInput(target);
 return info ? `${info.planned} повт.${info.perSide ? ' / сторону' : ''}` : String(target || '').replace(/\/side/gi, ' / сторону').replace(/\bsec\b/gi, 'сек');
}
export function isCircuit(block) {
 return /→|->|пар[аыуе]|тройк|круг|между упражнениями/i.test(block?.rest_note || '');
}
export function focusExerciseIndex(block, bi, done = {}, skipped = {}) {
 return (block?.exercises || []).findIndex((ex, ei) => !skipped[`${bi}-${ei}`] && (ex.targetSets || []).some((_, si) => !done[`${bi}-${ei}-${si}`]));
}
export function shortCue(ex) {
 const text = String(ex?.cue || '').trim();
 const sentences = text.split(/(?<=[.!?])\s+/);
 return sentences.find(s => /опор|локт|колен|стоп|спин|корпус|дых|груд|плеч/i.test(s) && s.length <= 180) || (text.length <= 160 ? text : 'Техника выполнения — в подробностях ниже.');
}

export function needsLoadEntry(ex) {
 if (Number(ex?.weightKg) > 0 || /\d\s*(?:кг|kg)/i.test(ex?.weightNote || '')) return true;
 if (/без (?:дополнительного )?веса|вес тела|bodyweight/i.test(ex?.weightNote || '')) return false;
 return /dumbbell|barbell|kettlebell|\b(?:db|kb)\b|гантел|штанг|гир/i.test(ex?.name || '');
}

export function russianCount(value, one, few, many) {
 const n = Math.abs(Math.trunc(Number(value) || 0));
 return n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many;
}
export function playerLoadLabel(note) {
 const text = String(note || '').trim();
 if (/^без дополнительного веса/i.test(text)) return 'Без дополнительного веса';
 if (/^лёгкое сопротивление/i.test(text)) return 'Лёгкое сопротивление';
 return text;
}
