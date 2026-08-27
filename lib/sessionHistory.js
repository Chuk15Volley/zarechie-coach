// lib/sessionHistory.js
// Fetches the most recent saved sessions for a player and converts them into a compact
// text summary that fits in the AI prompt without blowing the token budget.
// Each saved session is ~50-80 tokens in this format — 10 sessions ≈ 600-800 tokens.

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

export async function getRecentSessionSummaries(playerId, maxSessions = 10, workspace = 'zarechie') {
  const p = pfx(workspace);
  // Get the N most recent session dates from the sorted set (ascending by score = date int)
  const dates = await redis('zrange', `${p}:sessions:${playerId}`, -maxSessions, -1);
  if (!dates || dates.length === 0) return [];

  // Batch-fetch all session records in one pipeline round-trip
  const results = await redisPipeline(dates.map(d => ['get', `${p}:session:${playerId}:${d}`]));

  const summaries = [];
  for (let i = 0; i < dates.length; i++) {
    const raw = results[i];
    if (!raw) continue;
    try {
      const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const summary = formatSummary(record);
      if (summary) summaries.push(summary);
    } catch (_) {
      // Skip malformed records
    }
  }

  return summaries; // oldest first (chronological)
}

function utcDayDistance(fromDate, toDate) {
  return Math.round((new Date(`${toDate}T12:00:00Z`) - new Date(`${fromDate}T12:00:00Z`)) / 86400000);
}

function exerciseByCode(session, code) {
  return (session?.blocks || []).flatMap(block => block.exercises || [])
    .find(exercise => String(exercise?.code || '').toUpperCase() === code);
}

// Strength anchors are kept outside the model prompt history so the selected
// lower A1 and upper B1 can be continued deterministically for 4–6 exposures.
export async function getRecentStrengthAnchors(playerId, targetDate, workspace = 'zarechie') {
  if (!playerId || !targetDate) return null;
  const p = pfx(workspace);
  const dates = await redis('zrange', `${p}:sessions:${playerId}`, -16, -1).catch(() => []);
  const eligibleDates = (dates || []).filter(date => date < targetDate).slice(-12);
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

function formatSummary(record) {
  const { session, date, dayGoal } = record;
  if (!session || !date) return null;

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

  return [header, ...blockLines].join('\n');
}
