export const STRENGTH_COHORT_EXPERIENCE = {value:'experienced',label:'Силовой стаж всех игроков: 5+ лет',source:'coach_confirmed_2026-10-12'};

// Values are kg per implement (a dumbbell pair uses the same value twice).
export const STRENGTH_EQUIPMENT = { dumbbell: 'Гантели — кг одной гантели', barbell: 'Штанга — общий вес с грифом', trap_bar: 'Трэп-гриф — общий вес', landmine: 'Landmine — кг блинов', kettlebell: 'Гири — кг одной гири' };
export function normalizeStrengthEquipment(input = {}) {
  const result = {};
  for (const key of Object.keys(STRENGTH_EQUIPMENT)) {
    const values = Array.isArray(input?.[key]) ? input[key] : String(input?.[key] || '').split(/[;,\s]+/);
    result[key] = [...new Set(values.filter(v => v !== '' && v != null).map(Number).filter(v => Number.isFinite(v) && v > 0 && v <= 1000))].sort((a,b)=>a-b).slice(0,200);
  }
  return result;
}
export function strengthEquipmentFamily(exercise) {
  const name = exercise?.name || '';
  if (/\bDB\b|dumbbell/i.test(name)) return 'dumbbell';
  if (/trap.bar/i.test(name)) return 'trap_bar';
  if (/landmine/i.test(name)) return 'landmine';
  if (/barbell/i.test(name)) return 'barbell';
  if (/\bKB\b|kettlebell/i.test(name)) return 'kettlebell';
  // Cable stacks differ by machine: require an exact exercise list.
  return null;
}
export function normalizeStrengthExperience(value) {
  return ['novice','intermediate','experienced'].includes(value) ? value : 'unknown';
}
export const STRENGTH_EXPERIENCE_OPTIONS = [
  {value:'unknown',label:'Стаж не задан'}, {value:'novice',label:'Начинающий — до 1 года систематической силовой'},
  {value:'intermediate',label:'Средний — 1–3 года'}, {value:'experienced',label:'Опытный — более 3 лет'},
];

export function validStrengthEquipment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  return Object.entries(input).every(([key,value]) => {
    if (!Object.hasOwn(STRENGTH_EQUIPMENT,key)) return false;
    if (!(Array.isArray(value) || typeof value === 'string')) return false;
    const values=Array.isArray(value)?value:String(value).split(/[;\s]+/).filter(Boolean);
    return values.length<=200 && values.every(v => /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(String(v)) && Number(v)>0 && Number(v)<=1000);
  });
}
