const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const RTP_PHASES = [
  { id: 1, label: 'Защита', short: 'Снять реактивность', volumeCap: 35, rpeCap: 5 },
  { id: 2, label: 'Восстановление', short: 'Вернуть объём движения', volumeCap: 50, rpeCap: 6 },
  { id: 3, label: 'Перестройка', short: 'Вернуть силу и контроль', volumeCap: 70, rpeCap: 7 },
  { id: 4, label: 'Интеграция', short: 'Вернуть спортивные паттерны', volumeCap: 85, rpeCap: 8 },
  { id: 5, label: 'Возврат', short: 'Полная тренировка под контролем', volumeCap: 100, rpeCap: 9 },
];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value, max = 200) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeReturnToPlay(input = {}, fallbackDate = new Date().toISOString().slice(0, 10)) {
  const status = ['inactive', 'active', 'paused', 'cleared'].includes(input.status) ? input.status : 'inactive';
  const currentPhase = clamp(Math.round(finite(input.currentPhase, 1)), 1, RTP_PHASES.length);
  const startedAt = DATE_RE.test(String(input.startedAt || '')) ? String(input.startedAt) : fallbackDate;
  const nextReviewDate = DATE_RE.test(String(input.nextReviewDate || '')) ? String(input.nextReviewDate) : null;
  const criteria = safeArray(input.criteria).map((item, index) => ({
    id: clean(item?.id, 48) || `criterion-${index + 1}`,
    label: clean(item?.label, 160),
    complete: Boolean(item?.complete),
  })).filter(item => item.label).slice(0, 8);
  const history = safeArray(input.history).map(item => ({
    at: String(item?.at || '').slice(0, 32),
    action: clean(item?.action, 80),
    phase: clamp(Math.round(finite(item?.phase, currentPhase)), 1, RTP_PHASES.length),
    note: clean(item?.note, 240),
  })).filter(item => item.at && item.action).slice(-30);

  return {
    status,
    title: clean(input.title, 120),
    bodyPart: clean(input.bodyPart, 80),
    diagnosis: clean(input.diagnosis, 180),
    startedAt,
    currentPhase,
    painScore: clamp(finite(input.painScore, 0), 0, 10),
    nextReviewDate,
    owner: clean(input.owner, 100),
    notes: clean(input.notes, 600),
    criteria,
    history,
  };
}

export function evaluateReturnToPlay(input, targetDate = new Date().toISOString().slice(0, 10)) {
  const plan = normalizeReturnToPlay(input || {}, targetDate);
  const phase = RTP_PHASES[plan.currentPhase - 1];
  const completedCriteria = plan.criteria.filter(item => item.complete).length;
  const reviewDue = Boolean(plan.nextReviewDate && targetDate >= plan.nextReviewDate);
  const active = plan.status === 'active' || plan.status === 'paused';
  return {
    ...plan,
    active,
    phase,
    completedCriteria,
    criteriaTotal: plan.criteria.length,
    criteriaPercent: plan.criteria.length ? Math.round(completedCriteria / plan.criteria.length * 100) : null,
    reviewDue,
    coachDecisionRequired: active && (reviewDue || plan.painScore >= 4 || (plan.criteria.length > 0 && completedCriteria === plan.criteria.length)),
  };
}

