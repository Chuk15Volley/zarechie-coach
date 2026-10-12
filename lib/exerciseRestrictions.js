// lib/exerciseRestrictions.js
// Player contraindications: catalogue, name-based matching, and prompt injection.

// Coach-wide exclusions apply to every method and workspace.
export function isCoachBannedExercise(name = '') {
  if (/side[\s_-]+lying[\s_-]+short[\s_-]+lever[\s_-]+adductor[\s_-]+raise|short[\s_-]+lever[\s_-]+(?:side[\s_-]+lying[\s_-]+)?adductor[\s_-]+raise/i.test(String(name))) return true;
  if (/supine[\s_-]+glute[\s_-]+(?:set|squeeze)|glute[\s_-]+(?:set|squeeze)\s*[-(]?\s*supine|supine[\s_-]+diaphragm(?:atic)?[\s_-]+breathing|diaphragm(?:atic)?[\s_-]+breathing\s*[-(]?\s*supine/i.test(String(name))) return true;
  return /machine\s+(?:hamstring|leg)\s+curl|(?:seated|lying|prone)\s+(?:machine\s+)?(?:hamstring|leg)\s+curl|(?:hamstring|leg)\s+curl\s*[-(]?\s*machine|сгибани[ея]\s+ног[^.]*тренаж|barbell\s+bench\s+press|bench\s+press\s*[-(]?\s*barbell|жим\s+штанги\s+л[её]жа|(?:seated\s+)?cable\s+row|горизонтальн[а-яё]*\s+тяг[а-яё]*\s+блок|тяг[а-яё]*\s+(?:горизонтальн[а-яё]*\s+)?блока\s+сидя|тяг[а-яё]*\s+горизонтальн[а-яё]*\s+блока/i.test(String(name));
}
export function coachBannedSessionExercises(session) {
  return (session?.blocks || []).flatMap(block => block.exercises || []).flatMap(ex => [ex.name, ...(ex.alternatives || []).map(alt => typeof alt === 'string' ? alt : alt?.name)]).filter(isCoachBannedExercise);
}

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
  if (isCoachBannedExercise(exerciseName)) return true;
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
