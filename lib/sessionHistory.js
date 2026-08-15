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