export function recommendNextLoad({
  readiness = {}, status = {}, restrictions = [], activeInjuries = [], returnToPlay = null, developmentPlan = null,
} = {}) {
  const rtp = evaluateReturnToPlay(returnToPlay || {});
  const planFact = status.planFact || {};
  const feedback = status.feedback || {};
  const previousOutcome = status.previousAdaptationOutcome?.outcome || {};
  const doms = finite(readiness.doms, 0);
  const rpe = finite(feedback.rpe ?? planFact.sessionRpe ?? previousOutcome.sessionRpe, null);
  const completion = finite(planFact.completionPercent ?? planFact.compliance ?? previousOutcome.compliance, null);
  const pain = Math.max(
    rtp.active ? finite(rtp.painScore, 0) : 0,
    safeArray(activeInjuries).length ? 4 : 0,
    safeArray(status.live?.alerts).some(alert => /боль|pain/i.test(String(alert))) ? 4 : 0,
    previousOutcome.pain ? 4 : 0,
  );

  let mode = 'maintain';
  let volumePercent = 100;
  let intensityPercent = 100;
  let rpeCap = 8;
  let confidence = 'high';
  const reasons = [];
  const safeguards = ['Изменение применяется только после подтверждения тренером.'];

  if (rtp.active) {
    mode = rtp.status === 'paused' ? 'hold' : 'rtp';
    volumePercent = rtp.status === 'paused' ? 0 : rtp.phase.volumeCap;
    intensityPercent = rtp.status === 'paused' ? 0 : Math.min(90, rtp.phase.volumeCap + 5);
    rpeCap = rtp.status === 'paused' ? 0 : rtp.phase.rpeCap;
    reasons.push(`Return-to-Play · фаза ${rtp.currentPhase}: ${rtp.phase.label}`);
    safeguards.push('Критерии медицинского допуска имеют приоритет над алгоритмом нагрузки.');
  }

  if (pain >= 4 || doms >= 5 || readiness.status === 'red') {
    mode = rtp.active ? mode : 'recover';
    volumePercent = Math.min(volumePercent, pain >= 6 ? 30 : 55);
    intensityPercent = Math.min(intensityPercent, pain >= 6 ? 45 : 70);
    rpeCap = Math.min(rpeCap, pain >= 6 ? 4 : 6);
    if (readiness.status === 'red') reasons.push('Красная готовность: план требует ручной проверки');
    if (doms >= 5) reasons.push(`DOMS ${doms}/5`);
    if (pain >= 4) reasons.push('Активная боль или травма');
  } else if (readiness.status === 'yellow' || doms >= 3) {
    mode = rtp.active ? mode : 'reduce';
    volumePercent = Math.min(volumePercent, 80);
    intensityPercent = Math.min(intensityPercent, 90);
    rpeCap = Math.min(rpeCap, 7);
    reasons.push(readiness.status === 'yellow' ? 'Жёлтая готовность' : `DOMS ${doms}/5`);
  }

  if (rpe != null && rpe >= 9) {
    mode = rtp.active ? mode : 'reduce';
    volumePercent = Math.min(volumePercent, 75);
    intensityPercent = Math.min(intensityPercent, 90);
    rpeCap = Math.min(rpeCap, 7);
    reasons.push(`Предыдущая нагрузка ощущалась как RPE ${rpe}`);
  }
  if (status.previousAdaptationOutcome?.status === 'measured') {
    reasons.push(`Замкнутый цикл: учтён факт ${status.previousAdaptationOutcome.date}`);
  }
  if (completion != null && completion < 70) {
    mode = rtp.active ? mode : 'reduce';
    volumePercent = Math.min(volumePercent, 80);
    reasons.push(`Выполнение плана ${Math.round(completion)}%`);
  }

  const completeness = finite(readiness.dataCompleteness, 0);
  if (completeness < 50) {
    confidence = completeness === 0 ? 'low' : 'medium';
    if (!reasons.length) mode = 'hold';
    volumePercent = Math.min(volumePercent, 90);
    reasons.push(`Полнота данных ${Math.round(completeness)}%`);
    safeguards.push('Без свежих данных прогрессия нагрузки заблокирована.');
  }

  if (
    !rtp.active && mode === 'maintain' && readiness.status === 'green' && completeness >= 75 &&
    completion != null && completion >= 90 && rpe != null && rpe <= 7 && pain === 0
  ) {
    mode = 'progress';
    volumePercent = 103;
    intensityPercent = 102;
    rpeCap = 8;
    reasons.push('Зелёная готовность и устойчивое выполнение предыдущей сессии');
    safeguards.push('Прогрессия ограничена 2–3% за одну экспозицию.');
  }

  if (safeArray(restrictions).length) {
    reasons.push(`Ограничения: ${restrictions.length}`);
    safeguards.push('Исключить противопоказанные паттерны и проверить замену упражнений.');
  }
  if (developmentPlan?.review?.due || developmentPlan?.coachDecisionRequired) {
    reasons.push('Наступил пересмотр 4-недельного плана');
    safeguards.push('Новый целевой объём — только после решения по плану развития.');
  }
  if (!reasons.length) reasons.push('Сохранять плановую дозировку и контролировать технику');

  const labels = {
    progress: 'Осторожно прогрессировать', maintain: 'Сохранить нагрузку', reduce: 'Снизить дозировку',
    recover: 'Восстановительная работа', hold: 'Не прогрессировать', rtp: `RTP · фаза ${rtp.currentPhase}`,
  };
  return {
    mode,
    label: labels[mode] || labels.maintain,
    volumePercent: Math.round(volumePercent),
    intensityPercent: Math.round(intensityPercent),
    rpeCap,
    confidence,
    reasons: [...new Set(reasons)].slice(0, 5),
    safeguards: [...new Set(safeguards)].slice(0, 4),
    requiresCoachApproval: true,
  };
}

