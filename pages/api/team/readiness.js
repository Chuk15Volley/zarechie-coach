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

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeRiskScore({ recovery, hrv, cmjDrop, lsi }) {
  let score = 0;
  if (recovery != null) {
    if (recovery < 20) score += 35;
    else if (recovery < 34) score += 25;
    else if (recovery < 66) score += 12;
  }
  if (hrv != null) {
    if (hrv < 40) score += 15;
    else if (hrv < 50) score += 10;
  }
  if (cmjDrop != null) {
    if (cmjDrop < -15) score += 30;
    else if (cmjDrop < -10) score += 20;
    else if (cmjDrop < -5) score += 10;
  }
  if (lsi != null) {
    if (lsi < 75) score += 20;
    else if (lsi < 80) score += 15;
    else if (lsi < 85) score += 8;
  }
  return Math.min(100, Math.round(score));
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

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const date = String(req.query.date || '') ||
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
  const workspace = String(req.query.workspace || 'zarechie');

  try {
    // ── Roster ───────────────────────────────────────────────────────────────
    const rosterRaw = await redis('get', rosterKey(workspace)).catch(() => null);
    let roster = parseJSON(rosterRaw);
    if (!Array.isArray(roster)) roster = [];

    if (!roster.length) return res.status(200).json({ players: [] });

    const snapshots = await Promise.all(
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
        (recovery != null && recovery < 20) || (hrv != null && hrv < 40) ? 'red'
        : (recovery != null && recovery < 34) || (hrv != null && hrv < 50) ? 'red'
        : (recovery != null && recovery <= 66) ? 'yellow'
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

      let status = 'green';
      if (redCount >= 2 || extremeRed) status = 'red';
      else if (redCount === 1 || yellowCount >= 2) status = 'yellow';
      else if (dataCompleteness < 50) status = 'yellow';

      const riskScore = computeRiskScore({ recovery, hrv, cmjDrop: worstKpiChange, lsi });

      return {
        id: p.id,
        name: p.name || '',
        position: p.position || '',
        photo: p.photo || null,
        recovery, hrv, sleep_hours,
        mws, doms, readiness,
        cmj, cmjDate, cmjBaseline, cmjDrop, rsi, rsiDate,
        sprint10m, sprint10mDate,
        kpiFreshness: {
          rsi: { ageDays: kpis.rsi.ageDays, stale: kpis.rsi.stale },
          cmj: { ageDays: kpis.cmj.ageDays, stale: kpis.cmj.stale },
          sprint10m: { ageDays: kpis.sprint10m.ageDays, stale: kpis.sprint10m.stale },
        },
        lsi, lsiDate,
        status, domains, riskScore, dataQuality, dataCompleteness,
      };
    });

    return res.status(200).json({ players });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
