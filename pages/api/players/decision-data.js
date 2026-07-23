// GET ?playerId=&date=&workspace= → compact, read-only snapshot used before generation.
// It intentionally mirrors the main generator's data sources without calling OpenAI.

import { isAuthorized } from '../../../lib/auth';
import { getPlayerSnapshot, todayISO } from '../../../lib/playerData';
import { redis } from '../../../lib/redis';
import { restrictionsKey, scheduleKey } from '../../../lib/workspacePrefix';

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

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestOnOrBefore(records, date) {
  return [...(records || [])]
    .filter(record => record?.date && record.date <= date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

function zoneSummary(survey) {
  const zones = Object.entries(survey?.zoneDetails || {})
    .map(([area, detail]) => ({
      area,
      type: detail?.type === 'pain' ? 'pain' : 'soreness',
      level: number(detail?.level),
    }))
    .filter(zone => zone.area && zone.level != null && zone.level > 0);
  if (zones.length) return zones;
  return (survey?.painAreas || []).map(area => ({ area, type: 'pain', level: null }));
}

function latestNeuro(neuro, date) {
  const history = (neuro?.history || [])
    .filter(entry => entry?.date && entry.date <= date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return history[0] || neuro?.latest || null;
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

function decisionLevel({ evening, eveningFresh, morning, whoop, activeInjuries }) {
  const zones = zoneSummary(evening);
  const strongestPain = Math.max(0, ...zones.filter(zone => zone.type === 'pain').map(zone => zone.level || 0));
  const unscoredPain = zones.some(zone => zone.type === 'pain' && zone.level == null);
  if (activeInjuries.length || (eveningFresh && evening?.hasInjury) || (eveningFresh && strongestPain >= 3)) {
    return { level: 'red', label: 'Нужна адаптация', detail: 'Есть свежая травма или выраженная боль.' };
  }
  if (evening?.hasInjury || strongestPain >= 3) {
    return { level: 'yellow', label: 'Требует проверки', detail: 'В последней, но не свежей анкете есть боль или травма: проверь актуальность перед стартом.' };
  }
  if (eveningFresh && unscoredPain) {
    return { level: 'yellow', label: 'Требует проверки', detail: 'В свежей анкете отмечена боль без уровня: уточни её перед стартом и не форсируй нагрузку на эту зону.' };
  }
  if (number(whoop?.recovery) != null && number(whoop.recovery) < 34) {
    return { level: 'red', label: 'Только качество', detail: 'Recovery ниже 34%: снизить объём и риск.' };
  }
  if (number(morning?.readiness) != null && number(morning.readiness) <= 2) {
    return { level: 'red', label: 'Только качество', detail: 'Игрок отметил низкую утреннюю готовность.' };
  }
  if (number(evening?.tomorrowReadiness) != null && number(evening.tomorrowReadiness) <= 2) {
    return { level: 'yellow', label: 'Объём снижен', detail: 'Низкая готовность к следующему дню по вечерней анкете.' };
  }
  if (number(evening?.soreness) >= 4 || number(evening?.legFatigue) >= 4 || number(evening?.shoulderLoad) >= 4) {
    return { level: 'yellow', label: 'Нужна коррекция', detail: 'Высокая локальная усталость или крепатура.' };
  }
  return { level: 'green', label: 'Данные без красных флагов', detail: 'Тренерский статус и выбранная тема остаются решающими.' };
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
      workspace === 'zarechie' ? redis('get', scheduleKey(workspace)).catch(() => null) : Promise.resolve(null),
    ]);
    if (!snapshot) return res.status(404).json({ error: 'Player not found' });

    const evening = latestOnOrBefore(snapshot.surveys, targetDate);
    const morning = (snapshot.morning || []).find(record => record.date === targetDate) || null;
    const whoop = (snapshot.whoop || []).find(record => record.date === targetDate) || null;
    const neuro = latestNeuro(snapshot.neuro, targetDate);
    // The evening questionnaire describes readiness for the next training day.
    // A program built in the morning must therefore use last night's answer.
    const expectedEveningDate = shiftDate(targetDate, -1);
    const eveningFresh = !!evening && evening.date === expectedEveningDate;
    const zones = zoneSummary(evening);
    const restrictions = parseJSON(rawRestrictions, []);
    const activeInjuries = (snapshot.injuryLog || [])
      .filter(record => record?.status === 'active' || record?.status === 'monitoring')
      .map(record => ({ bodyPart: record.bodyPart || 'Не указано', severity: number(record.severity), painLevel: number(record.painLevel) }));
    const schedule = workspace === 'zarechie'
      ? scheduleContext(parseJSON(rawSchedule, []), targetDate)
      : null;

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
      morning: morning ? {
        date: morning.date,
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
      neuro: neuro ? {
        date: neuro.date || null,
        cmj: number(neuro.cmj),
        rsi: number(neuro.rsi),
      } : null,
      restrictions: Array.isArray(restrictions) ? restrictions : [],
      activeInjuries,
      schedule,
      decision: decisionLevel({ evening, eveningFresh, morning, whoop, activeInjuries }),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
