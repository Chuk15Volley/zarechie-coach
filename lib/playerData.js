// lib/playerData.js
// Aggregates a player's WHOOP history, survey history and neuro test data
// from the same Redis instance used by the zarechie dashboard.
//
// Everything is anchored to a `targetDate` (the day the trainer is building a
// session for, defaults to today) rather than "now" — so a program can be
// regenerated for a past day using exactly the data that was known on it.

import { redis, redisPipeline } from './redis';

export function todayISO() {
  // Always use Moscow timezone (UTC+3) — server runs UTC, planner works evenings MSK
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

function daysBefore(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

async function getPlayerInfo(id) {
  const [rosterRaw, whoopRaw] = await redisPipeline([
    ['get', `roster:player:${id}`],
    ['get', `whoop:player:${id}`],
  ]);
  const raw = whoopRaw || rosterRaw;
  if (!raw) return null;
  const p = JSON.parse(raw);
  return {
    id,
    name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
    position: p.position || '',
    whoopUserId: p.whoopUserId || p.whoop_id || id,
  };
}

// Fetches a batch of keys in a single Redis round-trip, parses each as JSON
// and tags it with the date it came from (the key doesn't carry the date once parsed).
async function getDatedBatch(dates, keyFor) {
  if (!dates.length) return [];
  const raws = await redisPipeline(dates.map(date => ['get', keyFor(date)]));
  return dates
    .map((date, i) => {
      const raw = raws[i];
      if (!raw) return null;
      try { return { date, ...JSON.parse(raw) }; } catch { return null; }
    })
    .filter(Boolean);
}

// Window of dates ending on (and including) targetDate, oldest first.
function windowDates(targetDate, days) {
  return Array.from({ length: days }, (_, i) => daysBefore(targetDate, days - 1 - i));
}

async function getWhoopHistory(id, days, targetDate) {
  const known = await redis('smembers', `whoop:history:dates:${id}`) || [];
  const cutoff = daysBefore(targetDate, days - 1);
  const recent = known.filter(d => d >= cutoff && d <= targetDate).sort();
  return getDatedBatch(recent, date => `whoop:history:${id}:${date}`);
}

async function getSurveyHistory(id, days, targetDate) {
  const known = await redis('smembers', `survey:dates:${id}`) || [];
  const cutoff = daysBefore(targetDate, days - 1);
  const recent = known.filter(d => d >= cutoff && d <= targetDate).sort();
  return getDatedBatch(recent, date => `survey:${id}:${date}`);
}

async function getMorningHistory(id, days, targetDate) {
  const dates = windowDates(targetDate, days);
  return getDatedBatch(dates, date => `survey:morning:${id}:${date}`);
}

async function getNeuroHistory(id) {
  const [snapshotRaw, historyRaw] = await Promise.all([
    redis('get', 'neuro:data'),
    redis('get', `neuro:history:${id}`).catch(() => null),
  ]);

  let latest = null;
  if (snapshotRaw) {
    try {
      const db = JSON.parse(snapshotRaw);
      latest = db[id] || null;
    } catch {}
  }

  let history = [];
  if (historyRaw) {
    try { history = JSON.parse(historyRaw); } catch {}
  }

  if (!latest && !history.length) return null;
  return { latest, history };
}

async function getManualData(id) {
  const raw = await redis('get', `manual:snapshot:${id}`);
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
}

async function getAnnotations(id) {
  const raw = await redis('get', 'annotations:data');
  if (!raw) return null;
  try {
    const db = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // annotations:data stores { [playerId]: data } — return player's slice
    return db[id] || null;
  } catch { return null; }
}

async function getInjuryLog(id) {
  const raw = await redis('get', `injury:log:${id}`);
  if (!raw) return [];
  try {
    const records = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(records) ? records : [];
  } catch { return []; }
}

// Returns a single aggregated object describing the player's state going into
// `targetDate` — exact-day records (where available) plus a trailing trend
// window — everything an S&C coach would need to design a session.
export async function getPlayerSnapshot(id, days = 7, targetDate = todayISO(), chronicDays = 28) {
  const [info, whoop, surveys, morning, neuro, manual, chronicWhoop, chronicSurveys, injuryLog, annotations] = await Promise.all([
    getPlayerInfo(id),
    getWhoopHistory(id, days, targetDate),
    getSurveyHistory(id, days, targetDate),
    getMorningHistory(id, days, targetDate),
    getNeuroHistory(id),
    getManualData(id),
    // Chronic windows for ACWR (28 days) — loaded in parallel
    chronicDays > days ? getWhoopHistory(id, chronicDays, targetDate) : Promise.resolve(null),
    chronicDays > days ? getSurveyHistory(id, chronicDays, targetDate) : Promise.resolve(null),
    getInjuryLog(id),
    getAnnotations(id),
  ]);

  if (!info) return null;

  return {
    player: info,
    whoop,
    surveys,
    morning,
    neuro,
    manual,
    periodDays: days,
    targetDate,
    // Chronic data for 28-day calculations (null = same as whoop/surveys)
    chronicWhoop: chronicWhoop ?? whoop,
    chronicSurveys: chronicSurveys ?? surveys,
    injuryLog,
    annotations,
  };
}
