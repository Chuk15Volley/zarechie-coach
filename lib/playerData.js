// lib/playerData.js
// Aggregates a player's WHOOP history, survey history and neuro test data
// from the same Redis instance used by the zarechie dashboard.

import { redis } from './redis';

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

async function getPlayerInfo(id) {
  const [rosterRaw, whoopRaw] = await Promise.all([
    redis('get', `roster:player:${id}`),
    redis('get', `whoop:player:${id}`),
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

async function getWhoopHistory(id, days) {
  const dates = await redis('smembers', `whoop:history:dates:${id}`) || [];
  const cutoff = dateNDaysAgo(days);
  const recent = dates.filter(d => d >= cutoff).sort();
  const records = await Promise.all(
    recent.map(async date => {
      const raw = await redis('get', `whoop:history:${id}:${date}`);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    })
  );
  return records.filter(Boolean);
}

async function getSurveyHistory(id, days) {
  const dates = await redis('smembers', `survey:dates:${id}`) || [];
  const cutoff = dateNDaysAgo(days);
  const recent = dates.filter(d => d >= cutoff).sort();
  const records = await Promise.all(
    recent.map(async date => {
      const raw = await redis('get', `survey:${id}:${date}`);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    })
  );
  return records.filter(Boolean);
}

async function getMorningHistory(id, days) {
  const dateList = Array.from({ length: days }, (_, i) => dateNDaysAgo(i));
  const records = await Promise.all(
    dateList.map(async date => {
      const raw = await redis('get', `survey:morning:${id}:${date}`);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    })
  );
  return records.filter(Boolean).reverse();
}

async function getNeuroHistory(id) {
  const raw = await redis('get', 'neuro:data');
  if (!raw) return null;
  try {
    const db = JSON.parse(raw);
    return db[id] || null;
  } catch {
    return null;
  }
}

// Returns a single aggregated object describing the player's recent state —
// everything an S&C coach would need to design a gym program.
export async function getPlayerSnapshot(id, days = 14) {
  const [info, whoop, surveys, morning, neuro] = await Promise.all([
    getPlayerInfo(id),
    getWhoopHistory(id, days),
    getSurveyHistory(id, days),
    getMorningHistory(id, days),
    getNeuroHistory(id),
  ]);

  if (!info) return null;

  return { player: info, whoop, surveys, morning, neuro, periodDays: days };
}
