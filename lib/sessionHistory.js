// lib/sessionHistory.js
// Fetches the most recent saved sessions for a player and converts them into a compact
// text summary that fits in the AI prompt without blowing the token budget.
// Each saved session is ~50-80 tokens in this format — 10 sessions ≈ 600-800 tokens.

import { strengthSessionCompletion } from './strengthCompletion.mjs';
import { redis, redisPipeline } from './redis';
import { pfx, sessionKey } from './workspacePrefix';

function shiftDate(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export async function countPreviousConsecutiveMatchDaySessions(playerId, targetDate, workspace = 'zarechie') {
  if (!playerId || !targetDate) return 0;
  let count = 0;
  for (let offset = 1; offset <= 2; offset += 1) {
    const raw = await redis('get', sessionKey(workspace, playerId, shiftDate(targetDate, -offset))).catch(() => null);
    if (!raw) break;
    try {
      const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (record?.quality?.seasonDecision?.key !== 'match_day') break;
      count += 1;
    } catch {
      break;
    }
  }
  return count;
}

// Select by score BEFORE limiting: future plans must not crowd out past sessions.
export async function getRecentSessionRecords(playerId, maxSessions = 10, workspace = 'zarechie', targetDate = null, { strict = false, includeCycleHistory = false } = {}) {
  const p = pfx(workspace);
  // Strength cycles can span many uncompleted plans; never truncate their facts.
  const historyLimit = includeCycleHistory ? 1000 : maxSessions;
  // ReadySix now uses numeric ids; older NK/WHOOP programs retain whoop_.
  // Read both identities within this workspace before limiting the date window.
  const id = String(playerId);
  const numeric = id.replace(/^whoop_/, '');
  const ids = /^\d+$/.test(numeric) ? [...new Set([id, numeric, `whoop_${numeric}`])] : [id];
  const indexes = await Promise.all(ids.map(value => targetDate
    ? redis('zrevrangebyscore', `${p}:sessions:${value}`, String(Number(targetDate.replace(/-/g, '')) - 1), '-inf', 'LIMIT', 0, historyLimit)
    : redis('zrange', `${p}:sessions:${value}`, -historyLimit, -1)));
  if (strict && indexes.some(dates => !Array.isArray(dates))) throw new Error('Saved session index is unavailable');
  if (strict && includeCycleHistory && indexes.some(dates => dates.length >= historyLimit)) throw new Error('Strength history exceeds safe window');
  const eligible = [...new Set(indexes.flatMap(dates => dates || []))].filter(date => !targetDate || date < targetDate).sort().slice(-historyLimit);
  if (!eligible.length) return [];
  const reads = eligible.flatMap(date => ids.filter((_, i) => (indexes[i] || []).includes(date)).map(value => ({ date, value })));
  const results = await redisPipeline(reads.map(({date, value}) => ['get', `${p}:session:${value}:${date}`]));
  const records = new Map();
  const sources = new Map();
  reads.forEach(({date,value}, index) => {
    try {
      const raw = results[index];
      const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (strict && !Array.isArray(record?.session?.blocks)) throw new Error('Saved session history is incomplete');
      if (!record?.session?.blocks?.length) return;
      const current = records.get(date);
      if (!current || String(record.savedAt || record.generatedAt || '') > String(current.savedAt || current.generatedAt || '')) { records.set(date, {...record, date}); sources.set(date,value); }
    } catch (error) { if (strict) throw error; }
  });
  const strength = [...records.values()].filter(record => (record.focus || record.quality?.focus) === 'inseason_strength');
  const facts = strength.length ? await redisPipeline(strength.flatMap(record => [
    ['get',`${p}:session:actual:${sources.get(record.date)}:${record.date}`], ['get',`${p}:log:${sources.get(record.date)}:${record.date}`],
  ])) : [];
  if (strict && facts.length !== strength.length * 2) throw new Error('Strength execution history unavailable');
  const parse = raw => { if (!raw) return null; return typeof raw === 'string' ? JSON.parse(raw) : raw; };
  strength.forEach((record,index)=>{
    try { record.strengthCompletion = strengthSessionCompletion(record,parse(facts[index*2]),parse(facts[index*2+1])); }
    catch(error) { if(strict) throw error; record.strengthCompletion={completed:false,source:null}; }
  });
  return eligible.map(date => records.get(date)).filter(Boolean);
}

export async function getRecentSessionSummaries(playerId, maxSessions = 10, workspace = 'zarechie', targetDate = null) {
  const records = await getRecentSessionRecords(playerId, maxSessions, workspace, targetDate);
  return records.map(formatSummary).filter(Boolean);
}

function utcDayDistance(fromDate, toDate) {
  return Math.round((new Date(`${toDate}T12:00:00Z`) - new Date(`${fromDate}T12:00:00Z`)) / 86400000);
}

function exerciseByCode(session, code) {
  return (session?.blocks || []).flatMap(block => block.exercises || [])
    .find(exercise => String(exercise?.code || '').toUpperCase() === code);
}

// Strength anchors are kept outside the model prompt history so the selected
// lower A1 and upper B1 inform recovery and load selection; exercise rotation
// is enforced separately by the variety policy.
export async function getRecentStrengthAnchors(playerId, targetDate, workspace = 'zarechie') {
  if (!playerId || !targetDate) return null;
  const p = pfx(workspace);
  const dates = await redis('zrevrangebyscore', `${p}:sessions:${playerId}`, String(Number(targetDate.replace(/-/g, '')) - 1), '-inf', 'LIMIT', 0, 12).catch(() => []);
  const eligibleDates = (dates || []).filter(date => date < targetDate).sort().slice(-12);
  if (!eligibleDates.length) return null;
  const results = await redisPipeline(eligibleDates.map(date => ['get', `${p}:session:${playerId}:${date}`])).catch(() => []);
  const strengthRecords = eligibleDates.flatMap((date, index) => {
    const raw = results[index];
    if (!raw) return [];
    try {
      const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const focus = record?.focus || record?.quality?.focus || '';
      return focus === 'inseason_strength' ? [{ date, record }] : [];
    } catch {
      return [];
    }
  });
  if (!strengthRecords.length) return null;
  const latest = strengthRecords[strengthRecords.length - 1];
  const lowerAnchor = exerciseByCode(latest.record?.session, 'A1')?.name || null;
  const upperAnchor = exerciseByCode(latest.record?.session, 'B1')?.name || null;
  const daysSince = utcDayDistance(latest.date, targetDate);
  const matchingExposureCount = strengthRecords.slice().reverse().filter(({ record }) => {
    const lower = exerciseByCode(record?.session, 'A1')?.name || null;
    const upper = exerciseByCode(record?.session, 'B1')?.name || null;
    return lower === lowerAnchor && upper === upperAnchor;
  }).length;
  return {
    latestDate: latest.date,
    lowerAnchor,
    upperAnchor,
    daysSince,
    closeExposure: daysSince < 2,
    reentryRequired: daysSince >= 14,
    matchingExposureCount,
  };
}

export function formatSummary(record) {
  const { session, date, dayGoal } = record;
  if (!session || !date) return null;

  const method = record.focus || record.quality?.focus || '';
  const header = dayGoal ? `${date} (цель: «${dayGoal}»):` : `${date}:`;
  const blockLines = (session.blocks || []).map(block => {
    const exercises = (block.exercises || [])
      .map(ex => {
        // Show all sets (e.g. "5/5/3/1") not just the first — captures ramping and peak load
        const setsStr = (ex.targetSets || []).join('/') || '—';
        const weight = ex.weightNote ? ` @${ex.weightNote}` : '';
        const tempo = ex.tempo && ex.tempo !== 'контролируемый' ? ` ${ex.tempo}` : '';
        // Prefix with exercise code (A1/B2/etc) so DUP vector is immediately visible
        const code = ex.code ? `[${ex.code}] ` : '';
        return `${code}${ex.name} (${setsStr}${weight}${tempo})`;
      })
      .join(', ');
    return `  ${block.label}: ${exercises}`;
  });

  return [header + (method ? ` Метод: ${method}; тип: ${record.trainingType || '—'}` : ''), ...blockLines].join('\n');
}
