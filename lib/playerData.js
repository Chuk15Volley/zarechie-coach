// lib/playerData.js
// Aggregates a player's WHOOP history, survey history and neuro test data
// from the same Redis instance used by the zarechie dashboard.
//
// Everything is anchored to a `targetDate` (the day the trainer is building a
// session for, defaults to today) rather than "now" — so a program can be
// regenerated for a past day using exactly the data that was known on it.

import { redis, redisPipeline } from './redis';
import { getNKWhoopHistory, getNKNeuroData, getNKMorningSurvey, getNKSurveyHistory } from './nkperfClient';
import { annotationsKey, injuryLogKey, manualSnapshotKey, rosterKey } from './workspacePrefix';
import { extractPlayerPhoto } from './playerPhotos';
import { dashboardRedis, dashboardRedisPipeline, hasZarechieDashboardStore } from './zarechieDashboardStore';

// Upstash's REST client sometimes returns already-parsed objects (not strings).
// Parse defensively so a non-string value never throws in JSON.parse.
function parseJSON(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

export function todayISO() {
  // Always use Moscow timezone (UTC+3) — server runs UTC, planner works evenings MSK
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

function daysBefore(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// Candidate ID variants for a player. The UI sends the canonical numeric id
// (whoop_ prefix stripped in players/list.js), but the zarechie dashboard may
// have written per-player Redis keys under the whoop_-prefixed id.
function idVariants(id) {
  const s = String(id);
  const variants = [s];
  if (!s.startsWith('whoop_')) variants.push(`whoop_${s}`);
  else variants.push(s.replace(/^whoop_/, ''));
  return variants;
}

function sourceIdVariants(...ids) {
  const seen = new Set();
  for (const id of ids) {
    if (id == null || id === '') continue;
    for (const variant of idVariants(id)) seen.add(variant);
  }
  return [...seen];
}

// Zarechie monitoring has moved to the main dashboard's Supabase-backed KV.
// Keep a per-key legacy fallback so historic coach records remain available
// while the app reads newly submitted questionnaires from the live source.
async function zarechieRead(command, ...args) {
  if (!hasZarechieDashboardStore()) return redis(command, ...args);
  const current = await dashboardRedis(command, ...args).catch(() => null);
  if (current != null && (!Array.isArray(current) || current.length)) return current;
  const legacy = await redis(command, ...args).catch(() => null);
  return legacy ?? current;
}

async function zarechiePipeline(commands) {
  if (!hasZarechieDashboardStore()) return redisPipeline(commands);
  const current = await dashboardRedisPipeline(commands).catch(() => null);
  if (!Array.isArray(current)) return redisPipeline(commands);
  if (!current.some(value => value == null)) return current;
  const legacy = await redisPipeline(commands).catch(() => []);
  return current.map((value, index) => value ?? legacy[index] ?? null);
}

// Matches a roster-array entry against any variant of the requested id.
function rosterMatch(arr, id) {
  if (!Array.isArray(arr)) return null;
  const wants = new Set(idVariants(id).map(String));
  return arr.find(p => {
    if (!p) return false;
    const pid = String(p.id);
    return wants.has(pid) || wants.has(pid.replace(/^whoop_/, ''));
  }) || null;
}

function playerFromRecord(p, id) {
  return {
    id: String(id),
    name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
    position: p.position || '',
    whoopUserId: p.whoopUserId || p.whoopId || p.whoop_id || p.whoop || p.externalId || String(id),
    photo: extractPlayerPhoto(p) || null,
  };
}

async function getPlayerInfo(id, workspace = 'zarechie') {
  // NK Performance players live only in the nkperf:roster array (see api/nkperf/sync.js),
  // not as per-player roster:player:{id} keys. Resolve them from that array first.
  if (workspace === 'nkperf') {
    const nkRosterRaw = await redis('get', rosterKey(workspace)).catch(() => null);
    const found = rosterMatch(parseJSON(nkRosterRaw), id);
    if (found) return playerFromRecord(found, id);
    return null;
  }

  // Try every id variant against both per-player key namespaces in one round-trip.
  const variants = idVariants(id);
  const cmds = variants.flatMap(v => [
    ['get', `roster:player:${v}`],
    ['get', `whoop:player:${v}`],
  ]);
  cmds.push(['get', 'coach:roster']);
  const results = await zarechiePipeline(cmds);

  for (let i = 0; i < variants.length * 2; i++) {
    const p = parseJSON(results[i]);
    if (p) return playerFromRecord(p, id);
  }

  // Fallback: the aggregate coach:roster array (kept in sync by players/list.js).
  const found = rosterMatch(parseJSON(results[results.length - 1]), id);
  if (found) return playerFromRecord(found, id);

  return null;
}

// Resolves which id variant actually has dated data behind a "dates" set key,
// so subsequent per-date reads use the same variant. Returns { id, dates }.
async function resolveDatedId(setKeyFor, id, sourceId = id) {
  for (const v of sourceIdVariants(id, sourceId)) {
    const known = await zarechieRead('smembers', setKeyFor(v)) || [];
    if (known.length) return { id: v, dates: known };
  }
  return { id: String(id), dates: [] };
}

// Fetches a batch of keys in a single Redis round-trip, parses each as JSON
// and tags it with the date it came from (the key doesn't carry the date once parsed).
async function getDatedBatch(dates, keyFor) {
  if (!dates.length) return [];
  const raws = await zarechiePipeline(dates.map(date => ['get', keyFor(date)]));
  return dates
    .map((date, i) => {
      const raw = raws[i];
      if (!raw) return null;
      try { return { date, ...(typeof raw === 'string' ? JSON.parse(raw) : raw) }; } catch { return null; }
    })
    .filter(Boolean);
}

// Window of dates ending on (and including) targetDate, oldest first.
function windowDates(targetDate, days) {
  return Array.from({ length: days }, (_, i) => daysBefore(targetDate, days - 1 - i));
}

function dateOf(record) {
  return record?.date || record?.day || record?.createdAt?.slice?.(0, 10) || record?.timestamp?.slice?.(0, 10) || null;
}

function normalizeDatedRecords(records, targetDate, days) {
  const cutoff = daysBefore(targetDate, days - 1);
  return (Array.isArray(records) ? records : [])
    .map(r => {
      const date = dateOf(r);
      return date ? { date, ...r } : null;
    })
    .filter(r => r && r.date >= cutoff && r.date <= targetDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function latestOnOrBefore(records, targetDate) {
  return [...(records || [])]
    .filter(record => record?.date && record.date <= targetDate)
    .sort((a, b) => {
      const byDate = String(b.date).localeCompare(String(a.date));
      if (byDate) return byDate;
      return String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''));
    })[0] || null;
}

async function getWhoopHistory(id, days, targetDate, workspace = 'zarechie', sourceId = id) {
  if (workspace === 'nkperf') {
    const history = await getNKWhoopHistory(sourceId, days).catch(() => []);
    return normalizeDatedRecords(history, targetDate, days);
  }
  const { id: rid, dates: known } = await resolveDatedId(v => `whoop:history:dates:${v}`, id, sourceId);
  const cutoff = daysBefore(targetDate, days - 1);
  const recent = known.filter(d => d >= cutoff && d <= targetDate).sort();
  return getDatedBatch(recent, date => `whoop:history:${rid}:${date}`);
}

async function getSurveyHistory(id, days, targetDate, workspace = 'zarechie', sourceId = id) {
  if (workspace === 'nkperf') {
    const history = await getNKSurveyHistory(sourceId).catch(() => []);
    return normalizeDatedRecords(history, targetDate, days);
  }
  const { id: rid, dates: known } = await resolveDatedId(v => `survey:dates:${v}`, id, sourceId);
  const cutoff = daysBefore(targetDate, days - 1);
  const recent = known.filter(d => d >= cutoff && d <= targetDate).sort();
  const indexed = await getDatedBatch(recent, date => `survey:${rid}:${date}`);

  // The dashboard writes this record in the same pipeline as the dated history.
  // Read it as a safety net: an evening survey submitted minutes before program
  // generation must not be missed if the dates index is briefly stale.
  let latest = null;
  for (const v of sourceIdVariants(id, sourceId)) {
    const raw = await zarechieRead('get', `survey:latest:${v}`).catch(() => null);
    const record = parseJSON(raw);
    const date = dateOf(record);
    if (record && date && date >= cutoff && date <= targetDate) {
      latest = { date, ...record };
      break;
    }
  }
  if (!latest) return indexed;

  // A manual re-submit or a legacy record can share a date with history.
  // Prefer the latest submitted version instead of allowing an older response
  // to win just because it was read first from the date index.
  const byDate = new Map(indexed.map(record => [record.date, record]));
  const current = byDate.get(latest.date);
  if (!current || String(latest.submittedAt || '') >= String(current.submittedAt || '')) {
    byDate.set(latest.date, latest);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function getLatestSurvey(id, targetDate, workspace = 'zarechie', sourceId = id) {
  if (workspace === 'nkperf') {
    const history = await getNKSurveyHistory(sourceId).catch(() => []);
    return latestOnOrBefore(history.map(record => ({ ...record, date: dateOf(record) })), targetDate);
  }

  const { id: rid, dates } = await resolveDatedId(v => `survey:dates:${v}`, id, sourceId);
  const latestDate = [...dates].filter(date => date <= targetDate).sort().pop();
  const indexed = latestDate
    ? (await getDatedBatch([latestDate], date => `survey:${rid}:${date}`))[0] || null
    : null;

  // `survey:latest` closes the small timing gap between the answer and its
  // dates index, while still respecting the requested training date.
  let latest = indexed;
  for (const variant of sourceIdVariants(id, sourceId)) {
    const record = parseJSON(await zarechieRead('get', `survey:latest:${variant}`).catch(() => null));
    const date = dateOf(record);
    if (!record || !date || date > targetDate) continue;
    const candidate = { date, ...record };
    if (!latest || date > latest.date || (date === latest.date && String(candidate.submittedAt || '') >= String(latest.submittedAt || ''))) {
      latest = candidate;
    }
  }
  return latest;
}

async function getMorningHistory(id, days, targetDate, workspace = 'zarechie', sourceId = id) {
  const dates = windowDates(targetDate, days);
  if (workspace === 'nkperf') {
    const items = await Promise.all(dates.map(async date => {
      const survey = await getNKMorningSurvey(sourceId, date).catch(() => null);
      return survey ? { date, ...survey } : null;
    }));
    return items.filter(Boolean);
  }
  // Try canonical id first; if it yields nothing, retry with the whoop_ variant.
  for (const v of sourceIdVariants(id, sourceId)) {
    const batch = await getDatedBatch(dates, date => `survey:morning:${v}:${date}`);
    if (batch.length) return batch;
  }
  return [];
}

async function getLatestMorning(id, targetDate, workspace = 'zarechie', sourceId = id) {
  if (workspace === 'nkperf') {
    // NK has no morning-history endpoint; use its available 14-day window and
    // return the most recent completed check-in rather than treating a gap as
    // an empty athlete status.
    const history = await getMorningHistory(id, 14, targetDate, workspace, sourceId);
    return latestOnOrBefore(history, targetDate);
  }

  const { id: rid, dates } = await resolveDatedId(v => `survey:morning:dates:${v}`, id, sourceId);
  const latestDate = [...dates].filter(date => date <= targetDate).sort().pop();
  if (!latestDate) return null;
  return (await getDatedBatch([latestDate], date => `survey:morning:${rid}:${date}`))[0] || null;
}

async function getNeuroHistory(id, workspace = 'zarechie', sourceId = id) {
  if (workspace === 'nkperf') {
    const db = await getNKNeuroData().catch(() => ({}));
    const variants = idVariants(id);
    if (sourceId && !variants.includes(String(sourceId))) variants.push(String(sourceId));
    let latest = null;
    for (const v of variants) {
      if (db?.[v]) { latest = db[v]; break; }
    }
    const history = Array.isArray(latest?.history) ? latest.history
      : Array.isArray(latest?.hist?.cmj) ? latest.hist.cmj
      : [];
    if (!latest && !history.length) return null;
    return { latest, history };
  }
  const variants = sourceIdVariants(id, sourceId);
  const [snapshotRaw, ...histRaws] = await Promise.all([
    zarechieRead('get', 'neuro:data'),
    ...variants.map(v => zarechieRead('get', `neuro:history:${v}`).catch(() => null)),
  ]);

  let latest = null;
  if (snapshotRaw) {
    try {
      const db = JSON.parse(snapshotRaw);
      for (const v of variants) { if (db[v]) { latest = db[v]; break; } }
    } catch {}
  }

  let history = [];
  for (const raw of histRaws) {
    if (!raw) continue;
    try { const h = JSON.parse(raw); if (Array.isArray(h) && h.length) { history = h; break; } } catch {}
  }

  if (!latest && !history.length) return null;
  return { latest, history };
}

async function getManualData(id, workspace = 'zarechie') {
  if (workspace === 'nkperf') {
    for (const v of idVariants(id)) {
      const raw = await redis('get', manualSnapshotKey(workspace, v)).catch(() => null);
      if (raw) { try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; } }
    }
    return {};
  }
  for (const v of idVariants(id)) {
    const raw = await redis('get', `manual:snapshot:${v}`);
    if (raw) { try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; } }
  }
  return {};
}

async function getAnnotations(id, workspace = 'zarechie') {
  const raw = workspace === 'nkperf'
    ? await redis('get', annotationsKey(workspace))
    : await zarechieRead('get', 'annotations:data');
  if (!raw) return null;
  try {
    const db = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // annotations:data stores { [playerId]: data } — return player's slice
    for (const v of idVariants(id)) { if (db[v]) return db[v]; }
    return null;
  } catch { return null; }
}

async function getInjuryLog(id, workspace = 'zarechie', sourceId = id) {
  if (workspace === 'nkperf') {
    for (const v of idVariants(id)) {
      const raw = await redis('get', injuryLogKey(workspace, v)).catch(() => null);
      if (!raw) continue;
      try {
        const records = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(records) && records.length) return records;
      } catch {}
    }
    return [];
  }
  for (const v of sourceIdVariants(id, sourceId)) {
    const raw = await zarechieRead('get', `injury:log:${v}`);
    if (!raw) continue;
    try {
      const records = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(records) && records.length) return records;
    } catch {}
  }
  return [];
}

// Returns a single aggregated object describing the player's state going into
// `targetDate` — exact-day records (where available) plus a trailing trend
// window — everything an S&C coach would need to design a session.
export async function getPlayerSnapshot(id, days = 7, targetDate = todayISO(), chronicDays = 28, workspace = 'zarechie') {
  const info = await getPlayerInfo(id, workspace);
  if (!info) return null;
  const sourceId = info.whoopUserId || id;

  const [whoop, surveys, morning, neuro, manual, chronicWhoop, chronicSurveys, injuryLog, annotations, latestSurvey, latestMorning] = await Promise.all([
    getWhoopHistory(id, days, targetDate, workspace, sourceId),
    getSurveyHistory(id, days, targetDate, workspace, sourceId),
    getMorningHistory(id, days, targetDate, workspace, sourceId),
    getNeuroHistory(id, workspace, sourceId),
    getManualData(id, workspace),
    // Chronic windows for ACWR (28 days) — loaded in parallel
    chronicDays > days ? getWhoopHistory(id, chronicDays, targetDate, workspace, sourceId) : Promise.resolve(null),
    chronicDays > days ? getSurveyHistory(id, chronicDays, targetDate, workspace, sourceId) : Promise.resolve(null),
    getInjuryLog(id, workspace, sourceId),
    getAnnotations(id, workspace),
    getLatestSurvey(id, targetDate, workspace, sourceId),
    getLatestMorning(id, targetDate, workspace, sourceId),
  ]);

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
    // The generator uses these for its current-state context when today's
    // questionnaire is missing. Dates remain explicit so stale data never
    // masquerades as a fresh readiness signal.
    latestSurvey,
    latestMorning,
    injuryLog,
    annotations,
  };
}
