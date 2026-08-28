// pages/api/team/readiness.js
// GET ?date=YYYY-MM-DD → morning team-readiness snapshot for every rostered player.
//
// Pulls, per player:
//   whoop:history:{id}:{date}   → recovery, hrv, rhr, sleep_hours, strain
//   survey:morning:{id}:{date}  → mws, sleep, mood, stress, doms, readiness
//   neuro:data / neuro:history  → latest cmj/rsi + baseline (avg of last 5, excl. today)
// and derives a red/yellow/green status.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { getPlayerSnapshot } from '../../../lib/playerData';
import { rosterKey } from '../../../lib/workspacePrefix';
import { performanceKpis } from '../../../lib/performanceKpis.mjs';
import { getReadySixTeamReadiness, usesReadySix } from '../../../lib/readySixClient';
import { normalizeReadySixTeamReadiness } from '../../../lib/readySixSnapshotAdapter';
import { recordPlatformEvent } from '../../../lib/platformTelemetry';
import { hydratePlayerPhotos, playerPhotoPath } from '../../../lib/playerPhotos';
import { getCachedTeamReadiness } from '../../../lib/teamReadinessCache';
import { recordReadinessLatency } from '../../../lib/readinessTelemetry';
import { waitUntil } from '@vercel/functions';

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeAttentionScore({ recovery, hrvZ, kpiDrop, lsi, readiness, doms }) {
  let score = 0;
  if (recovery != null) {
    if (recovery < 20) score += 35;
    else if (recovery < 34) score += 25;
    else if (recovery < 66) score += 12;
  }
  if (hrvZ != null) {
    if (hrvZ <= -2) score += 20;
    else if (hrvZ <= -1.5) score += 15;
    else if (hrvZ <= -0.75) score += 8;
  }
  if (kpiDrop != null) {
    if (kpiDrop < -15) score += 25;
    else if (kpiDrop < -10) score += 18;
    else if (kpiDrop < -5) score += 8;
  }
  if (lsi != null) {
    if (lsi < 75) score += 20;
    else if (lsi < 80) score += 15;
    else if (lsi < 85) score += 8;
  }
  if (readiness != null && readiness <= 2) score += 15;
  if (doms != null && doms >= 4) score += 10;
  return Math.min(100, Math.round(score));
}

function personalZ(current, prior) {
  if (current == null || !Array.isArray(prior) || prior.length < 5) return null;
  const mean = prior.reduce((sum, value) => sum + value, 0) / prior.length;
  const variance = prior.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (prior.length - 1);
  const sd = Math.sqrt(variance);
  return sd > 0 ? Math.round(((current - mean) / sd) * 100) / 100 : null;
}

