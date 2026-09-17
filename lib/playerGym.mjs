const NAMES = {
 'Seated Scapular Retraction (Back Supported)': 'Сведение лопаток сидя с опорой спины',
 'Chest-Supported DB Row': 'Тяга гантелей с опорой грудью',
 'Seated Band External Rotation (Back Supported)': 'Наружная ротация плеча с лентой сидя',
 'Chest-Supported Reverse Fly': 'Разведение гантелей с опорой грудью',
 'Seated DB Curl (Back Supported)': 'Сгибание рук с опорой спины',
 'Back Supported Dumbbell Press': 'Жим гантелей с опорой спины',
 'Comfortable Supported Breathing': 'Спокойное дыхание в удобном положении',
 '45° Hyperextension': 'Гиперэкстензия 45°',
 'Seated Ankle Dorsiflexion': 'Подъём носков сидя',
 'Supported Split Squat': 'Сплит-присед с опорой',
 'Seated Calf Raise': 'Подъём на носки сидя',
 'Supported Single-Leg Balance': 'Равновесие на одной ноге с опорой',
 'Short Foot Exercise (Seated)': 'Короткая стопа сидя',
 'Goblet Squat': 'Присед с весом у груди',
 'Dumbbell Bench Press': 'Жим гантелей лёжа',
 'Romanian Deadlift': 'Румынская тяга',
 'Dead Bug': 'Мёртвый жук',
 'Bird Dog': 'Вытяжение противоположных руки и ноги',
 'Side Plank': 'Боковая планка',
 'Pallof Press': 'Жим Палофа',
};
export function playerExerciseName(ex) {
 const name = typeof ex === 'string' ? ex : ex?.name || '';
 return NAMES[name] || name;
}
export function compactWorkoutTitle(label) {
 const value = String(label || 'Тренировка');
 return /^профилактик/i.test(value) ? 'Профилактика' : value.replace(/\s*·\s*индивидуальная программа/gi, '');
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