export function buildTodayDecisionCenter(rows = [], readinessPlayers = [], platformHealth = null) {
  const readiness = new Map(safeArray(readinessPlayers).map(player => [String(player.id), player]));
  const athletes = safeArray(rows).map(row => {
    const ready = readiness.get(String(row?.player?.id)) || {};
    const status = row?.status || {};
    const rtp = evaluateReturnToPlay(status.returnToPlay || {});
    const recommendation = status.adaptation || recommendNextLoad({
      readiness: ready,
      status,
      restrictions: status.restrictions,
      activeInjuries: status.activeInjuries,
      returnToPlay: rtp,
      developmentPlan: status.developmentPlan,
    });
    const testReviewDue = safeArray(ready.dataProvenance?.missingSources).includes('neuro') || safeArray(ready.dataProvenance?.staleSources).includes('neuro');
    let priority = finite(ready.attentionScore, 0);
    if (ready.status === 'red') priority = Math.max(priority, 100);
    else if (ready.status === 'yellow') priority = Math.max(priority, 60);
    if (rtp.active) priority = Math.max(priority, rtp.reviewDue ? 96 : 72);
    if (safeArray(status.activeInjuries).length) priority = Math.max(priority, 88);
    if (status.developmentPlan?.review?.due) priority = Math.max(priority, 58);
    if (testReviewDue) priority = Math.max(priority, 45);
    if (safeArray(status.live?.alerts).length) priority = Math.max(priority, 82);
    if (status.live?.completed && !status.feedback) priority = Math.max(priority, 55);
    if (!status.hasSession) priority = Math.max(priority, 35);
    return { ...row, readiness: ready, returnToPlay: rtp, recommendation, testReviewDue, priority };
  }).sort((a, b) => b.priority - a.priority || String(a.player?.name || '').localeCompare(String(b.player?.name || ''), 'ru'));

  const summary = athletes.reduce((acc, item) => {
    if (item.readiness.status === 'red') acc.red += 1;
    if (item.readiness.status === 'yellow') acc.yellow += 1;
    if (item.readiness.status === 'green') acc.green += 1;
    if (item.status.hasSession) acc.planned += 1;
    if (item.status.live?.started) acc.started += 1;
    if (item.status.live?.completed) acc.completed += 1;
    if (item.returnToPlay.active) acc.rtp += 1;
    if (item.testReviewDue) acc.testsDue += 1;
    if (item.priority >= 60) acc.decisions += 1;
    return acc;
  }, { total: athletes.length, red: 0, yellow: 0, green: 0, planned: 0, started: 0, completed: 0, rtp: 0, testsDue: 0, decisions: 0 });

  return {
    athletes,
    summary,
    platform: {
      healthy: platformHealth?.status === 'healthy',
      status: platformHealth?.status || 'unknown',
      p95Ms: platformHealth?.readinessPerformance?.p95Ms ?? null,
      sloHealthy: Boolean(platformHealth?.readinessPerformance?.healthy),
    },
  };
}