function parseJSON(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function latestByDate(items) {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || {};
}

function latestLsiFromNeuro(neuro) {
  const lsiArr = neuro?.latest?.hist?.lsi || neuro?.latest?.lsi;
  if (Array.isArray(lsiArr) && lsiArr.length) {
    const latest = latestByDate(lsiArr);
    const parsed = num(latest.lsi ?? latest.value);
    return { lsi: parsed != null ? Math.round(parsed * 10) / 10 : null, lsiDate: latest.date || null };
  }
  if (typeof lsiArr === 'number') return { lsi: Math.round(lsiArr * 10) / 10, lsiDate: null };
  return { lsi: null, lsiDate: null };
}

function ageDays(date, targetDate) {
  if (!date || !targetDate) return null;
  const age = Math.floor((new Date(`${targetDate}T12:00:00Z`) - new Date(`${date}T12:00:00Z`)) / 86400000);
  return Number.isFinite(age) ? Math.max(0, age) : null;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const date = String(req.query.date || '') ||
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
  const workspace = req.query.workspace === 'nkperf' ? 'nkperf' : 'zarechie';

  if (!isCalendarDate(date)) return res.status(400).json({ error: 'Invalid date. Expected YYYY-MM-DD' });

  const started = Date.now();
  try {
    const result = await getCachedTeamReadiness(
      workspace,
      date,
      () => buildTeamReadiness(workspace, date),
      {
        forceRefresh: req.query.refresh === '1',
        schedule: promise => waitUntil(promise),
        onBackgroundError: error => {
          console.error(JSON.stringify({
            level: 'error',
            area: 'readiness_refresh',
            workspace,
            date,
            message: String(error?.message || 'Background readiness refresh failed').slice(0, 240),
          }));
          return recordPlatformEvent({
            workspace,
            area: 'readiness_refresh',
            status: 'error',
            message: 'Фоновое обновление готовности не выполнено',
            meta: { date, reason: String(error?.message || '').slice(0, 120) },
          });
        },
      }
    );
    const durationMs = Date.now() - started;
    waitUntil(recordReadinessLatency({
      workspace,
      durationMs,
      cache: result.cache,
      playerCount: result.payload.players.length,
      date,
    }));
    res.setHeader('X-Readiness-Cache', result.cache);
    res.setHeader('X-Readiness-Cache-Age', String(Math.round(result.ageMs)));
    res.setHeader('Server-Timing', `readiness;dur=${durationMs}`);
    if (result.cache === 'stale') {
      console.warn(JSON.stringify({
        level: 'warning',
        area: 'readiness_cache',
        workspace,
        date,
        ageMs: Math.round(result.ageMs),
        message: 'Serving stale readiness after refresh failure',
      }));
    }
    return res.status(200).json({
      ...result.payload,
      cache: result.cache,
      cacheAgeMs: Math.round(result.ageMs),
      revalidating: Boolean(result.revalidating),
    });
  } catch (e) {
    await recordPlatformEvent({
      workspace,
      area: String(e?.code || '').startsWith('READYSIX_') ? 'readysix' : 'readiness',
      status: 'error',
      message: e.message,
      meta: { code: e?.code || 'READINESS_FAILED', date },
    }).catch(() => {});
    return res.status(500).json({ error: e.message });
  }
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function buildTeamReadiness(workspace, date) {
    // ── Roster ───────────────────────────────────────────────────────────────
    const readySixPayload = usesReadySix(workspace)
      ? normalizeReadySixTeamReadiness(await getReadySixTeamReadiness(workspace, date))
      : null;
    const readySixTeam = readySixPayload
      ? { ...readySixPayload, roster: await hydratePlayerPhotos(readySixPayload.roster, workspace) }
      : null;
    const rosterRaw = readySixTeam ? null : await redis('get', rosterKey(workspace)).catch(() => null);
    let roster = readySixTeam ? readySixTeam.roster : parseJSON(rosterRaw);
    if (!Array.isArray(roster)) roster = [];

    if (!roster.length) return { players: [] };

    const snapshots = readySixTeam?.snapshots || await Promise.all(
      roster.map(p => getPlayerSnapshot(String(p.id), 7, date, 28, workspace).catch(() => null))
    );

    const players = roster.map((p, idx) => {
      const snapshot = snapshots[idx] || {};
      const whoop = latestByDate(snapshot.whoop);
      const survey = latestByDate(snapshot.morning);
      const { lsi, lsiDate } = latestLsiFromNeuro(snapshot.neuro);
      const kpis = performanceKpis(snapshot.neuro, date);
      const recovery = num(whoop.recovery);
      const hrv = num(whoop.hrv);
      const hrvPrior = (snapshot.whoop || [])
        .filter(item => item?.date && item.date < (whoop.date || date))
        .map(item => num(item.hrv))
        .filter(value => value != null)
        .slice(-21);
      const hrvZ = personalZ(hrv, hrvPrior);
      const sleep_hours = num(whoop.sleep_hours);

      const mws = num(survey.mws);
      const doms = num(survey.doms);
      const readiness = num(survey.readiness);

      // Each KPI is resolved independently. A CMJ from last week must not be
      // discarded just because today's record contains RSI only.
      const cmj = kpis.cmj.value;
      const cmjDate = kpis.cmj.date;
      const cmjBaseline = kpis.cmj.baseline;
      const cmjDrop = kpis.cmj.performanceDeltaPercent;
      const rsi = kpis.rsi.value;
      const rsiDate = kpis.rsi.date;
      const sprint10m = kpis.sprint10m.value;
      const sprint10mDate = kpis.sprint10m.date;
      const freshKpis = [kpis.rsi, kpis.cmj, kpis.sprint10m]
        .filter(metric => metric.value != null && !metric.stale);
      const worstKpiChange = freshKpis
        .filter(metric => metric.meaningfulDecline)
        .map(metric => metric.performanceDeltaPercent)
        .filter(value => value != null)
        .sort((a, b) => a - b)[0] ?? null;

      // ── Signal Confidence: 3-domain convergence ──────────────────────────────
      // Red requires convergence of 2+ independent domains (not one noisy sensor).
      // Domain: autonomic (WHOOP), neuromuscular (CMJ/LSI), subjective (survey).
      const hasAutonomic = recovery != null || hrv != null;
      const hasNeuromuscular = freshKpis.length > 0 || lsi != null;
      const hasSubjective = readiness != null || doms != null || mws != null;

      const domainAutonomic = !hasAutonomic ? 'unknown'
        :
        (recovery != null && recovery < 20) || (hrvZ != null && hrvZ <= -2) ? 'red'
        : (recovery != null && recovery < 34) || (hrvZ != null && hrvZ <= -1.5) ? 'red'
        : (recovery != null && recovery <= 66) || (hrvZ != null && hrvZ <= -0.75) ? 'yellow'
        : 'green';

      const domainNeuro = !hasNeuromuscular ? 'unknown'
        :
        (worstKpiChange != null && worstKpiChange < -10) || (lsi != null && lsi < 75) ? 'red'
        : (worstKpiChange != null && worstKpiChange < -5) || (lsi != null && lsi < 85) ? 'yellow'
        : 'green';

      const domainSubjective = !hasSubjective ? 'unknown'
        :
        (readiness != null && readiness === 1) || (doms != null && doms >= 5) ? 'red'
        : (readiness != null && readiness <= 2) ? 'red'
        : (readiness === 3) || (mws != null && mws < 60) ? 'yellow'
        : 'green';

      const domains = { autonomic: domainAutonomic, neuromuscular: domainNeuro, subjective: domainSubjective };
      const redCount = Object.values(domains).filter(d => d === 'red').length;
      const yellowCount = Object.values(domains).filter(d => d === 'yellow').length;
      const extremeRed =
        (recovery != null && recovery < 20) ||
        (readiness != null && readiness === 1);

      // Data quality is part of the readiness decision. Missing domains are
      // unknown—not green—and a one-source snapshot stays yellow until at
      // least two independent domains are available.
      const dataQuality = {
        whoop: hasAutonomic,
        survey: hasSubjective,
        neuro: freshKpis.length > 0,
        lsi: lsi != null,
      };
      const dataCompleteness = Math.round(Object.values(dataQuality).filter(Boolean).length / 4 * 100);
      const sourceFreshness = {
        whoop: { date: whoop.date || null, ageDays: ageDays(whoop.date, date), fresh: ageDays(whoop.date, date) != null && ageDays(whoop.date, date) <= 1 },
        survey: { date: survey.date || null, ageDays: ageDays(survey.date, date), fresh: ageDays(survey.date, date) != null && ageDays(survey.date, date) <= 1 },
        neuro: { date: freshKpis[0]?.date || null, ageDays: freshKpis[0]?.ageDays ?? null, fresh: freshKpis.length > 0 },
        lsi: { date: lsiDate || null, ageDays: ageDays(lsiDate, date), fresh: ageDays(lsiDate, date) != null && ageDays(lsiDate, date) <= 14 },
      };
      const missingSources = Object.entries(dataQuality).filter(([, present]) => !present).map(([source]) => source);
      const staleSources = Object.entries(sourceFreshness).filter(([, item]) => item.date && !item.fresh).map(([source]) => source);

      let status = 'green';
      if (redCount >= 2 || extremeRed) status = 'red';
      else if (redCount === 1 || yellowCount >= 2) status = 'yellow';
      else if (dataCompleteness < 50) status = 'yellow';

      const attentionScore = dataCompleteness === 0
        ? null
        : computeAttentionScore({ recovery, hrvZ, kpiDrop: worstKpiChange, lsi, readiness, doms });

      return {
        id: p.id,
        name: p.name || '',
        position: p.position || '',
        photo: p.photo || (p.hasPhoto ? playerPhotoPath(workspace, p.id) : null),
        recovery, hrv, hrvZ, sleep_hours,
        mws, doms, readiness,
        cmj, cmjDate, cmjBaseline, cmjDrop, rsi, rsiDate,
        sprint10m, sprint10mDate,
        kpiFreshness: {
          rsi: { ageDays: kpis.rsi.ageDays, stale: kpis.rsi.stale },
          cmj: { ageDays: kpis.cmj.ageDays, stale: kpis.cmj.stale },
          sprint10m: { ageDays: kpis.sprint10m.ageDays, stale: kpis.sprint10m.stale },
        },
        lsi, lsiDate,
        status, domains, attentionScore, dataQuality, dataCompleteness,
        dataProvenance: {
          source: readySixTeam ? 'ReadySix' : 'Legacy Redis',
          generatedAt: snapshot.readySixMeta?.generatedAt || null,
          revision: snapshot.readySixMeta?.revision || null,
          sourceFreshness,
          missingSources,
          staleSources,
        },
      };
    });

    return { players };
}
