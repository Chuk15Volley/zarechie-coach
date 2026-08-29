import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { adaptationBatchLatestKey, pfx, returnToPlayKey, rosterKey, sessionKey, sessionsKey } from '../../../lib/workspacePrefix';
import { buildAthleteWeekLoad, summarizeTeamWeek } from '../../../lib/weekLoadManagement.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PLAYERS = 40;
const MAX_DATES_PER_PLAYER = 24;
const PIPELINE_CHUNK = 300;

function parse(raw, fallback = null) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return fallback; }
}

function validDate(value) {
  if (!DATE_RE.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function score(date) {
  return Number.parseInt(date.replace(/-/g, ''), 10);
}

async function pipelineChunked(commands) {
  const values = [];
  for (let index = 0; index < commands.length; index += PIPELINE_CHUNK) {
    values.push(...await redisPipeline(commands.slice(index, index + PIPELINE_CHUNK)));
  }
  return values;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const source = req.method === 'POST' ? req.body : req.query;
  const start = String(source?.start || '');
  const workspace = source?.workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  const recommendations = req.method === 'POST' && source?.recommendations && typeof source.recommendations === 'object'
    ? source.recommendations : {};
  if (!validDate(start)) return res.status(400).json({ error: 'start (YYYY-MM-DD) required' });

  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
  const historyStart = shiftDate(start, -28);
  const rangeEnd = dates[6];
  const roster = parse(await redis('get', rosterKey(workspace)).catch(() => null), []);
  const players = (Array.isArray(roster) ? roster : []).filter(player => player?.id).slice(0, MAX_PLAYERS);
  if (!players.length) {
    return res.status(200).json({ players: [], sessions: {}, athletes: [], dates, summary: summarizeTeamWeek([]), latestBatch: null });
  }

  const rangeResults = await redisPipeline(players.map(player => [
    'ZRANGEBYSCORE', sessionsKey(workspace, String(player.id)), score(historyStart), score(rangeEnd),
  ])).catch(() => players.map(() => []));
  const playerDates = players.map((player, index) => ({
    player,
    dates: (Array.isArray(rangeResults[index]) ? rangeResults[index] : []).filter(validDate).slice(-MAX_DATES_PER_PLAYER),
  }));
  const entries = playerDates.flatMap(({ player, dates: storedDates }) => storedDates.map(date => ({ playerId: String(player.id), date })));
  const prefix = pfx(workspace);
  const detailCommands = entries.flatMap(item => [
    ['GET', sessionKey(workspace, item.playerId, item.date)],
    ['GET', `${prefix}:session:actual:${item.playerId}:${item.date}`],
    ['GET', `${prefix}:log:${item.playerId}:${item.date}`],
  ]);
  const contextCommands = [
    ...players.map(player => ['GET', returnToPlayKey(workspace, String(player.id))]),
    ['GET', adaptationBatchLatestKey(workspace)],
  ];
  const [detailResults, contextResults] = await Promise.all([
    pipelineChunked(detailCommands).catch(() => []),
    redisPipeline(contextCommands).catch(() => []),
  ]);
  const entriesByPlayer = new Map(players.map(player => [String(player.id), []]));
  entries.forEach((item, index) => {
    const offset = index * 3;
    const record = parse(detailResults[offset]);
    if (!record?.session) return;
    entriesByPlayer.get(item.playerId)?.push({
      date: item.date,
      record,
      actual: parse(detailResults[offset + 1]),
      log: parse(detailResults[offset + 2]),
    });
  });
  const athletes = players.map((player, index) => buildAthleteWeekLoad({
    player,
    weekStart: start,
    dates,
    entries: entriesByPlayer.get(String(player.id)) || [],
    returnToPlay: parse(contextResults[index], {}),
    recommendation: recommendations[String(player.id)] || null,
  }));
  const sessions = Object.fromEntries(athletes.map(athlete => [
    athlete.player.id,
    athlete.days.filter(day => day.hasSession).map(day => day.date),
  ]));

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    schema: 'zarechie.team-week.v2',
    players: athletes.map(athlete => athlete.player),
    sessions,
    athletes,
    dates,
    summary: summarizeTeamWeek(athletes),
    latestBatch: parse(contextResults[players.length]),
  });
}
