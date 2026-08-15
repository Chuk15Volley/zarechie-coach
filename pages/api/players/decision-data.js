// GET ?playerId=&date=&workspace= → compact, read-only snapshot used before generation.
// It intentionally mirrors the main generator's data sources without calling OpenAI.

import { isAuthorized } from '../../../lib/auth';
import { getPlayerSnapshot, todayISO } from '../../../lib/playerData';
import { redis } from '../../../lib/redis';
import { restrictionsKey, scheduleKey } from '../../../lib/workspacePrefix';
import { expectsPerformanceTests, usesSeasonCalendar } from '../../../lib/workspacePolicy.mjs';
import { performanceKpis } from '../../../lib/performanceKpis.mjs';
import {
  readinessDecisionFromSnapshot,
  readinessNumber as number,
  readinessZones as zoneSummary,
} from '../../../lib/readinessDecision.mjs';

function shiftDate(date, amount) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return value.toISOString().slice(0, 10);
}

function parseJSON(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function scheduleContext(events, targetDate) {
  const typesByDate = Object.fromEntries((events || []).map(event => [event.date, event.type]));
  let daysSinceGame = null;
  let daysToGame = null;
  for (let offset = 1; offset <= 7; offset += 1) {
    if (typesByDate[shiftDate(targetDate, -offset)] === 'game') { daysSinceGame = offset; break; }
  }
  for (let offset = 1; offset <= 21; offset += 1) {
    if (typesByDate[shiftDate(targetDate, offset)] === 'game') { daysToGame = offset; break; }
  }
  const travelSoon = typesByDate[shiftDate(targetDate, 1)] === 'travel' || typesByDate[shiftDate(targetDate, 2)] === 'travel';

  if (typesByDate[targetDate] === 'game') {
    return { level: 'yellow', label: 'День матча · силовой праймер', detail: 'Индивидуальный full-body праймер; проверка и сохранение только вручную.' };
  }
  if (typesByDate[targetDate] === 'travel') {
    return { level: 'red', label: 'День переезда · Recovery', detail: 'Только мобильность, кровоток и профилактика.' };
  }
  if (daysSinceGame === 1) {
    return { level: 'red', label: 'MD+1 · Recovery / Prehab', detail: 'День после матча: без тяжёлой силы и осевой нагрузки.' };
  }
  if (daysToGame === 1 || (daysToGame === 2 && travelSoon)) {
    return { level: 'yellow', label: 'MD-1 · Activation / Power', detail: 'Короткая активация без накопления усталости.' };
  }
  if (daysToGame === 2) {
    return { level: 'yellow', label: 'MD-2 · Moderate Power / Strength', detail: 'Умеренный объём, качество важнее утомления.' };
  }
  if (daysToGame != null) {
    return { level: 'green', label: `MD-${daysToGame} · Полноценная работа`, detail: 'Расписание позволяет работу по выбранной фазе.' };
  }
  return { level: 'green', label: 'Календарь без ближайшего матча', detail: 'Режим определяется фазой и состоянием игрока.' };
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const playerId = String(req.query.playerId || '');
  const workspace = req.query.workspace === 'nkperf' ? 'nkperf' : 'zarechie';
  const today = todayISO();
  const targetDate = String(req.query.date || today);
  if (!playerId) return res.status(400).json({ error: 'playerId required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return res.status(400).json({ error: 'Invalid date' });

  try {
    const [snapshot, rawRestrictions, rawSchedule] = await Promise.all([
      // The panel is an immediate pre-flight check, not a trend report. Three
      // days covers the relevant evening status without loading 28-day history.
      getPlayerSnapshot(playerId, 3, targetDate, 3, workspace),
      redis('get', restrictionsKey(workspace, playerId)).catch(() => null),
      usesSeasonCalendar(workspace) ? redis('get', scheduleKey(workspace)).catch(() => null) : Promise.resolve(null),
    ]);
    if (!snapshot) return res.status(404).json({ error: 'Player not found' });

    const testsExpected = expectsPerformanceTests(workspace);
    const kpis = testsExpected ? performanceKpis(snapshot.neuro, targetDate) : null;
    const neuro = testsExpected ? {
      fresh: [kpis.rsi, kpis.cmj, kpis.sprint10m]
        .some(metric => metric.value != null && !metric.stale),
      rsi: kpis.rsi,
      cmj: kpis.cmj,
      sprint10m: kpis.sprint10m,
    } : null;
    const readiness = readinessDecisionFromSnapshot(snapshot, targetDate, {
      testsExpected,
      neuroFresh: !!neuro?.fresh,
    });
    const { evening, postMorning, exactMorning, morning, whoop, eveningFresh, postMorningFresh, activeInjuries } = readiness;
    const zones = zoneSummary(evening);
    const postMorningZones = zoneSummary(postMorning);
    const restrictions = parseJSON(rawRestrictions, []);
    const schedule = usesSeasonCalendar(workspace)
      ? scheduleContext(parseJSON(rawSchedule, []), targetDate)
      : null;
    const dataQuality = {
      whoop: number(whoop?.recovery) != null || number(whoop?.hrv) != null,
      subjective: !!morning || !!postMorning || !!evening,
      ...(testsExpected ? { neuro: !!neuro?.fresh } : {}),
    };

    return res.status(200).json({
      targetDate,
      today,
      workspace,
      evening: evening ? {
        date: evening.date,
        submittedAt: evening.submittedAt || null,
        fresh: eveningFresh,
        fatigue: number(evening.fatigue),
        soreness: number(evening.soreness),
        legFatigue: number(evening.legFatigue),
        shoulderLoad: number(evening.shoulderLoad),
        tomorrowReadiness: number(evening.tomorrowReadiness),
        ews: number(evening.ews),
        hasInjury: !!evening.hasInjury,
        injuryAreas: evening.injuryAreas || [],
        zones,
      } : { fresh: false, date: null, zones: [] },
      postMorning: postMorning ? {
        date: postMorning.date,
        submittedAt: postMorning.submittedAt || null,
        fresh: postMorningFresh,
        duration: number(postMorning.totalDuration ?? postMorning.duration),
        load: number(postMorning.totalLoad),
        srpe: number(postMorning.srpe),
        fatigue: number(postMorning.fatigue),
        legFatigue: number(postMorning.legFatigue),
        shoulderLoad: number(postMorning.shoulderLoad),
        tomorrowReadiness: number(postMorning.tomorrowReadiness),
        participation: postMorning.participation || null,
        hasLoadConcern: !!postMorning.hasLoadConcern,
        discomfortAreas: postMorning.discomfortAreas || [],
        zones: postMorningZones,
      } : { fresh: false, date: null, zones: [] },
      morning: morning ? {
        date: morning.date,
        exact: !!exactMorning,
        readiness: number(morning.readiness),
        doms: number(morning.doms),
        mws: number(morning.mws),
      } : null,
      whoop: whoop ? {
        date: whoop.date,
        recovery: number(whoop.recovery),
        hrv: number(whoop.hrv),
        sleepHours: number(whoop.sleep_hours),
      } : null,
      neuro,
      testsExpected,
      restrictions: Array.isArray(restrictions) ? restrictions : [],
      activeInjuries,
      schedule,
      dataQuality,
      dataCompleteness: Math.round(Object.values(dataQuality).filter(Boolean).length / Object.keys(dataQuality).length * 100),
      decision: readiness.decision,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
