function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeIso(value, fallback = null) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function mergeField(existingValues, existingClocks, incomingValues, incomingClocks, fallbackClock) {
  const values = { ...safeObject(existingValues) };
  const clocks = { ...safeObject(existingClocks) };
  for (const [key, value] of Object.entries(safeObject(incomingValues))) {
    const incomingClock = safeIso(incomingClocks?.[key], fallbackClock);
    const existingClock = safeIso(clocks[key], null);
    if (!existingClock || !incomingClock || incomingClock >= existingClock) {
      values[key] = value;
      if (incomingClock) clocks[key] = incomingClock;
    }
  }
  return { values, clocks };
}

export function mergeWorkoutProgress(existing = {}, incoming = {}, now = new Date().toISOString()) {
  const current = safeObject(existing);
  const next = safeObject(incoming);
  const recentRequestIds = Array.isArray(current.recentRequestIds) ? current.recentRequestIds : (current.lastRequestId ? [current.lastRequestId] : []);
  if (next.requestId && recentRequestIds.includes(next.requestId)) return current;

  const fallbackClock = safeIso(next.lastActionAt || next.savedAt, now);
  const doneMerge = mergeField(current.done, current.setUpdatedAt, next.done, next.setUpdatedAt, fallbackClock);
  const weightMerge = mergeField(current.weights, current.weightUpdatedAt, next.weights, next.weightUpdatedAt, fallbackClock);
  const clientId = String(next.clientId || '').slice(0, 80);
  const devices = { ...safeObject(current.devices) };
  if (clientId) {
    devices[clientId] = {
      lastSeen: now,
      label: String(next.deviceLabel || 'Устройство игрока').slice(0, 80),
    };
  }

  const incomingRevision = Number(next.clientRevision ?? next.revision) || 0;
  const currentActionAt = safeIso(current.lastActionAt, null);
  const incomingActionAt = safeIso(next.lastActionAt, currentActionAt ? null : fallbackClock);
  const incomingMetadataIsNewer = !currentActionAt || Boolean(incomingActionAt && incomingActionAt >= currentActionAt);
  const requestIds = next.requestId
    ? [...recentRequestIds.filter(id => id !== next.requestId), next.requestId].slice(-24)
    : recentRequestIds.slice(-24);
  return {
    ...current,
    done: doneMerge.values,
    weights: weightMerge.values,
    setUpdatedAt: doneMerge.clocks,
    weightUpdatedAt: weightMerge.clocks,
    startedAt: current.startedAt || safeIso(next.startedAt, null),
    completedAt: incomingMetadataIsNewer ? safeIso(next.completedAt, null) : (current.completedAt || null),
    elapsedSeconds: incomingMetadataIsNewer && Number.isFinite(Number(next.elapsedSeconds))
      ? Math.max(0, Math.min(86400, Math.round(Number(next.elapsedSeconds))))
      : Number(current.elapsedSeconds) || 0,
    activeBlock: incomingMetadataIsNewer && Number.isInteger(Number(next.activeBlock)) ? Number(next.activeBlock) : (current.activeBlock ?? null),
    restUntil: incomingMetadataIsNewer ? safeIso(next.restUntil, null) : (current.restUntil || null),
    lastActionAt: incomingMetadataIsNewer ? incomingActionAt : currentActionAt,
    revision: Math.max(Number(current.revision) || 0, incomingRevision) + 1,
    lastRequestId: next.requestId || current.lastRequestId || null,
    recentRequestIds: requestIds,
    devices,
    savedAt: now,
  };
}

export function summarizePlayerWorkout(session, log = {}, feedback = null, now = new Date().toISOString()) {
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const done = safeObject(log?.done);
  const blockStats = blocks.map((block, bi) => {
    const total = (block.exercises || []).reduce((sum, ex) => sum + (ex.targetSets?.length || 0), 0);
    const completed = (block.exercises || []).reduce((sum, ex, ei) =>
      sum + (ex.targetSets || []).filter((_, si) => Boolean(done[`${bi}-${ei}-${si}`])).length, 0);
    return { label: block.label || String.fromCharCode(65 + bi), total, completed, complete: total > 0 && total === completed };
  });
  const totalSets = blockStats.reduce((sum, block) => sum + block.total, 0);
  const completedSets = blockStats.reduce((sum, block) => sum + block.completed, 0);
  const activeIndex = blockStats.findIndex(block => !block.complete);
  const completed = totalSets > 0 && completedSets === totalSets;
  const started = Boolean(log?.startedAt || completedSets > 0);
  const lastSyncMs = log?.savedAt ? new Date(log.savedAt).getTime() : 0;
  const stale = started && !completed && lastSyncMs > 0 && (new Date(now).getTime() - lastSyncMs) > 120000;
  const restOverdue = Boolean(log?.restUntil && !completed && new Date(log.restUntil).getTime() < new Date(now).getTime());
  const highLoad = Number(feedback?.rpe) >= 9 || Number(feedback?.fatigue) >= 4;
  const alerts = [stale && 'Нет синхронизации более 2 минут', restOverdue && 'Время отдыха завершено', highLoad && 'Высокая субъективная нагрузка'].filter(Boolean);
  return {
    started,
    completed,
    totalSets,
    completedSets,
    progress: totalSets ? Math.round(completedSets / totalSets * 100) : 0,
    activeBlock: activeIndex >= 0 ? blockStats[activeIndex]?.label : null,
    blockStats,
    lastSyncAt: log?.savedAt || null,
    startedAt: log?.startedAt || null,
    completedAt: log?.completedAt || null,
    elapsedSeconds: Number(log?.elapsedSeconds) || 0,
    deviceCount: Object.keys(safeObject(log?.devices)).length,
    alerts,
  };
}
