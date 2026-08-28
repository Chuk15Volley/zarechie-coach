import crypto from 'node:crypto';

const MODES = new Set(['progress', 'maintain', 'reduce', 'recover', 'hold', 'rtp']);

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value, max = 200) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundedHalf(value) {
  return Math.round(value * 2) / 2;
}

export function normalizeAdaptationRecommendation(input = {}) {
  const mode = MODES.has(input.mode) ? input.mode : 'maintain';
  const growthMode = mode === 'progress';
  return {
    mode,
    label: clean(input.label, 120) || 'Сохранить нагрузку',
    volumePercent: Math.round(clamp(finite(input.volumePercent, 100), 0, growthMode ? 103 : 100)),
    intensityPercent: Math.round(clamp(finite(input.intensityPercent, 100), 0, growthMode ? 102 : 100)),
    rpeCap: Math.round(clamp(finite(input.rpeCap, 8), 0, 10) * 10) / 10,
    confidence: ['low', 'medium', 'high'].includes(input.confidence) ? input.confidence : 'low',
    reasons: safeArray(input.reasons).map(value => clean(value, 180)).filter(Boolean).slice(0, 5),
    safeguards: safeArray(input.safeguards).map(value => clean(value, 220)).filter(Boolean).slice(0, 5),
    requiresCoachApproval: true,
  };
}

function sessionStats(session) {
  const exercises = safeArray(session?.blocks).flatMap(block => safeArray(block.exercises));
  return exercises.reduce((summary, exercise) => {
    const sets = safeArray(exercise.targetSets).length || Math.max(0, Math.round(finite(exercise.sets, 0)));
    const kg = Math.max(0, finite(exercise.weightKg, 0));
    summary.exercises += 1;
    summary.sets += sets;
    summary.loadedSets += kg > 0 ? sets : 0;
    summary.loadKgSets += roundedHalf(kg * sets);
    return summary;
  }, { exercises: 0, sets: 0, loadedSets: 0, loadKgSets: 0 });
}

export function adaptSessionDraft(session, recommendationInput, options = {}) {
  if (!session || !Array.isArray(session.blocks)) throw new Error('Session is required');
  const recommendation = normalizeAdaptationRecommendation(recommendationInput);
  const draftId = clean(options.draftId, 80) || crypto.randomUUID();
  const createdAt = options.createdAt || new Date().toISOString();
  const before = sessionStats(session);
  const blocks = session.blocks.map(block => ({
    ...block,
    exercises: safeArray(block.exercises).map(exercise => {
      const originalSets = safeArray(exercise.targetSets);
      const desiredSets = originalSets.length
        ? Math.max(recommendation.volumePercent === 0 ? 0 : 1, Math.min(originalSets.length, Math.round(originalSets.length * recommendation.volumePercent / 100)))
        : null;
      const currentKg = Math.max(0, finite(exercise.weightKg, 0));
      const nextKg = currentKg > 0 ? roundedHalf(currentKg * recommendation.intensityPercent / 100) : 0;
      const rpeInstruction = recommendation.rpeCap > 0 ? `RPE ≤ ${recommendation.rpeCap}` : 'Только после допуска тренера';
      return {
        ...exercise,
        ...(desiredSets == null ? {} : { targetSets: originalSets.slice(0, desiredSets) }),
        ...(currentKg > 0 ? { weightKg: nextKg } : {}),
        autoReg: [clean(exercise.autoReg, 180), rpeInstruction].filter(Boolean).join(' · ').slice(0, 240),
      };
    }),
  }));
  const adapted = {
    ...session,
    blocks,
    adaptation: {
      schema: 'zarechie.session-adaptation.v1',
      draftId,
      status: 'draft',
      createdAt,
      baseSavedAt: options.baseSavedAt || null,
      recommendation,
    },
  };
  return { draftId, session: adapted, recommendation, before, after: sessionStats(adapted) };
}

export function markAdaptationApplied(session, appliedAt = new Date().toISOString()) {
  if (!session?.adaptation?.draftId) return session;
  return { ...session, adaptation: { ...session.adaptation, status: 'applied', appliedAt } };
}

export function adaptationVersionSummary(record, index = 0) {
  const adaptation = record?.session?.adaptation || null;
  return {
    id: String(record?.savedAt || `version-${index}`),
    savedAt: record?.savedAt || null,
    label: record?.trainingLabel || record?.focus || 'Тренировка',
    adaptation: adaptation ? {
      status: adaptation.status || null,
      mode: adaptation.recommendation?.mode || null,
      label: adaptation.recommendation?.label || null,
      appliedAt: adaptation.appliedAt || null,
    } : null,
    stats: sessionStats(record?.session),
  };
}
