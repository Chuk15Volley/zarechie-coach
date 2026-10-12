import { canonicalExerciseId } from './exerciseIdentity.mjs';

export const STRENGTH_CYCLE_VERSION = 'strength-cycle-completed-4-v2';
export const REPLACEMENT_REASONS = {
  pain: 'Боль / ограничения', technique: 'Не подходит по технике', tolerance: 'Плохо переносит нагрузку',
  preference: 'Предпочитаю другой вариант', restore: 'Вернуть ранее исключённый вариант', one_off: 'Разовая замена',
};
export const strengthExercises = session => (session?.blocks || []).flatMap(b => b.exercises || []);
const isStrength = r => (r.focus || r.quality?.focus) === 'inseason_strength';
const daysBetween = (a,b) => (new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`))/86400000;

// Saved drafts retain anchors; only server-confirmed full executions advance.
// Migration starts a fresh completion count; legacy saved positions are not facts.
export function buildStrengthCycle(records = [], {targetDate, trainingType = 'full_body'} = {}) {
  const previous = [...new Map(records.filter(r => r.date < targetDate && isStrength(r) && !r.session?.methodology?.medicalHold)
    .sort((a,b) => a.date.localeCompare(b.date)).map(r => [r.date,r])).values()];
  const tracked = previous.filter(r => r.session?.methodology?.strengthCycle?.version === STRENGTH_CYCLE_VERSION);
  // Old plans saved ahead of time must not restore a finished cycle.
  const latest = tracked.reduce((chosen,record)=>!chosen || record.session.methodology.strengthCycle.id > chosen.session.methodology.strengthCycle.id ? record : chosen,null);
  const completed = latest ? tracked.filter(r => r.session.methodology.strengthCycle.id === latest.session.methodology.strengthCycle.id && r.strengthCompletion?.completed === true && ['player_feedback','player_log'].includes(r.strengthCompletion.source)) : [];
  const next = !latest || completed.length >= 4;
  const completedCount = next ? 0 : completed.length;
  const cycleId = next ? targetDate : latest.session.methodology.strengthCycle.id;
  const within = next ? [] : tracked.filter(r => r.session.methodology.strengthCycle.id === cycleId);
  const anchors = {};
  for (const record of within.filter(r => (r.trainingType || r.session.methodology.trainingType || 'full_body') === trainingType)) {
    for (const ex of strengthExercises(record.session)) if (['A1','B1','B2'].includes(ex.code) && !ex.symptomAdapted) anchors[ex.code] = ex;
  }
  const replacements = previous.flatMap(r => (r.session.coachReplacements || []).map(event => ({...event,date:r.date})));
  const avoid = new Set();
  for(const event of replacements) {
    if(['pain','technique','tolerance','preference'].includes(event.reason)) avoid.add(canonicalExerciseId(event.from));
    if(event.reason==='restore') avoid.delete(canonicalExerciseId(event.to));
  }
  for (const code of Object.keys(anchors)) if (avoid.has(canonicalExerciseId(anchors[code].name))) delete anchors[code];
  const preferred = replacements.filter(e => ['preference','restore'].includes(e.reason) && !avoid.has(canonicalExerciseId(e.to))).map(e => e.to).reverse();
  const recent = previous.filter(r => daysBetween(r.date,targetDate) > 0 && daysBetween(r.date,targetDate) < 2).at(-1);
  return {version:STRENGTH_CYCLE_VERSION,id:cycleId,position:Math.min(4,completedCount+1),completedCount,length:4,trainingType,anchors,
    avoid:[...avoid],preferred,previousDate:recent?.date || null,previousTrainingType:recent?.trainingType || recent?.session?.methodology?.trainingType || null,
    previousExercises:recent ? strengthExercises(recent.session) : [],countBasis:'fully_completed_session_dates'};
}

export function isCycleAnchor(exercise, cycle) {
  const anchor = cycle?.anchors?.[exercise.code];
  return !!anchor && canonicalExerciseId(anchor.name) === canonicalExerciseId(exercise.name);
}

// Saved changes are the only learning source; unspecified and one-off changes
// remain an audit trail without turning into persistent exclusions.
export function recordCoachReplacements(session, previousSession, date) {
  const previous = strengthExercises(previousSession);
  const events = [...(previousSession?.coachReplacements || session.coachReplacements || [])];
  for (const ex of strengthExercises(session)) {
    const old = previous.find(e => e.code === ex.code);
    const from = old && canonicalExerciseId(old.name) !== canonicalExerciseId(ex.name) ? old.name : ex.replacementFrom;
    if (!from || canonicalExerciseId(from) === canonicalExerciseId(ex.name)) continue;
    const reason = Object.hasOwn(REPLACEMENT_REASONS,ex.replacementReason) ? ex.replacementReason : 'unspecified';
    const event = {code:ex.code,from,to:ex.name,reason,note:String(ex.replacementNote || '').trim().slice(0,300),date};
    const same = e => e.code === event.code && e.from === event.from && e.to === event.to && e.date === date;
    const index = events.findIndex(same);
    if (index < 0) events.push(event); else events[index] = event;
  }
  return {...session,blocks:(session.blocks || []).map(block=>({...block,exercises:(block.exercises || []).map(ex=>ex.replacementFrom?{...ex,replacementSavedName:ex.name}:ex)})),coachReplacements:events.slice(-40)};
}

export function strengthWorkRole(exercise, trainingType) {
  const name = exercise.name || '';
  if (/^A1$/.test(exercise.code)) return trainingType === 'anterior_chain' ? 'knee' : /squat/i.test(name) ? 'knee' : 'hip';
  if (exercise.code === 'B1') return 'press';
  if (exercise.code === 'B2') return 'row';
  if (/rdl|romanian|deadlift|hip thrust|glute|leg curl|hamstring|back extension/i.test(name)) return 'hip';
  if (/squat|lunge|step.up/i.test(name)) return 'knee';
  if (/external rotation|face pull|prone.*raise/i.test(name)) return 'shoulder_pre';
  if (/calf|soleus|tibialis/i.test(name)) return 'calf';
  if (/adduct|abduct/i.test(name)) return 'hip_accessory';
  if (/pallof|dead bug|plank|carry|core/i.test(name)) return 'core';
  return null;
}
export function strengthRegionalDose(exercise, context) {
  if (exercise.symptomAdapted) return {sets:2,rpe:'2–4',reason:'symptom'};
  const type = context.trainingType;
  const split = ['anterior_chain','posterior_chain'].includes(type);
  const role = strengthWorkRole(exercise,type);
  const secondary = split && (type === 'anterior_chain' ? ['hip','row'].includes(role) : ['knee','press'].includes(role));
  const overlap = context.strengthCycle?.previousExercises.some(old => {
    const oldRole = strengthWorkRole(old,context.strengthCycle.previousTrainingType);
    // Legacy plans without explicit effort are treated conservatively.
    return role && oldRole === role && !old.symptomAdapted && (old.targetRpeMax == null || old.targetRpeMax >= 7);
  });
  if (!overlap && exercise.code === 'A1' && context.strengthCycle?.previousDate && split && context.strengthCycle.previousTrainingType !== type) return {sets:2,rpe:'6–7',reason:'adjacent_shared_lower'};
  if (secondary || overlap) return {sets:exercise.code === 'B2'?2:1,rpe:'5–6',reason:overlap?'adjacent_overlap':'secondary_chain'};
  return null;
}
