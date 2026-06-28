// lib/exerciseRestrictions.js
// Player contraindications: catalogue, name-based matching, and prompt injection.

export const RESTRICTIONS = [
  { id: 'JUMP', label: 'Прыжки', desc: 'Нет прыжков и плиометрики' },
  { id: 'AXIAL', label: 'Осевая нагрузка', desc: 'Нет нагрузки вдоль позвоночника' },
  { id: 'KNEE_HIGH', label: 'Глубокое приседание', desc: 'Нет приседаний глубже параллели' },
  { id: 'SHOULDER', label: 'Нагрузка на плечо', desc: 'Нет жимов и тяг над головой' },
  { id: 'WRIST', label: 'Нагрузка на запястье', desc: 'Нет планки и жима с опорой' },
  { id: 'ANKLE', label: 'Голеностоп', desc: 'Нет прыжков и боковых движений' },
];

const TAGS = {
  JUMP: ['прыжок', 'jump', 'тук', 'tuck', 'cmj', 'плиометр', 'plyо', 'split jump', 'бег', 'lateral bound', 'lateral hop'],
  AXIAL: ['trap bar', 'трэп', 'goblet', 'гоблет', 'присед', 'deadlift', 'тяга с трэп'],
  KNEE_HIGH: ['болгарский', 'bulgarian', 'выпад', 'lunge', 'step down', 'step-down', 'копенгаген', 'copenhagen'],
  SHOULDER: ['жим', 'press', 'подтягив', 'pull-up', 'pullup', 'trx row', 'overhead', 'над голов'],
  WRIST: ['планка', 'plank', 'push-up', 'отжим', 'ab wheel', 'rollout'],
  ANKLE: ['прыжок', 'jump', 'hop', 'bound', 'lateral', 'run'],
};

export function hasRestriction(exerciseName, restrictions) {
  if (!restrictions?.length || !exerciseName) return false;
  const lower = exerciseName.toLowerCase();
  for (const r of restrictions) {
    const patterns = TAGS[r] || [];
    if (patterns.some(p => lower.includes(p))) return true;
  }
  return false;
}

export function restrictionsToPrompt(restrictions) {
  if (!restrictions?.length) return '';
  const labels = restrictions.map(r => RESTRICTIONS.find(x => x.id === r)?.desc || r);
  return `\n\nОГРАНИЧЕНИЯ ИГРОКА (обязательно соблюдать):\n${labels.map(l => `- ${l}`).join('\n')}`;
}
