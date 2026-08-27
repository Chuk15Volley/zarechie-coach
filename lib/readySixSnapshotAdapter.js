function dateOf(record) {
  return record?.date || record?.submittedAt?.slice?.(0, 10) || null;
}

function normalizeDated(records, targetDate, days) {
  const cursor = new Date(`${targetDate}T12:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() - Math.max(0, days - 1));
  const cutoff = cursor.toISOString().slice(0, 10);
  return (Array.isArray(records) ? records : [])
    .map(record => {
      const date = dateOf(record);
      return date ? { ...record, date } : null;
    })
    .filter(record => record && record.date >= cutoff && record.date <= targetDate)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

function newestByDate(records) {
  const byDate = new Map();
  for (const record of records) {
    const current = byDate.get(record.date);
    if (!current || String(record.submittedAt || '') >= String(current.submittedAt || '')) {
      byDate.set(record.date, record);
    }
  }
  return [...byDate.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

function latest(records) {
  return [...records].sort((left, right) =>
    String(right.date).localeCompare(String(left.date))
    || String(right.submittedAt || '').localeCompare(String(left.submittedAt || ''))
  )[0] || null;
}

export function normalizeReadySixRoster(payload) {
  return (payload?.players || []).map(player => ({
    id: String(player.id || ''),
    readySixPlayerId: String(player.readySixPlayerId || player.id || ''),
    name: String(player.name || ''),
    position: String(player.position || ''),
    whoopUserId: player.identities?.whoopUserId || null,
  })).filter(player => player.id && player.name);
}

export function normalizeReadySixPlayerSnapshot(payload, { days = 7, chronicDays = 28, targetDate } = {}) {
  if (!payload?.player || !payload?.monitoring) return null;
  const resolvedDate = targetDate || payload.date;
  const monitoring = payload.monitoring;
  const historyWindow = Math.max(days, chronicDays);
  const whoopAll = normalizeDated(monitoring.whoop, resolvedDate, historyWindow);
  const morningAll = normalizeDated(monitoring.morning, resolvedDate, historyWindow);
  const eveningAll = normalizeDated(monitoring.evening, resolvedDate, historyWindow);
  const postEveningAll = normalizeDated(monitoring.postEvening, resolvedDate, historyWindow);
  const postMorningAll = normalizeDated(monitoring.postMorning, resolvedDate, historyWindow);
  const surveysAll = newestByDate([...eveningAll, ...postEveningAll]);
  const whoop = normalizeDated(whoopAll, resolvedDate, days);
  const morning = normalizeDated(morningAll, resolvedDate, days);
  const surveys = normalizeDated(surveysAll, resolvedDate, days);
  const postMorningSurveys = normalizeDated(postMorningAll, resolvedDate, days);
  const neuro = monitoring.neuro
    ? { latest: monitoring.neuro, history: monitoring.neuro?.hist?.cmj || [] }
    : null;
  const manual = { ...(monitoring.manual || {}) };
  for (const row of monitoring.vertHistory || []) {
    if (!row?.date || row.jumps == null) continue;
    manual[row.date] = { ...(manual[row.date] || {}), jumps: Number(row.jumps), source: 'vert_team_pdf' };
  }
  if (monitoring.vert?.jumps != null && resolvedDate) {
    manual[resolvedDate] = { ...(manual[resolvedDate] || {}), jumps: Number(monitoring.vert.jumps), source: 'vert_team_pdf' };
  }

  return {
    player: {
      id: String(payload.player.id),
      readySixPlayerId: String(payload.player.readySixPlayerId || payload.player.id),
      name: String(payload.player.name || payload.player.id),
      position: String(payload.player.position || ''),
      whoopUserId: payload.player.identities?.whoopUserId || payload.player.id,
      photo: null,
    },
    whoop,
    surveys,
    morning,
    postMorningSurveys,
    neuro,
    manual,
    periodDays: days,
    targetDate: resolvedDate,
    chronicWhoop: normalizeDated(whoopAll, resolvedDate, chronicDays),
    chronicSurveys: normalizeDated(surveysAll, resolvedDate, chronicDays),
    chronicPostMorningSurveys: normalizeDated(postMorningAll, resolvedDate, chronicDays),
    latestSurvey: latest(surveysAll),
    latestMorning: latest(morningAll),
    latestPostMorning: latest(postMorningAll),
    injuryLog: Array.isArray(monitoring.injuryLog) ? monitoring.injuryLog : [],
    annotations: monitoring.annotations || null,
    readySixDecision: payload.decision || null,
    readySixMeta: {
      organizationId: payload.organizationId,
      revision: payload.revision,
      generatedAt: payload.generatedAt,
      dataQuality: monitoring.dataQuality || null,
    },
  };
}

export function normalizeReadySixTeamReadiness(payload) {
  const entries = (payload?.players || []).map(entry => {
    const snapshot = normalizeReadySixPlayerSnapshot({
      ...payload,
      mode: 'player-context',
      player: entry.player,
      monitoring: {
        whoop: entry.monitoring?.whoop || [],
        morning: entry.monitoring?.morning || [],
        evening: [],
        postEvening: [],
        postMorning: [],
        manual: {},
        injuryLog: [],
        annotations: null,
        neuro: entry.monitoring?.neuro || null,
        dataQuality: entry.monitoring?.dataQuality || null,
      },
      decision: entry.decision || null,
    }, { days: 28, chronicDays: 28, targetDate: payload.date });
    return {
      player: normalizeReadySixRoster({ players: [entry.player] })[0],
      snapshot,
    };
  }).filter(entry => entry.player && entry.snapshot);
  return {
    roster: entries.map(entry => entry.player),
    snapshots: entries.map(entry => entry.snapshot),
  };
}
