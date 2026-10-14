import ProgramWorkCopy from '../components/ProgramWorkCopy';
import CompactProgramEditor from '../components/CompactProgramEditor';
import {plannedInputIssues,plannedRpePatch,workCopyKey} from '../lib/editorWorkflow.mjs';
import TeamPreparation from '../components/TeamPreparation';
import TeamProgramDialog from '../components/TeamProgramDialog';
import {sameDraftView,teamDraftIdentity} from '../lib/teamPreparation.mjs';
import OperationalIncidents from '../components/OperationalIncidents';
import {overviewRestoreReady} from '../lib/coachAuditPresentation.mjs';
import WeightProvenance from '../components/WeightProvenance';
import WarmupConduct from '../components/WarmupConduct';
import SourceComparison from '../components/SourceComparison';
import {coachDate,trainingTitle,activeServiceProblems,sessionFactAmount,factAmount,budgetLabel} from '../lib/coachPresentation.mjs';
import TeamFactOverview from '../components/TeamFactOverview';
import {weekFactPeriod} from '../lib/coachFactSurface.mjs';
import {ExerciseLibraryPicker} from '../components/ExerciseLibraryExplorer';
import ProgramOverview from '../components/ProgramOverview';
import StrengthPerformance from '../components/StrengthPerformance';
import {cyclePerformanceSeries} from '../lib/strengthPerformance.mjs';
import {programEditPlayerId} from '../lib/programEditIdentity.mjs';
import PlayerHistory from '../components/PlayerHistory';
import {teamQueueCall} from '../lib/teamQueueClient.mjs';
import {TodayOverview,TeamLoadOverview,OverviewFreshness,OverviewSignals} from '../components/CoachOverview';
import {draftForPlayer,readinessIssues,loadEvidenceLabel} from '../lib/coachOverview.mjs';
import {overviewJson,requestDailyOverview} from '../lib/coachOverviewRequest.mjs';
import ExercisePrescription from '../components/ExercisePrescription';
import StrengthProgressionHint from '../components/StrengthProgressionHint';
import {requestCoachProgression} from '../lib/coachProgressionRequest.mjs';
import CoachNavigation from '../components/CoachNavigation';
import CoachHome from '../components/CoachHome';
import StrengthEquipmentPanel from '../components/StrengthEquipmentPanel';
import {strengthProgressionKey,strengthProgressionScope,applyStrengthCardProposal} from '../lib/strengthCardProgression.mjs';
import useCoachEdits from '../hooks/useCoachEdits';
import CoachEditsRecovery from '../components/CoachEditsRecovery';
import StrengthTeamNextReview from '../components/StrengthTeamNextReview';
import GenerationMonitor from '../components/GenerationMonitor';
import useTeamGenerationQueue from '../hooks/useTeamGenerationQueue';
import TeamQueueReview from '../components/TeamQueueReview';
import TeamGenerationResults from '../components/TeamGenerationResults';
import {isCoachReviewDraft} from '../lib/teamGenerationClient.mjs';
import {STRENGTH_EQUIPMENT, STRENGTH_COHORT_EXPERIENCE} from '../lib/strengthEquipment.mjs';
import {REPLACEMENT_REASONS} from '../lib/strengthCycle.mjs';
import PlayerTimeZoneControl from '../components/PlayerTimeZoneControl';
import {playerTimeZone,playerLocalDate} from '../lib/playerTimeZone.mjs';
import { saveProgramRequest } from '../lib/programSaveClient.mjs';
import { replaceExerciseDescription,techniqueQuality,replacementTechnique } from '../lib/exerciseReplacement.mjs';
import { estimateStrengthMinutes } from '../lib/strengthExecution.mjs';
import { calendarToday } from '../lib/coachCalendar.mjs';
import CoachCalendar from '../components/CoachCalendar';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import PlannedLoadEditor from '../components/PlannedLoadEditor';
import {plannedWeightPatch} from '../lib/plannedLoadEditor.mjs';
import Head from 'next/head';
import {
  Activity,
  LogOut,
  AlertTriangle,
  CalendarDays,
  Target,
  Layers,
  TrendingUp,
  MessageSquare,
  Loader2,
  ChevronDown,
  Check,
  Dumbbell,
  Orbit,
  Printer,
  Save,
  History,
  Zap,
  BarChart2,
  Calendar,
  Link2,
  Copy,
  RefreshCw,
  Users,
  X,
  CheckSquare,
  Square,
  ChevronRight,
  ChevronLeft,
  ArrowLeftRight,
  ChevronUp,
  BookOpen,
  ArrowRight,
  ArrowUpRight,
  Menu,
  Plus,
  Plane,
  Swords,
  Coffee,
  Shield,
  RotateCcw,
  CalendarRange,
  CheckCircle2,
  SlidersHorizontal,
  Search,
} from 'lucide-react';
import { findExerciseUrl } from '../lib/exerciseBank';
import { calcWeight } from '../lib/loadCalc';
import { RESTRICTIONS, hasRestriction } from '../lib/exerciseRestrictions';
import { exerciseTonnage, isPairableFreeWeightExercise, loadUnitsForExercise } from '../lib/tonnage';
import {
  isInSeasonFocus,
  isManualMatchDayFocus,
  MANUAL_MATCH_DAY_FOCUS,
} from '../lib/seasonPolicy.mjs';
import { usesSeasonCalendar } from '../lib/workspacePolicy.mjs';
import { prehabEnglishName } from '../lib/prehabNames.mjs';
import { exerciseDescription } from '../lib/tempoDescription.mjs';
import { canonicalExerciseId } from '../lib/exerciseIdentity.mjs';
import { buildAttentionQueue, buildStationRotation } from '../lib/floorOperations.mjs';
import { buildTodayDecisionCenter, normalizeReturnToPlay, RTP_PHASES } from '../lib/todayDecisionCenter.mjs';

const SESSION_HEARTBEAT_MS = 5 * 60 * 1000;

// Map a camp focus phase to a representative training week (for auto-weight %).
function weekFromFocus(focus) {
  const f = String(focus || '');
  if (f.startsWith('camp_ecc_')) return 2;
  if (f.startsWith('camp_iso_')) return 4;
  if (f === 'camp_explosive') return 6;
  return null;
}

// Tiny inline trend chart for 1RM history.
function Sparkline({ values, width = 48, height = 20 }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(' ');
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const trend = last > prev ? '↑' : last < prev ? '↓' : '→';
  const color = last > prev ? '#4ade80' : last < prev ? '#f87171' : '#94a3b8';
  return (
    <span className="inline-flex items-center gap-1">
      <svg width={width} height={height} className="shrink-0">
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} opacity="0.7" />
      </svg>
      <span className="text-[10px]" style={{ color }}>{trend}</span>
    </span>
  );
}

// Custom calendar date-picker — auto-closes after selection, matches dark theme.
function DatePicker(props) { return <CoachCalendar {...props} />; }

function PremiumSelect({ value, onChange, options, className = '', title, disabled = false, compact = false }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const selected = options.find(option => String(option.value) === String(value)) || options[0];

  useEffect(() => {
    if (!open) return undefined;

    function positionMenu() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const desiredHeight = Math.min(340, options.length * (compact ? 38 : 46) + 16);
      const dialogBounds=trigger.closest('dialog[open]')?.getBoundingClientRect();
      const topBound=(dialogBounds?.top || 0)+8,bottomBound=(dialogBounds?.bottom || window.innerHeight)-8;
      const leftBound=(dialogBounds?.left || 0)+8,rightBound=(dialogBounds?.right || window.innerWidth)-8;
      const spaceBelow = Math.max(0,bottomBound-rect.bottom-8),spaceAbove=Math.max(0,rect.top-topBound-8);
      const opensUp = spaceBelow < Math.min(desiredHeight, 260) && spaceAbove > spaceBelow;
      const height=Math.min(desiredHeight,opensUp?spaceAbove:spaceBelow);
      setMenuStyle({
        left: Math.max(leftBound, Math.min(rect.left, rightBound-rect.width)),
        top: opensUp ? Math.max(topBound, rect.top-height-8) : rect.bottom+8,
        width: Math.min(rect.width,rightBound-leftBound),
        maxHeight: height,
      });
    }

    function handlePointer(event) {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKey(event) {
      if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();setOpen(false);}
    }

    positionMenu();
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [compact, open, options.length]);

  const menu = open && menuStyle && typeof document !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      role="listbox"
      aria-label={title}
      className="premium-select-popover fixed z-[120] overflow-y-auto rounded-2xl border border-white/[0.14] p-1.5"
      style={menuStyle}
    >
      {options.map(option => {
        const active = String(option.value) === String(value);
        return (
          <button
            key={String(option.value)}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => { onChange(option.value); setOpen(false); }}
            className={`premium-select-option flex w-full items-center gap-3 rounded-xl text-left transition-all ${compact ? 'px-2.5 py-2 text-[11px]' : 'px-3 py-2.5 text-[12px]'} ${active ? 'is-selected' : ''}`}
          >
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${active ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-200' : 'border-white/[0.07] bg-white/[0.025] text-transparent'}`}>
              <Check size={11} strokeWidth={2.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-slate-200">{option.label}</span>
              {option.sub && <span className="mt-0.5 block truncate text-[10px] text-slate-500">{option.sub}</span>}
            </span>
          </button>
        );
      })}
    </div>,
    triggerRef.current?.closest('dialog[open]') || document.querySelector('main') || document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen(current => !current)}
        className={`premium-select-trigger flex items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label || 'Выберите'}</span>
        <ChevronDown size={compact ? 12 : 14} className={`shrink-0 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180 text-cyan-200' : ''}`} />
      </button>
      {menu}
    </>
  );
}

const ONE_RM_FIELDS = [
  { key: 'squat',    label: 'Присед (трэп/гоблет)', unit: 'кг' },
  { key: 'rdl',      label: 'РТ на одной ноге',     unit: 'кг' },
  { key: 'deadlift', label: 'Тяга трэп-штанга',     unit: 'кг' },
  { key: 'bench',    label: 'DB Bench (∑ обе гантели)', unit: 'кг' },
  { key: 'ohp',      label: 'Жим Landmine',          unit: 'кг' },
  { key: 'pullup',   label: 'Подтяг. (+кг)',         unit: 'кг' },
];

const RM_COLORS = {
  squat: '#22d3ee', rdl: '#a78bfa', deadlift: '#34d399',
  bench: '#f59e0b', ohp: '#f87171', pullup: '#60a5fa',
};
const RM_SHORT = {
  squat: 'Присед', rdl: 'РТ 1н', deadlift: 'Тяга трэп',
  bench: 'DB Bench', ohp: 'Landmine', pullup: 'Подтяг.',
};

function RMChart({ history, fields }) {
  if (!history || history.length < 2) return null;
  const W = 340, H = 130;
  const PAD = { top: 10, right: 14, bottom: 24, left: 30 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const n = history.length;

  const lines = fields.map(f => {
    const vals = history.map(h => parseFloat(h[f.key]) || null);
    const firstVal = vals.find(v => v != null);
    if (!firstVal) return null;
    const pcts = vals.map(v => v != null ? +((v - firstVal) / firstVal * 100).toFixed(1) : null);
    if (pcts.filter(v => v != null).length < 2) return null;
    const last = vals.filter(v => v != null).at(-1);
    return { key: f.key, pcts, last, delta: +(last - firstVal).toFixed(1), color: RM_COLORS[f.key] };
  }).filter(Boolean);

  if (!lines.length) return null;

  const allPcts = lines.flatMap(l => l.pcts.filter(v => v != null));
  const pMin = Math.min(0, ...allPcts);
  const pMax = Math.max(0, ...allPcts);
  const pad = Math.max((pMax - pMin) * 0.18, 3);
  const yLo = pMin - pad, yHi = pMax + pad;
  const xFn = i => PAD.left + (i / (n - 1)) * cW;
  const yFn = p => PAD.top + cH - ((p - yLo) / (yHi - yLo)) * cH;

  const gridPcts = [-20, -10, 0, 10, 20].filter(p => p >= yLo - 1 && p <= yHi + 1);

  return (
    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-700">Динамика 1ПМ · % от первого теста</p>
      <div className="overflow-x-auto">
        <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
          {gridPcts.map(p => {
            const gy = yFn(p);
            return (
              <g key={p}>
                <line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy}
                  stroke={p === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)'}
                  strokeWidth="1" strokeDasharray={p === 0 ? '0' : '2,4'} />
                <text x={PAD.left - 4} y={gy + 3.5} textAnchor="end"
                  fill="rgba(255,255,255,0.22)" fontSize="8">
                  {p > 0 ? `+${p}` : p}%
                </text>
              </g>
            );
          })}

          {history.map((h, i) => {
            if (n > 6 && i % Math.ceil(n / 5) !== 0 && i !== n - 1) return null;
            return (
              <text key={h.date} x={xFn(i)} y={H - 4} textAnchor="middle"
                fill="rgba(255,255,255,0.2)" fontSize="8">
                {coachDate(h.date)}
              </text>
            );
          })}

          {lines.map(line => {
            let d = '';
            line.pcts.forEach((p, i) => {
              if (p == null) return;
              const px = xFn(i), py = yFn(p);
              const gap = line.pcts.slice(0, i).every(v => v == null);
              d += !d || gap ? `M${px},${py}` : ` L${px},${py}`;
            });
            return (
              <g key={line.key}>
                <path d={d} fill="none" stroke={line.color}
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
                {line.pcts.map((p, i) => p != null
                  ? <circle key={i} cx={xFn(i)} cy={yFn(p)} r="2.5" fill={line.color} opacity="0.9" />
                  : null)}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
        {lines.map(line => (
          <div key={line.key} className="flex items-center gap-1.5 min-w-0">
            <div className="h-[3px] w-4 shrink-0 rounded-full" style={{ backgroundColor: line.color, opacity: 0.8 }} />
            <span className="truncate text-[9px] text-slate-500">{RM_SHORT[line.key]}</span>
            <span className="ml-auto shrink-0 text-[10px] font-bold text-slate-300">{line.last}кг</span>
            {line.delta !== 0 && (
              <span className={`shrink-0 text-[9px] font-semibold ${line.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {line.delta > 0 ? '+' : ''}{line.delta}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Load + neuro trend charts. Recent:longer ratios are descriptive, not injury-risk scores.
function TrendCharts({ data, showNeuro = true }) {
  const cmj = (data?.cmjHistory || []).filter(p => p.cmj != null);
  const acwr = (data?.acwrHistory || []).filter(p => p.acwr != null);

  // ── CMJ chart ──────────────────────────────────────────────────────────────
  const cmjChart = showNeuro ? (() => {
    if (cmj.length < 2) return null;
    const W = 320, H = 100, PAD = { top: 10, right: 12, bottom: 18, left: 28 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const n = cmj.length;
    const vals = cmj.map(p => p.cmj);
    const last = vals[n - 1];
    // baseline = avg of last 5 measurements excluding today's
    const prior = vals.slice(0, -1).slice(-5);
    const baseline = prior.length ? prior.reduce((s, v) => s + v, 0) / prior.length : last;
    const drop = baseline ? +(((last - baseline) / baseline) * 100).toFixed(1) : 0;
    const lo = Math.min(...vals, baseline) - 1;
    const hi = Math.max(...vals, baseline) + 1;
    const xFn = i => PAD.left + (i / (n - 1)) * cW;
    const yFn = v => PAD.top + cH - ((v - lo) / (hi - lo || 1)) * cH;
    const lineColor = last >= baseline ? '#34d399' : (drop < -5 ? '#fb7185' : '#fbbf24');
    let d = '';
    cmj.forEach((p, i) => { d += i === 0 ? `M${xFn(i)},${yFn(p.cmj)}` : ` L${xFn(i)},${yFn(p.cmj)}`; });
    const baseY = yFn(baseline);
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700">CMJ · см</p>
        <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
          <line x1={PAD.left} y1={baseY} x2={W - PAD.right} y2={baseY} stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="3,3" />
          <text x={W - PAD.right} y={baseY - 3} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="8">base {baseline.toFixed(1)}</text>
          {cmj.map((p, i) => {
            if (n > 6 && i % Math.ceil(n / 5) !== 0 && i !== n - 1) return null;
            return <text key={i} x={xFn(i)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7">{coachDate(p.date)}</text>;
          })}
          <path d={d} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          {cmj.map((p, i) => <circle key={i} cx={xFn(i)} cy={yFn(p.cmj)} r="2.5" fill={lineColor} />)}
        </svg>
        <p className="mt-1 text-[10px] text-slate-500">
          Последний CMJ ({coachDate(cmj[n - 1].date)}): <span className="font-bold text-slate-300">{last.toFixed(1)} см</span>{' '}
          (<span className={drop >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{drop >= 0 ? '+' : ''}{drop}%</span> от baseline {baseline.toFixed(1)})
        </p>
      </div>
    );
  })() : null;

  // ── ACWR chart ───────────────────────────────────────────────────────────
  const acwrChart = (() => {
    if (acwr.length < 2) return null;
    const W = 320, H = 80, PAD = { top: 8, right: 12, bottom: 16, left: 28 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const n = acwr.length;
    const vals = acwr.map(p => p.acwr);
    const lo = 0, hi = Math.max(1.8, ...vals) + 0.1;
    const xFn = i => PAD.left + (i / (n - 1)) * cW;
    const yFn = v => PAD.top + cH - ((v - lo) / (hi - lo || 1)) * cH;
    const zoneColor = () => '#67e8f9';
    let d = '';
    acwr.forEach((p, i) => { d += i === 0 ? `M${xFn(i)},${yFn(p.acwr)}` : ` L${xFn(i)},${yFn(p.acwr)}`; });
    const last = vals[n - 1];
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700">Недавняя / длительная нагрузка · sRPE</p>
        <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
          <path d={d} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {acwr.map((p, i) => <circle key={i} cx={xFn(i)} cy={yFn(p.acwr)} r="2.2" fill={zoneColor(p.acwr)} />)}
        </svg>
        <p className="mt-1 text-[10px] text-slate-500">
          Сейчас: <span className="font-bold" style={{ color: zoneColor(last) }}>{last.toFixed(2)}</span>
          {' '}· описательная динамика, не прогноз травмы
        </p>
      </div>
    );
  })();

  // ── Gym-ACWR chart (tonnage-based) ─────────────────────────────────────────
  const gymAcwr = (data?.gymAcwrHistory || []).filter(p => p.acwr != null);
  const gymAcwrChart = (() => {
    if (gymAcwr.length < 2) return null;
    const W = 320, H = 80, PAD = { top: 8, right: 12, bottom: 16, left: 28 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const n = gymAcwr.length;
    const vals = gymAcwr.map(p => p.acwr);
    const lo = 0, hi = Math.max(1.8, ...vals) + 0.1;
    const xFn = i => PAD.left + (i / (n - 1)) * cW;
    const yFn = v => PAD.top + cH - ((v - lo) / (hi - lo || 1)) * cH;
    const zoneColor = () => '#a78bfa';
    let d = '';
    gymAcwr.forEach((p, i) => { d += i === 0 ? `M${xFn(i)},${yFn(p.acwr)}` : ` L${xFn(i)},${yFn(p.acwr)}`; });
    const last = vals[n - 1];
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700">Недавний / длительный тоннаж зала</p>
        <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
          <path d={d} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {gymAcwr.map((p, i) => <circle key={i} cx={xFn(i)} cy={yFn(p.acwr)} r="2.2" fill={zoneColor(p.acwr)} />)}
        </svg>
        <p className="mt-1 text-[10px] text-slate-500">
          Тоннаж зала: <span className="font-bold" style={{ color: zoneColor(last) }}>{last.toFixed(2)}</span>
          {' '}· только контекст изменения объёма
        </p>
      </div>
    );
  })();

  const tsbChart = <TSBChart data={data?.tsbHistory || []} />;

  if (!cmjChart && !acwrChart && !gymAcwrChart && !tsbChart) {
    return <p className="mt-3 text-[11px] text-slate-600">Нет данных по нагрузке и нейро.</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      {cmjChart}
      {acwrChart}
      {gymAcwrChart}
      {gymAcwrChart && <p className="text-[10px] text-slate-500">Силовая: только записанные кг и повторы, включая актуальные дополнения тренера. Дней с неполными данными: {Object.values(data?.gymLoadEvidence || {}).filter(item=>item.partial).length}. Соотношение описывает доступные данные.</p>}
      {tsbChart}
    </div>
  );
}

// TSB (Fitness-Fatigue-Form) chart — CTL/ATL/TSB from Banister model.
function TSBChart({ data }) {
  const pts = (data || []).filter(p => p && p.date);
  if (pts.length < 2) return null;
  const W = 320, H = 120, PAD = { top: 12, right: 12, bottom: 18, left: 30 };
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
  const n = pts.length;
  const allVals = pts.flatMap(p => [p.ctl, p.atl, p.tsb]);
  const lo = Math.min(0, ...allVals) - 5;
  const hi = Math.max(...allVals) + 5;
  const xFn = i => PAD.left + (i / (n - 1)) * cW;
  const yFn = v => PAD.top + cH - ((v - lo) / (hi - lo || 1)) * cH;
  const path = key => {
    let d = '';
    pts.forEach((p, i) => { d += i === 0 ? `M${xFn(i)},${yFn(p[key])}` : ` L${xFn(i)},${yFn(p[key])}`; });
    return d;
  };
  const y0 = yFn(0);
  const last = pts[n - 1];
  const formColor = last.tsb > 10 ? '#34d399' : last.tsb < -25 ? '#fb7185' : last.tsb < -10 ? '#fbbf24' : '#e2e8f0';
  const formLabel = last.tsb > 10 ? 'свежий' : last.tsb < -25 ? 'перегрузка' : last.tsb < -10 ? 'усталость' : 'оптимально';
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700">Форма · TSB (Fitness-Fatigue)</p>
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
        <line x1={PAD.left} y1={y0} x2={W - PAD.right} y2={y0} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <path d={path('ctl')} fill="none" stroke="#34d399" strokeWidth="1.3" strokeDasharray="4,3" opacity="0.85" />
        <path d={path('atl')} fill="none" stroke="#fb7185" strokeWidth="1.3" strokeDasharray="4,3" opacity="0.85" />
        <path d={path('tsb')} fill="none" stroke="#e2e8f0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => {
          if (n > 8 && i % Math.ceil(n / 6) !== 0 && i !== n - 1) return null;
          return <text key={i} x={xFn(i)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7">{coachDate(p.date)}</text>;
        })}
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
        <span>Fitness <span className="font-bold text-emerald-400">{last.ctl}</span></span>
        <span>Fatigue <span className="font-bold text-rose-400">{last.atl}</span></span>
        <span>Form <span className="font-bold" style={{ color: formColor }}>{last.tsb > 0 ? '+' : ''}{last.tsb}</span> · {formLabel}</span>
      </p>
    </div>
  );
}

function addDaysToDate(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function rescheduleEarliestDate(fromDate) {
  const dayAfterSource = addDaysToDate(fromDate, 1);
  return dayAfterSource > todayISO() ? dayAfterSource : todayISO();
}

function getWeekFocuses(focus) {
  if (focus.startsWith('inseason_') || focus.startsWith('zvs_') || focus === 'inseason') {
    return [
      { focus: 'inseason_strength',    label: 'Силовая' },
      { focus: 'inseason_power',       label: 'Мощностная' },
      { focus: 'inseason_prophylaxis', label: 'Профилактика' },
    ];
  }
  if (focus.startsWith('camp_ecc_')) {
    return [
      { focus: 'camp_ecc_anterior',  label: 'Передняя цепь' },
      { focus: 'camp_ecc_posterior', label: 'Задняя цепь' },
      { focus: 'camp_ecc_fullbody',  label: 'Всё тело' },
    ];
  }
  if (focus.startsWith('camp_iso_')) {
    const startsPosterior = focus === 'camp_iso_posterior';
    const anterior = { focus: 'camp_iso_anterior', label: 'Передняя цепь' };
    const posterior = { focus: 'camp_iso_posterior', label: 'Задняя цепь' };
    return [
      startsPosterior ? posterior : anterior,
      startsPosterior ? anterior : posterior,
      startsPosterior ? posterior : anterior,
      startsPosterior ? anterior : posterior,
    ];
  }
  if (focus === 'camp_explosive') {
    return [
      { focus: 'camp_explosive', label: 'Сессия 1' },
      { focus: 'camp_explosive', label: 'Сессия 2' },
      { focus: 'camp_explosive', label: 'Сессия 3' },
    ];
  }
  if (focus.startsWith('pep_')) {
    return [
      { focus, label: 'День A' },
      { focus, label: 'День B' },
      { focus: 'zvs_recovery', label: 'Восстановление' },
    ];
  }
  return [
    { focus: 'strength',      label: 'Силовой' },
    { focus: 'power',         label: 'Мощностной' },
    { focus: 'zvs_recovery',  label: 'Восстановление' },
  ];
}

function summarizeWarmupForGym(warmupSession) {
  if (!warmupSession?.blocks) return '';
  return warmupSession.blocks.map(block => {
    const exList = (block.exercises || []).map(ex => `${ex.name} (${(ex.targetSets || []).join('/')})`).join(', ');
    return `${block.label}: ${exList}`;
  }).join('\n');
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function positionDot(pos) {
  const p = (pos || '').toLowerCase();
  if (p.includes('диагон')) return 'bg-violet-400';
  if (p.includes('доигр')) return 'bg-cyan-400';
  if (p.includes('центр') || p.includes('middle')) return 'bg-amber-400';
  if (p.includes('связ') || p.includes('setter')) return 'bg-emerald-400';
  if (p.includes('либеро')) return 'bg-rose-400';
  return 'bg-slate-500';
}

const PERIODS = [
  { value: 'inseason',  label: 'Сезон' },
  { value: 'camp',      label: 'Сборы' },
  { value: 'offseason', label: 'Межсезонье' },
  { value: 'rehab',     label: 'Реабилитация' },
];

const PERIOD_COLORS = {
  inseason:  {
    tab:  'border-cyan-400/60 bg-cyan-400/[0.15] text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.20),inset_0_1px_0_rgba(34,211,238,0.15)]',
    card: 'border-cyan-400/40 bg-cyan-400/[0.10] shadow-[0_0_12px_rgba(34,211,238,0.10)]',
    text: 'text-cyan-200',
    dot:  'bg-cyan-400',
    glow: '',
  },
  camp: {
    tab:  'border-amber-400/60 bg-amber-400/[0.18] text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.20),inset_0_1px_0_rgba(251,191,36,0.15)]',
    card: 'border-amber-400/40 bg-amber-400/[0.10] shadow-[0_0_12px_rgba(251,191,36,0.10)]',
    text: 'text-amber-200',
    dot:  'bg-amber-400',
    glow: '',
  },
  offseason: {
    tab:  'border-emerald-400/60 bg-emerald-400/[0.18] text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.20),inset_0_1px_0_rgba(52,211,153,0.15)]',
    card: 'border-emerald-400/40 bg-emerald-400/[0.10] shadow-[0_0_12px_rgba(52,211,153,0.10)]',
    text: 'text-emerald-200',
    dot:  'bg-emerald-400',
    glow: '',
  },
  rehab: {
    tab:  'border-violet-400/60 bg-violet-400/[0.18] text-violet-200 shadow-[0_0_16px_rgba(167,139,250,0.20),inset_0_1px_0_rgba(167,139,250,0.15)]',
    card: 'border-violet-400/40 bg-violet-400/[0.10] shadow-[0_0_12px_rgba(167,139,250,0.10)]',
    text: 'text-violet-200',
    dot:  'bg-violet-400',
    glow: '',
  },
};

// Block A=bilateral lower(amber), B=upper body(orange), C=unilateral lower(sky), D=positional(teal), E=prehab(violet)
const BLOCK_CONFIG = {
  A: { circle: 'bg-amber-400',  line: 'from-amber-400/30',  sub: 'text-amber-300/70',  headerFrom: 'from-amber-400/[0.09]',  codeBg: 'bg-amber-400/20 text-amber-300' },
  B: { circle: 'bg-orange-400', line: 'from-orange-400/30', sub: 'text-orange-300/70', headerFrom: 'from-orange-400/[0.09]', codeBg: 'bg-orange-400/20 text-orange-300' },
  C: { circle: 'bg-sky-400',    line: 'from-sky-400/30',    sub: 'text-sky-300/70',    headerFrom: 'from-sky-400/[0.09]',    codeBg: 'bg-sky-400/20 text-sky-300' },
  D: { circle: 'bg-teal-400',   line: 'from-teal-400/30',   sub: 'text-teal-300/70',   headerFrom: 'from-teal-400/[0.09]',   codeBg: 'bg-teal-400/20 text-teal-300' },
  E: { circle: 'bg-violet-400', line: 'from-violet-400/30', sub: 'text-violet-300/70', headerFrom: 'from-violet-400/[0.09]', codeBg: 'bg-violet-400/20 text-violet-300' },
};
function blockCfg(label) { return BLOCK_CONFIG[label] || BLOCK_CONFIG.A; }

const WARMUP_SECTION_STYLES = {
  rolling:    { bar: 'bg-violet-400', text: 'text-violet-400', chip: 'bg-violet-400/[0.07] border-violet-400/20', icon: '⬤' },
  raise:      { bar: 'bg-violet-400', text: 'text-violet-400', chip: 'bg-violet-400/[0.07] border-violet-400/20', icon: '⬤' },
  mobility:   { bar: 'bg-sky-400',    text: 'text-sky-400',    chip: 'bg-sky-400/[0.07] border-sky-400/20',    icon: '◎' },
  activation: { bar: 'bg-amber-400',  text: 'text-amber-400',  chip: 'bg-amber-400/[0.07] border-amber-400/20',  icon: '▶' },
  speed:      { bar: 'bg-cyan-400',   text: 'text-cyan-400',   chip: 'bg-cyan-400/[0.07] border-cyan-400/20',   icon: '⚡' },
  primer:     { bar: 'bg-cyan-400',   text: 'text-cyan-400',   chip: 'bg-cyan-400/[0.07] border-cyan-400/20',   icon: '⚡' },
};
const WARMUP_FOCUS_MAP = { anterior: 'Утро: передняя цепь', posterior: 'Утро: задняя цепь', fullbody: 'Утро: всё тело', general: '' };
const WARMUP_PHASE_MAP = {
  coach_selected: 'Тип по силовой сессии',
  quiet_week_strength_1: 'Силовой день',
  md_plus_1: 'MD+1 · восстановление',
  md_minus_1: 'MD-1 · primer',
  compressed_microdose: 'MD-2 · мощностная микродоза',
  travel_day: 'День переезда · recovery',
  match_day: 'День матча · primer',
};

const PHASES_BY_PERIOD = {
  inseason: [
    { value: 'inseason_strength',     label: 'Силовая', sub: 'Развивающая / поддерживающая · 40–50 мин' },
    { value: 'inseason_power',        label: 'Мощность / скорость',   sub: 'Development 50–55 · Microdose 30 мин' },
    { value: 'inseason_prophylaxis',  label: 'Профилактика',          sub: 'Слабые звенья · суставы' },
    { value: 'inseason_deload',       label: 'Разгрузочная неделя',  sub: 'По тренду усталости и календарю' },
    { value: 'inseason_accumulation', label: 'Накопление', sub: 'Только в окне без плотных матчей' },
    { value: 'inseason_conversion',   label: 'Конверсия в мощность', sub: 'Короткая скоростная работа' },
    { value: 'inseason_taper',        label: 'Тейпер к пику', sub: 'Только перед отмеченным целевым турниром' },
    { value: 'inseason_md1_activation', label: 'MD-1 активация', sub: '12-20 мин · без накопления усталости' },
    { value: MANUAL_MATCH_DAY_FOCUS, label: 'Игровой день · силовой праймер', sub: '20–25 мин · индивидуально · ручное сохранение' },
  ],
  camp: [
    { value: 'camp_ecc_anterior',  label: 'Эксцентрика · Передняя цепь',  sub: 'Ручной выбор метода' },
    { value: 'camp_ecc_posterior', label: 'Эксцентрика · Задняя цепь',    sub: 'Ручной выбор метода' },
    { value: 'camp_ecc_fullbody',  label: 'Эксцентрика · Всё тело',       sub: 'Ручной выбор метода' },
    { value: 'camp_iso_anterior',  label: 'Изометрика · Передняя цепь',   sub: 'Ручной выбор метода' },
    { value: 'camp_iso_posterior', label: 'Изометрика · Задняя цепь',     sub: 'Ручной выбор метода' },
    { value: 'camp_explosive',     label: 'Взрыв / Потенциация',           sub: 'Ручной выбор метода' },
  ],
  offseason: [
    { value: 'zvs_struct',         label: 'Структурная подготовка', sub: 'ЗВС Фаза 1' },
    { value: 'zvs_strength_base',  label: 'Силовая база',           sub: 'ЗВС Фаза 2' },
    { value: 'zvs_power_transfer', label: 'Мощность и перенос',     sub: 'ЗВС Фаза 3' },
  ],
  rehab: [
    { value: 'rehab', label: 'Реабилитация / Травма', sub: null },
  ],
};

const TRAINING_TYPES = [
  { value: 'anterior_chain', label: 'Передняя цепь' },
  { value: 'posterior_chain', label: 'Задняя цепь' },
  { value: 'full_body', label: 'Все тело' },
  { value: 'recovery_prehab', label: 'Восстановление / профилактика' },
  { value: 'activation_power', label: 'Активация / мощность' },
];

const STRENGTH_TRAINING_TYPES = TRAINING_TYPES.filter(type => ['full_body','anterior_chain','posterior_chain'].includes(type.value));

const MATCH_LOAD_OPTIONS = [
  { value: '', label: 'Матч: —' },
  { value: 'high', label: 'Высокая' },
  { value: 'medium', label: 'Средняя' },
  { value: 'low', label: 'Низкая' },
  { value: 'none', label: 'Не играла' },
  { value: 'inactive', label: 'Не в заявке' },
];

function defaultTrainingTypeForFocus(focusValue) {
  const f = String(focusValue || '');
  if (isManualMatchDayFocus(f)) return 'activation_power';
  if (f.includes('posterior')) return 'posterior_chain';
  if (f.includes('fullbody')) return 'full_body';
  if (f.includes('recovery') || f.includes('prophylaxis') || f.includes('deload') || f === 'rehab') return 'recovery_prehab';
  if (f.includes('power') || f.includes('activation') || f.includes('explosive') || f.includes('taper')) return 'activation_power';
  if (f.includes('inseason')) return 'full_body';
  return 'anterior_chain';
}

const MANUAL_PHASE_SUB = {
  [MANUAL_MATCH_DAY_FOCUS]: 'Ручной выбор · игровой день',
  inseason_strength: 'Ручной выбор · силовая',
  inseason_power: 'Ручной выбор · мощность',
  inseason_prophylaxis: 'Ручной выбор · профилактика',
  inseason_deload: 'Ручной выбор · deload',
  inseason_accumulation: 'Ручной выбор · накопление',
  inseason_conversion: 'Ручной выбор · конверсия',
  inseason_taper: 'Ручной выбор · тейпер',
  inseason_md1_activation: 'Ручной выбор · активация',
  camp_ecc_anterior: 'Методика · передняя цепь',
  camp_ecc_posterior: 'Методика · задняя цепь',
  camp_ecc_fullbody: 'Методика · всё тело',
  camp_iso_anterior: 'Методика · передняя цепь',
  camp_iso_posterior: 'Методика · задняя цепь',
  camp_explosive: 'Методика · взрыв',
};

const NK_PHASE_LABEL = {
  [MANUAL_MATCH_DAY_FOCUS]: 'Игровой день · силовой праймер',
  inseason_accumulation: 'Накопление силы',
  inseason_conversion: 'Конверсия в мощность',
  inseason_md1_activation: 'Активация / тонус',
};

function phaseLabelForWorkspace(phase, workspace) {
  return workspace === 'nkperf' ? (NK_PHASE_LABEL[phase.value] || phase.label) : phase.label;
}

function phaseSubForWorkspace(phase, workspace) {
  return MANUAL_PHASE_SUB[phase.value] || (workspace === 'nkperf' ? 'Ручной выбор' : phase.sub);
}

function phasesForWorkspace(period, workspace) {
  return PHASES_BY_PERIOD[period] || [];
}

function getFocusLabel(period, focusValue) {
  return PHASES_BY_PERIOD[period]?.find(ph => ph.value === focusValue)?.label || focusValue;
}

function todayISO() {
  return calendarToday();
}

function compactTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function compactLoad(value) {
  const number = Number(value) || 0;
  if (!number) return '—';
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)} т`;
  return `${Math.round(number)} кг`;
}

function addDaysToStr(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function emptyDevelopmentPlan(start = todayISO()) {
  return { cycleStart: start, reviewDate: addDaysToStr(start, 28), goals: [] };
}

function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

function getCalendarGrid(weeks = 4) {
  const today = new Date();
  const dow = today.getDay();
  const start = new Date(today);
  start.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
  const startStr = start.toISOString().slice(0, 10);
  const days = [];
  for (let i = 0; i < weeks * 7; i++) days.push(addDaysToStr(startStr, i));
  return days;
}

// ── Monthly planner config ──
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

const PLANNER_TYPES = [
  { value: 'training', label: 'Тренировка' },
  { value: 'game',     label: 'Игра' },
  { value: 'travel',   label: 'Перелёт' },
  { value: 'rest',     label: 'Выходной' },
];

// Cell colors keyed by type, then by focus for training days.
const PLANNER_CELL = {
  game:   'border-rose-500/40 bg-rose-500/[0.12] text-rose-200',
  travel: 'border-amber-500/40 bg-amber-500/[0.12] text-amber-200',
  rest:   'border-white/[0.06] bg-white/[0.02] text-slate-600',
  empty:  'border-white/[0.05] bg-transparent text-slate-700',
};
const PLANNER_FOCUS_CELL = {
  inseason_strength:     'border-cyan-500/40 bg-cyan-500/[0.12] text-cyan-200',
  inseason_power:        'border-violet-500/40 bg-violet-500/[0.12] text-violet-200',
  inseason_prophylaxis:  'border-emerald-500/40 bg-emerald-500/[0.12] text-emerald-200',
  inseason_deload:       'border-slate-500/40 bg-slate-500/[0.12] text-slate-300',
  inseason_taper:        'border-yellow-500/40 bg-yellow-500/[0.12] text-yellow-200',
  inseason_accumulation: 'border-orange-500/40 bg-orange-500/[0.12] text-orange-200',
  inseason_conversion:   'border-purple-500/40 bg-purple-500/[0.12] text-purple-200',
};
const PLANNER_FOCUS_SHORT = {
  inseason_strength:     'Сила',
  inseason_power:        'Мощность',
  inseason_prophylaxis:  'Профил.',
  inseason_deload:       'Deload',
  inseason_taper:        'Тейпер',
  inseason_accumulation: 'Накопл.',
  inseason_conversion:   'Конверс.',
};

function plannerCellClass(day) {
  if (!day) return PLANNER_CELL.empty;
  if (day.type === 'training') return PLANNER_FOCUS_CELL[day.focus] || 'border-cyan-500/30 bg-cyan-500/[0.07] text-cyan-300';
  return PLANNER_CELL[day.type] || PLANNER_CELL.empty;
}

// Build a 6-row grid (Mon-Sun) of ISO date strings (or null for padding) for a YYYY-MM month.
function getMonthGrid(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = first.getUTCDay();
  const lead = firstDow === 0 ? 6 : firstDow - 1; // Mon=0
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

const DAYS_RU = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

function ScheduleCalendar({ events, onToggle, trainingDate }) {
  const calDays = useMemo(() => getCalendarGrid(4), []);
  const evMap = useMemo(() => {
    const m = {};
    events.forEach(e => { m[e.date] = e.type; });
    return m;
  }, [events]);

  const today = todayISO();

  return (
    <div>
      <div className="grid grid-cols-7 mb-1.5">
        {DAYS_RU.map(d => (
          <div key={d} className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-700 py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {calDays.map(day => {
          const type = evMap[day];
          const isToday = day === today;
          const isTraining = day === trainingDate;
          const isPast = day < today;
          const dayNum = parseInt(day.slice(8), 10);
          const monthChanged = day.slice(5, 7) !== calDays[Math.max(0, calDays.indexOf(day) - 1)]?.slice(5, 7);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onToggle(day)}
              title={type === 'game' ? 'Игра — клик чтобы сменить на перелёт' : type === 'travel' ? 'Перелёт — клик чтобы сбросить' : 'Клик: отметить как игру'}
              className={[
                'relative rounded-lg py-1.5 text-center text-[11px] font-medium transition-all duration-150',
                type === 'game'
                  ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40 hover:bg-rose-500/35'
                  : type === 'travel'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35 hover:bg-amber-500/30'
                  : isPast
                  ? 'text-slate-700 border border-transparent hover:border-white/[0.08] hover:text-slate-500'
                  : 'text-slate-400 border border-white/[0.05] hover:border-white/[0.14] hover:text-slate-200 hover:bg-white/[0.04]',
                isToday ? 'ring-1 ring-accent/60' : '',
                isTraining ? 'ring-2 ring-accent shadow-[0_0_8px_rgba(34,211,238,0.35)]' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="block leading-none">{dayNum}</span>
              {type === 'game' && <span className="block text-[8px] mt-0.5 leading-none">🏐</span>}
              {type === 'travel' && <span className="block text-[8px] mt-0.5 leading-none">✈</span>}
              {monthChanged && !type && (
                <span className="absolute -top-0.5 -right-0.5 block h-1 w-1 rounded-full bg-slate-700" />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600">
        <span>1 клик → <span className="text-rose-400 font-medium">🏐 игра</span></span>
        <span>2 клика → <span className="text-amber-400 font-medium">✈ перелёт</span></span>
        <span>3 клика → сброс</span>
        <span className="text-accent/50">Рамка = дата тренировки</span>
      </div>
    </div>
  );
}

function SectionLabel({ icon, text }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-slate-600">
      <span className="text-accent/60">{icon}</span>
      {text}
    </div>
  );
}

const inputBase =
  'block w-full rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.06] focus:border-accent/40 focus:bg-white/[0.07] focus:ring-2 focus:ring-accent/[0.12]';

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

function Listbox({ value, onChange, options, placeholder = '— выбрать —' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOut(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onOut);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOut);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${inputBase} ${focusRing} flex items-center justify-between gap-2 text-left ${
          open ? 'border-accent/50 bg-white/[0.06] ring-2 ring-accent/15' : ''
        }`}
      >
        <span className={`truncate ${selected ? 'text-slate-100' : 'text-slate-600'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-600 transition-transform duration-200 ${open ? 'rotate-180 text-accent' : ''}`}
        />
      </button>

      {open && (
        <ul className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-white/[0.08] bg-[#0c1118] p-1 shadow-[0_12px_40px_rgba(0,0,0,0.7)] backdrop-blur-2xl animate-fade-in">
          {options.map(o => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  o.value === value
                    ? 'bg-accent/10 text-accent'
                    : 'text-slate-300 hover:bg-white/[0.05] hover:text-slate-100'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check size={13} className="shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const YT_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1C4.5 20.5 12 20.5 12 20.5s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.3 3.5-6.3 3.5z"/>
  </svg>
);

function youtubeVideoId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return /^[\w-]{11}$/.test(id || '') ? id : null;
    }
    if (host.endsWith('youtube.com')) {
      const [, , pathId] = parsed.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/) || [];
      const id = parsed.searchParams.get('v') || pathId;
      return /^[\w-]{11}$/.test(id || '') ? id : null;
    }
  } catch (_) {
    const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:[^#\s]+&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  return null;
}

const PENCIL_ICON = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

function ExerciseVideoPanel({name,apiKey,editable=true}) {
  const bankUrl=findExerciseUrl(name),panelId=useId();
  const [pinned,setPinned]=useState(false);
  useEffect(()=>{const pin=e=>{if(e.detail!==panelId)setPinned(false);};window.addEventListener('gym-video-pin',pin);return()=>window.removeEventListener('gym-video-pin',pin);},[panelId]);
  useEffect(()=>setPinned(false),[name]);
  const [manualVideoUrl,setManualVideoUrl]=useState(null),[editingVideo,setEditingVideo]=useState(false),[videoInput,setVideoInput]=useState(''),[savingVideo,setSavingVideo]=useState(false),[videoError,setVideoError]=useState(''),[playing,setPlaying]=useState(false),[reload,setReload]=useState(0),[expanded,setExpanded]=useState(false),[videoSaved,setVideoSaved]=useState(false);
  const epoch=useRef(0),mutation=useRef(null);
  useEffect(()=>{const version=++epoch.current;setManualVideoUrl(null);setEditingVideo(false);setVideoInput('');setSavingVideo(false);setVideoError('');setPlaying(false);setExpanded(false);setVideoSaved(false);return()=>{epoch.current++;mutation.current?.abort();};},[name,apiKey]);
  useEffect(()=>{
    if(!name?.trim() || !apiKey)return;
    const controller=new AbortController(),version=epoch.current;
    teamQueueCall(apiKey,`/api/exercises/manual-video?name=${encodeURIComponent(name)}`,{signal:controller.signal,timeoutMs:15000})
      .then(data=>{if(!controller.signal.aborted && version===epoch.current){setManualVideoUrl(data.url || null);setVideoError('');}})
      .catch(()=>{if(!controller.signal.aborted && version===epoch.current)setVideoError('Не удалось проверить видео тренера. Повторите загрузку.');});
    return()=>controller.abort();
  },[name,apiKey,reload]);
  const videoUrl=manualVideoUrl || bankUrl,candidateId=editingVideo?youtubeVideoId(videoInput):null,previewing=!!candidateId && videoInput.trim()!==videoUrl,videoId=previewing?candidateId:youtubeVideoId(videoUrl),watchUrl=videoId?`https://www.youtube.com/watch?v=${videoId}`:videoUrl;
  useEffect(()=>setPlaying(false),[videoUrl,candidateId]);
  useEffect(()=>{if(!editingVideo)setVideoInput(videoUrl || '');},[videoUrl,editingVideo]);
  async function handleSaveVideo(){
    const url=videoInput.trim();if(!url || savingVideo)return;if(!youtubeVideoId(url)){setVideoError('Вставьте корректную ссылку YouTube: watch, Shorts или youtu.be.');return;}
    const version=++epoch.current,controller=new AbortController();mutation.current=controller;setSavingVideo(true);setVideoError('');
    try{const data=await teamQueueCall(apiKey,'/api/exercises/manual-video',{body:{name,url},signal:controller.signal,timeoutMs:20000});if(!data.ok || !data.url)throw Error('Ссылка не сохранена.');if(version===epoch.current){setManualVideoUrl(data.url);setVideoInput(data.url);setEditingVideo(false);setVideoSaved(true);}}
    catch(error){if(version===epoch.current)setVideoError(error.message || 'Не удалось сохранить видео.');}
    finally{if(version===epoch.current)setSavingVideo(false);}
  }
  async function handleDeleteVideo(){
    if(savingVideo)return;const version=++epoch.current,controller=new AbortController();mutation.current=controller;setSavingVideo(true);setVideoError('');const timer=setTimeout(()=>controller.abort(),20000);
    try{const response=await fetch(`/api/exercises/manual-video?name=${encodeURIComponent(name)}`,{method:'DELETE',headers:{'x-api-key':apiKey},signal:controller.signal});const data=await response.json();if(!response.ok || !data.ok)throw Error(data.error || 'Не удалось сбросить видео.');if(version===epoch.current){setManualVideoUrl(null);setEditingVideo(false);}}
    catch(error){if(version===epoch.current)setVideoError(error.message || 'Не удалось сбросить видео.');}
    finally{clearTimeout(timer);if(version===epoch.current)setSavingVideo(false);}
  }
  const panel=<div className={`coach-video-panel coach-video-compact print:hidden ${!videoId?'is-empty':''} ${expanded?'is-expanded':''} ${pinned?'is-pinned':''}`}>
    <div className="coach-video-frame">{videoId?playing?<iframe src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`} title={`Видео техники · ${name}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<button type="button" className="coach-video-poster" aria-label={`Смотреть видео техники: ${name}`} onClick={()=>setPlaying(true)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}<img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt={`Техника ${name}`} loading="lazy"/><span className="coach-video-shade"/><span className="coach-video-play">▶</span><span className="coach-video-caption">Смотреть технику</span>
    </button>:<div className="coach-video-empty"><strong>Видео ещё не добавлено</strong>{editable?<span>Вставьте ссылку ниже</span>:<p>Техника выполнения описана ниже.</p>}</div>}</div>
    <div className="coach-video-meta"><span>{previewing?'Предпросмотр · ещё не сохранено':manualVideoUrl?'Видео тренера':videoId?'Библиотека техники':'Техника упражнения'}</span><div>{(videoId || videoUrl) && <a href={watchUrl} target="_blank" rel="noopener noreferrer" title="Открыть YouTube в новой вкладке">YouTube ↗</a>}{videoId && <button type="button" aria-label={`${expanded?'Уменьшить':'Увеличить'} видео: ${name}`} onClick={()=>setExpanded(value=>!value)}>{expanded?'Уменьшить':'Увеличить'}</button>}{videoId && <button type="button" aria-label={`${pinned?'Открепить':'Закрепить'} видео: ${name}`} onClick={()=>{if(!pinned)window.dispatchEvent(new CustomEvent('gym-video-pin',{detail:panelId}));setPinned(v=>!v);}}>{pinned?'Открепить':'Закрепить'}</button>}{playing && <button type="button" onClick={()=>setPlaying(false)}>Закрыть видео</button>}</div></div>
    {editable && <form className="coach-video-quick-edit" onSubmit={event=>{event.preventDefault();handleSaveVideo();}}><label><span>Добавить YouTube-видео · общая библиотека обоих пространств</span><input type="text" inputMode="url" aria-label={`YouTube-видео для ${name}`} value={videoInput} onFocus={event=>event.target.select()} onChange={event=>{setVideoInput(event.target.value);setEditingVideo(true);setVideoSaved(false);setVideoError('');}} placeholder="Вставьте ссылку YouTube" onKeyDown={event=>{if(event.key==='Escape' && editingVideo){event.preventDefault();event.stopPropagation();setEditingVideo(false);setVideoError('');}}}/></label><button type="submit" disabled={savingVideo || !videoInput.trim() || !editingVideo || !candidateId}>{savingVideo?'Сохраняю…':'Сохранить видео'}</button>{editingVideo && <button type="button" onClick={()=>{setEditingVideo(false);setVideoInput(videoUrl || '');setVideoError('');}}>Отменить ссылку</button>}<div className="coach-video-quick-links"><a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(name+' exercise technique')}`} target="_blank" rel="noopener noreferrer">Найти на YouTube ↗</a>{manualVideoUrl && <button type="button" onClick={handleDeleteVideo} disabled={savingVideo}>Сбросить своё видео</button>}{videoSaved && <span role="status">Видео сохранено ✓</span>}</div></form>}
    {videoError && <div className="coach-video-error" role="alert"><p>{videoError}</p><button type="button" onClick={()=>editingVideo?handleSaveVideo():setReload(value=>value+1)}>{editingVideo?'Повторить сохранение видео':'Повторить загрузку видео'}</button></div>}
  </div>;
  return pinned?createPortal(panel,document.querySelector('dialog[open]') || document.querySelector('main') || document.body):panel;
}

function AutoResizeTextarea({ value, onChange, className, placeholder, minRows = 1, ariaLabel }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize=()=>{el.style.height='auto';el.style.height=el.scrollHeight+'px';};
    resize();let width=el.parentElement?.clientWidth;
    const observer=new ResizeObserver(entries=>{const next=entries[0]?.contentRect.width;if(next!==width){width=next;resize();}});
    if(el.parentElement)observer.observe(el.parentElement);
    return()=>observer.disconnect();
  }, [value]);
  return (
    <textarea
      ref={ref}
      aria-label={ariaLabel}
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={minRows}
      placeholder={placeholder}
      className={className + ' overflow-hidden'}
    />
  );
}

// Parse numeric kg value from legacy free-text weightNote strings.
function parseKgFromNote(note) {
  if (!note) return null;
  const m = String(note).match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)\b/i);
  if (m) return parseFloat(m[1].replace(',', '.'));
  const pure = String(note).trim().match(/^(\d+(?:[.,]\d+)?)$/);
  return pure ? parseFloat(pure[1].replace(',', '.')) : null;
}

function targetSetReps(value) {
  const multiple = String(value || '').match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (multiple) return parseInt(multiple[1], 10) * parseInt(multiple[2], 10);
  return parseInt(value, 10) || 0;
}

function ExerciseCard({
  apiKey,
  preview=false,
  onChangeTargetRpeMax,
  onUndo,
  code,
  name,
  targetSets=[],
  weightNote,
  weightKg,
  targetRpeMax,
  loadUnits,
  tempo,
  prehabRegion,
  autoReg,
  alternatives,
  cue,
  descriptionOverride,
  descriptionExerciseId,
  compactDescription,
  controlledExecution,
  preserveStoredDescription=false,
  loadEvidence,
  focus,
  week,
  oneRM,
  position,
  prevKg,
  prevRpe,
  prevPain,
  suggestedKg,
  progressionDecision,
  progressionConfidence,
  progressionTrend,
  strengthProposal,onApplyStrengthProgression,progressionError,progressionLoading,onRetryProgression,
  restrictions,
  exHistory,
  actualKg,
  onActualKgChange,
  actualRpe,
  onActualRpeChange,
  onChangeName,
  replacementFrom, replacementReason, replacementNote, onChangeReplacementReason, onChangeReplacementNote,
  onChangeSet,
  onChangeSets,
  onAddSet,
  onRemoveSet,
  onChangeWeight,
  onChangeWeightKg,
  onChangeLoadUnits,
  onChangeTempo,
  onChangeAutoReg,
  onChangeDescription,
  onResetDescription,
  onRegenerate,
}) {
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState('');
  const [swapOpen, setSwapOpen] = useState(false);
  const [altLoading, setAltLoading] = useState(false);
  const [altSuggestion, setAltSuggestion] = useState(null);

  async function handleSuggestAlt() {
    if (altLoading) return;
    setAltLoading(true);
    setAltSuggestion(null);
    try {
      const r = await fetch('/api/programs/suggest-alternative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ exerciseName: name, restrictions: restrictions || [], position, focus }),
      });
      const d = await r.json();
      setAltSuggestion(d.alternative || d.error || 'Не удалось получить замену');
    } catch (_) {
      setAltSuggestion('Ошибка запроса');
    } finally {
      setAltLoading(false);
    }
  }
  const blockLetter = (code || 'A')[0];
  const bc = blockCfg(blockLetter);
  const hasConflict = hasRestriction(name, restrictions || []);
  const rmSuggestion = useMemo(() => focus==='inseason_strength'?null:calcWeight(name, focus, week, oneRM, position), [name, focus, week, oneRM, position]);
  const effectiveSuggestedKg = suggestedKg || rmSuggestion?.kg || null;
  const hasDescriptionOverride = typeof descriptionOverride === 'string';
  const displayedDescription = exerciseDescription({ name, tempo, targetSets, prehabRegion, cue, descriptionOverride, descriptionExerciseId, compactDescription, controlledExecution,preserveStoredDescription });
  const descriptionWarning=techniqueQuality(name,displayedDescription);
  const techniqueReference=descriptionWarning?exerciseDescription({name,tempo,targetSets,prehabRegion,controlledExecution,cue:replacementTechnique(name)}):'';

  async function handleRegenerate() {
    if (regenerating || !onRegenerate) return;
    setRegenerating(true);
    setRegenerateError('');
    try {
      await onRegenerate();
    } catch (error) {
      setRegenerateError(error.message || 'Не удалось подобрать замену');
    } finally {
      setRegenerating(false);
    }
  }

  function openSwap() {setSwapOpen(value=>!value);}

  function doSwap(card) {
    if (onChangeName) onChangeName(card.title,card.description);
    setSwapOpen(false);
  }

  return (
    <article className={`premium-exercise-card coach-exercise-card coach-exercise-studio ${hasConflict ? 'coach-exercise-conflict' : ''}`} aria-label={`${code || ''} ${name}`}>
      <header className="coach-exercise-heading">
        <span className="coach-exercise-code">{code || '＋'}</span>
        <div className="coach-exercise-title"><span>Упражнение</span>{preview?<h3>{name}</h3>:<AutoResizeTextarea value={name} onChange={onChangeName} ariaLabel={`${code} · название упражнения`} className="coach-exercise-name"/>}</div>
        {!preview && <div className="coach-exercise-actions">{onUndo && <button type="button" onClick={onUndo} aria-label={`Отменить правку ${code}`}><RotateCcw size={15}/>Отменить</button>}<button type="button" onClick={openSwap} title="Найти и заменить упражнение"><ArrowLeftRight size={15}/><span>Заменить</span></button>{onRegenerate && <button type="button" onClick={handleRegenerate} disabled={regenerating} title="Подобрать замену автоматически">{regenerating?<Loader2 size={15} className="animate-spin"/>:<RefreshCw size={15}/>}<span>Автоподбор</span></button>}</div>}
      </header>
      {regenerateError && <p role="alert" className="coach-exercise-notice">{regenerateError}</p>}
      {!preview && swapOpen && <div className="coach-exercise-swap-studio"><header><strong>Замена · {code}</strong><button type="button" onClick={()=>setSwapOpen(false)}>Закрыть подбор</button></header><ExerciseLibraryPicker quick key={name} apiKey={apiKey} currentName={name} restrictions={restrictions} currentSets={targetSets} currentTempo={tempo} onClose={()=>setSwapOpen(false)} onSelect={doSwap}/></div>}
      {hasConflict && <div className="coach-exercise-notice">⚠ Ограничение для этого упражнения.{!preview && <button type="button" onClick={handleSuggestAlt} disabled={altLoading}>{altLoading?'Подбор…':'Подобрать альтернативу'}</button>}{altSuggestion && <p>{altSuggestion}</p>}</div>}
      <div className="coach-exercise-body">
        <aside className="coach-exercise-technique">
          <section className="coach-technique-disclosure is-always-open" aria-label="Видео техники"><ExerciseVideoPanel name={name} apiKey={apiKey} editable={!preview}/></section>
          <div className="coach-exercise-instruction"><div className="coach-section-caption"><span>02</span> Выполнение {hasDescriptionOverride && !preview && <button type="button" onClick={onResetDescription} title="Вернуть автоматически сформированное описание"><RotateCcw size={12}/>Исходное</button>}</div>
            {preview?<p>{displayedDescription || 'Описание пока не добавлено.'}</p>:<AutoResizeTextarea value={displayedDescription} onChange={onChangeDescription} ariaLabel={`${code} · описание выполнения`} minRows={3} placeholder="Опишите технику выполнения…" className="coach-description-input"/>}
            {!preview && <small>Правки увидит игрок после сохранения программы.</small>}
            {descriptionWarning && <div className="coach-technique-quality" role="note"><p>Уточните подсказку: {descriptionWarning}</p>{!preview && <details><summary>Ориентир для уточнения</summary><p>{techniqueReference}</p><small>Сверьте точную вариацию и индивидуальные ограничения перед правкой.</small><button type="button" onClick={()=>onChangeDescription(techniqueReference)}>Использовать этот ориентир</button></details>}</div>}
          </div>
        </aside>
        <div className="coach-exercise-prescription">
          <div className="coach-section-caption"><span>03</span> Нагрузка по плану</div>
          {preview?<ExercisePrescription weightNote={weightNote} weightKg={weightKg} sets={targetSets} targetRpeMax={targetRpeMax} loadUnits={loadUnitsForExercise({name,loadUnits})}/>:<>
          <PlannedLoadEditor code={code} name={name} sets={targetSets} weightKg={weightKg} weightNote={weightNote} targetRpeMax={targetRpeMax} loadUnits={loadUnits} onChangeSet={onChangeSet} onChangeSets={onChangeSets} onAddSet={onAddSet} onRemoveSet={onRemoveSet} onChangeWeightKg={onChangeWeightKg} onChangeTargetRpeMax={onChangeTargetRpeMax} onChangeLoadUnits={onChangeLoadUnits}/>
          <details className="coach-exercise-plan-editor coach-plan-extras"><summary>Темп и комментарий к нагрузке</summary><div className="coach-plan-fields"><label><span>Темп</span><input aria-label={`${code} · темп упражнения`} value={tempo || ''} onChange={e=>onChangeTempo(e.target.value)} placeholder="Например, 5-0-X-0"/></label></div><label className="coach-plan-comment"><span>Комментарий к нагрузке</span><AutoResizeTextarea ariaLabel={`${code} · комментарий к нагрузке`} value={weightNote || ''} onChange={onChangeWeight} minRows={2} className="coach-load-comment-input" placeholder="Например, по усилию RPE 7–8"/></label></details></>}
          {preview && tempo && <p className="coach-preview-tempo">Темп <strong>{tempo}</strong></p>}
          {preview && weightNote && weightNote.trim()!==`${weightKg} кг` && <p className="coach-preview-note">{weightNote}</p>}
          <WeightProvenance name={name} evidence={loadEvidence}/>
          {!preview && <div className="coach-exercise-progression">{focus==='inseason_strength'?<StrengthProgressionHint proposal={strengthProposal} error={progressionError} loading={progressionLoading} onRetry={onRetryProgression} onApply={onApplyStrengthProgression}/>:prevKg ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 print:hidden">
            <span className="text-[11px] text-slate-600">
              ↑ {prevKg} кг{prevRpe ? ` · RPE ${prevRpe}` : ''}{prevPain ? ' · боль' : ''}
              {effectiveSuggestedKg && effectiveSuggestedKg !== prevKg && (
                <span className={effectiveSuggestedKg > prevKg ? ' text-emerald-400/80' : ' text-rose-400/70'}>
                  {' → '}{effectiveSuggestedKg} кг
                </span>
              )}
            </span>
            {effectiveSuggestedKg && (
              <button
                type="button"
                onClick={() => onChangeWeightKg(effectiveSuggestedKg)}
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400/70 transition hover:bg-cyan-400/10 hover:text-cyan-400"
              >
                Принять
              </button>
            )}
            {!suggestedKg && rmSuggestion && (
              <div className="w-full text-[10px] text-slate-600">
                {rmSuggestion.pctLow}–{rmSuggestion.pctHigh}% от 1ПМ
                {rmSuggestion.maxSets && <span className="ml-1 text-amber-400/70">· макс. {rmSuggestion.maxSets} сета</span>}
              </div>
            )}
            {progressionDecision && (
              <div className="w-full text-[10px] text-slate-500">{progressionDecision}</div>
            )}
            {progressionConfidence && <div className="w-full text-[9px] font-bold uppercase tracking-wider text-slate-700">Уверенность: {progressionConfidence === 'high' ? 'высокая' : progressionConfidence === 'medium' ? 'средняя' : 'низкая'} · {progressionTrend === 'increase' ? 'прогрессия' : progressionTrend === 'reduce' ? 'снижение' : 'сохранить'}</div>}
          </div>
        ) : (
          /* 1RM hint when no previous session data */
          (() => {
            const hint = rmSuggestion;
            if (!hint) return null;
            return (
              <div className="mt-1 text-[12px] text-slate-600 print:hidden">
                Расч. вес: <span className="font-semibold text-slate-500">{hint.kg} кг</span>
                <span className="ml-1">({hint.pctLow}–{hint.pctHigh}% 1ПМ)</span>
                {hint.maxSets && <span className="ml-1 text-amber-400/70">· макс. {hint.maxSets} сета</span>}
              </div>
            );
          })()
        )}</div>}
          {autoReg && <div className="coach-exercise-regulation"><span>Коррекция по качеству</span>{preview?<p>{autoReg}</p>:<AutoResizeTextarea value={autoReg} onChange={onChangeAutoReg} ariaLabel={`${code} · коррекция нагрузки`} className="coach-regulation-input"/>}</div>}
          {!preview && onActualKgChange && <details className="coach-exercise-facts" open={actualKg!=null || actualRpe!=null || undefined}><summary>Фактическое выполнение <span>кг / RPE</span></summary><div className="coach-plan-fields"><label><span>Выполненный вес, кг / снаряд</span><input type="number" step="any" min="0" aria-label={`${code} · фактический вес в кг`} value={actualKg ?? ''} onChange={e=>onActualKgChange(e.target.value===''?null:Number(e.target.value))} placeholder="Факт кг"/></label>{onActualRpeChange && <label><span>RPE упражнения по факту</span><input type="number" step="0.5" min="1" max="10" aria-label={`${code} · фактический RPE упражнения`} value={actualRpe ?? ''} onChange={e=>onActualRpeChange(e.target.value===''?null:Number(e.target.value))} placeholder="1–10"/></label>}</div></details>}
          {!preview && Array.isArray(alternatives) && alternatives.length>0 && <details className="coach-exercise-alternatives"><summary>Альтернативы <span>{alternatives.length}</span></summary><div>{alternatives.slice(0,3).map((alt,i)=><button key={`${alt}-${i}`} type="button" onClick={()=>doSwap(alt)}>{alt}<ArrowUpRight size={12}/></button>)}</div></details>}
        </div>
      </div>
      {focus==='inseason_strength' && replacementFrom && <div className="coach-replacement-review"><p>Замена: {replacementFrom}</p>{preview?<p>{REPLACEMENT_REASONS[replacementReason] || 'Разовая замена'}{replacementNote?' · '+replacementNote:''}</p>:<><label>Причина замены<PremiumSelect value={replacementReason || ''} onChange={value=>onChangeReplacementReason?.(value)} options={[{value:'',label:'Не указана — не учитывать при подборе'},...Object.entries(REPLACEMENT_REASONS).map(([value,label])=>({value,label}))]}/></label><input aria-label="Комментарий к замене" placeholder="Комментарий к замене" value={replacementNote || ''} maxLength={300} onChange={e=>onChangeReplacementNote?.(e.target.value)}/><small>Учитывается для этого игрока после сохранения. Разовая замена не создаёт запрет.</small></>}</div>}
    </article>
  );
}

const CAMP_FORBIDDEN = [
  { re: /\bsled\b|\bprowler\b|\bсан(?:и|ей|ями|ям|ях|ки|ок|кам|ками|ках)\b/i, label: 'Сани / Sled / Prowler — оборудования нет' },
  { re: /back squat|классический присед|присед.*со штанг.*спин/i, label: 'Классический присед (Back Squat)' },
  { re: /barbell bench press|bench press barbell|жим штанги лёжа/i, label: 'Жим штанги лёжа' },
  { re: /front squat|присед.*со штанг.*груд|фронтальн.*присед/i, label: 'Front Squat' },
  { re: /barbell deadlift|conventional deadlift|становая.*штанг/i, label: 'Обычная Barbell Deadlift' },
  { re: /bent.?over row|тяга.*наклон|barbell row/i, label: 'Тяга в наклоне' },
  { re: /nordic curl|nordic hamstring|нордик/i, label: 'Nordic Curl' },
  { re: /olympic lift|clean\b|snatch\b|рывок|толчок.*штанг|power clean|hang clean/i, label: 'Olympic lifts со штангой' },
  { re: /heavy good morning|good morning/i, label: 'Heavy Good Morning' },
  { re: /barbell overhead press|overhead press.*barbell|military press|жим штанги стоя/i, label: 'Barbell Overhead Press' },
  { re: /leg press|жим ногами/i, label: 'Leg Press' },
  { re: /smith machine|машин[ае].*смита/i, label: 'Smith Machine' },
  { re: /leg extension|разгибание ног/i, label: 'Leg Extension' },
  { re: /(?:seated|lying|machine) hamstring curl|сгибание ног.*тренаж/i, label: 'Hamstring Curl в тренажёре' },
  { re: /ab wheel|ab roller|ролик.*пресс|rollout/i, label: 'Ab Wheel Rollout' },
  { re: /broad jump|прыжок в длину/i, label: 'Broad Jump (заменять вертикальными)' },
  { re: /floor press|жим.*пол[уе]|жим на полу/i, label: 'DB Floor Press' },
  { re: /wrist stability|стабилизация запястья|band.*wrist/i, label: 'Band Wrist Stability' },
  { re: /jump set drill|прыжок.*передач|имитация передачи/i, label: 'Jump Set Drill' },
  { re: /kb press|жим.*гир[яеи]\b|kettlebell press/i, label: 'KB Press (заменять DB/Landmine)' },
  { re: /tricep.*band.*pushdown|band.*tricep|pushdown.*петл|разгибание.*локт.*петл/i, label: 'Tricep Band Pushdown' },
];

const JUMP_TAGS = ['прыжок', 'jump', 'hop', 'bound', 'cmj', 'плиометр', 'tuck jump', 'split jump', 'box jump', 'depth jump'];

const TRAINING_TYPE_LABELS = Object.fromEntries(TRAINING_TYPES.map(t => [t.value, t.label]));

function qualityTone(ok) {
  return ok ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300' : 'border-amber-500/20 bg-amber-500/[0.07] text-amber-300';
}

function DecisionDataPanel({ data, loading, workspace, coachRecovery, onApply }) {
  const tone = (level) => ({
    green: 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300',
    yellow: 'border-amber-500/20 bg-amber-500/[0.06] text-amber-300',
    red: 'border-rose-500/25 bg-rose-500/[0.07] text-rose-300',
  }[level] || 'border-white/[0.08] bg-white/[0.02] text-slate-400');
  const indicator = (level) => ({ green: 'bg-emerald-400', yellow: 'bg-amber-400', red: 'bg-rose-400' }[level] || 'bg-slate-600');
  const shortTime = (value) => {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    } catch (_) { return ''; }
  };

  if (loading) {
    return (
      <section className="mt-4 border-t border-white/[0.07] pt-3" aria-live="polite">
        <div className="flex items-center gap-2 text-[11px] text-slate-600"><Loader2 size={13} className="animate-spin" /> Проверяю данные для решения...</div>
      </section>
    );
  }
  if (!data) return null;

  if (data.source === 'ReadySix') {
    const rec = data.recommendation;
    const state = rec?.state || data.decision;
    return (
      <section className="mt-4 space-y-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-cyan-300">ReadySix · текущие данные состояния и расписания</span>
          <a href="https://readysix.app/dashboard" target="_blank" rel="noreferrer" className="text-xs text-slate-400 underline">Открыть аналитику</a>
        </div>
        {rec?.planning?.preliminary && <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
          <p className="font-semibold">Предварительный план на {data.targetDate}</p>
          <p className="mt-1">Аналитика на {rec.planning.assessmentDate}. Последние наблюдения: {rec.planning.latestObservationDate || 'пока нет'}. Анкеты на дату тренировки не обязательны для подготовки программы. Перед выполнением проверьте новые данные.</p>
        </div>}
        <div className={`rounded-xl border p-3 ${tone(state?.level)}`}>
          <p className="text-sm font-semibold">{state?.label || 'Нет решения ReadySix'}</p>
          <p className="mt-1 text-xs opacity-80">{state?.detail}</p>
          {state?.capPercent != null && !state?.dataInsufficient && <p className="mt-1 text-xs">Лимит объёма ReadySix: {state.capPercent}% · не процент от 1ПМ</p>}
        </div>
        {rec && <div className="space-y-2">
          <p className="text-xs text-slate-400">{data.targetDate} · {rec.calendar?.todayEvent?.type === 'game' ? 'День матча' : rec.calendar?.nextGame ? `Следующая игра ${rec.calendar.nextGame} · MD−${rec.calendar.daysToGame}` : 'Дата ближайшей игры не передана'}</p>
          <p className="text-sm font-semibold text-white">Предложение: {rec.label}</p>
          {rec.reasons.filter(reason=>reason!==state?.detail && reason!==rec.label).map((reason, index) => <p key={index} className="text-xs text-slate-300">{reason}</p>)}
          {rec.warnings.filter(warning => !warning.startsWith('Предварительная программа на ')).map((warning, index) => <p key={index} className="text-xs text-amber-300">{warning}</p>)}
          {rec.canApply && <button type="button" onClick={() => onApply?.(rec)} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200">Применить вариант для зала</button>}
          <p className="text-[11px] text-slate-500">Применение меняет настройки программы. Генерация и сохранение — отдельным действием тренера.</p>
        </div>}
      </section>
    );
  }

  const evening = data.evening || {};
  const postMorning = data.postMorning || {};
  const zones = evening.zones || [];
  const postMorningPainZones = (postMorning.zones || []).filter(zone => zone.type === 'pain');
  const painZones = zones.filter(zone => zone.type === 'pain');
  const sorenessZones = zones.filter(zone => zone.type === 'soreness');
  const activeInjuries = data.activeInjuries || [];
  const manualLevel = coachRecovery === 'red' ? 'red' : coachRecovery === 'yellow' ? 'yellow' : 'green';
  const finalLevel = manualLevel === 'red' || data.decision?.level === 'red'
    ? 'red'
    : manualLevel === 'yellow' || data.decision?.level === 'yellow' ? 'yellow' : 'green';
  const morningExpected = data.targetDate > data.today;
  const neuroMetrics = [
    ['RSI', data.neuro?.rsi, ''],
    ['CMJ', data.neuro?.cmj, ' см'],
    ['10 м', data.neuro?.sprint10m, ' с'],
  ].filter(([, metric]) => metric?.value != null);

  return (
    <section className="mt-4 border-t border-white/[0.07] pt-3" aria-live="polite">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield size={13} className="text-accent" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Данные для решения</span>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${tone(finalLevel)}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${indicator(finalLevel)}`} />
          {coachRecovery !== 'green' ? 'Статус тренера применён' : data.decision?.label}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${tone(evening.fresh ? 'green' : 'yellow')}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"><CheckCircle2 size={11} /> Вечерний опросник</div>
          {evening.date ? (
            <>
              <p className="mt-1 text-[12px] font-semibold">{evening.fresh ? 'Свежий ответ учтён' : 'Последний ответ не свежий'}</p>
              <p className="mt-0.5 text-[10px] opacity-70">{evening.date}{shortTime(evening.submittedAt) ? ` · ${shortTime(evening.submittedAt)}` : ''}</p>
              {(painZones.length > 0 || sorenessZones.length > 0 || evening.hasInjury) && (
                <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug opacity-90">
                  {evening.hasInjury ? `Травма: ${(evening.injuryAreas || []).join(', ') || 'указана'}` : painZones.length ? `Боль: ${painZones.map(zone => zone.area).join(', ')}` : `Крепатура: ${sorenessZones.map(zone => zone.area).join(', ')}`}
                </p>
              )}
            </>
          ) : <p className="mt-1 text-[12px] font-semibold">Нет вечернего ответа</p>}
        </div>

        <div className="min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500"><Activity size={11} /> Утро и мониторинг</div>
          {data.morning ? (
            <>
              <p className="mt-1 text-[12px] font-semibold text-slate-300">Готовность {data.morning.readiness ?? '—'}/5 · DOMS {data.morning.doms ?? '—'}/5</p>
              {!data.morning.exact && <p className="mt-0.5 text-[10px] text-amber-300/70">Последний чек-ин: {data.morning.date}</p>}
            </>
          ) : (
            <p className="mt-1 text-[12px] font-semibold text-slate-400">{morningExpected ? 'Утренний чек-ин ожидается' : 'Утреннего чек-ина нет'}</p>
          )}
          <p className="mt-0.5 text-[10px] text-slate-600">
            {data.whoop ? `WHOOP: Recovery ${data.whoop.recovery ?? '—'}% · сон ${data.whoop.sleepHours ?? '—'} ч` : morningExpected ? 'WHOOP будет добавлен утром' : 'WHOOP за дату отсутствует'}
          </p>
          <p className={`mt-1 text-[10px] ${postMorning.hasLoadConcern || postMorningPainZones.length ? 'text-rose-300' : postMorning.date ? 'text-sky-300/80' : 'text-slate-600'}`}>
            {postMorning.date
              ? `После утра учтено: ${postMorning.date}${shortTime(postMorning.submittedAt) ? ` · ${shortTime(postMorning.submittedAt)}` : ''} · sRPE ${postMorning.srpe ?? '—'} · ${postMorning.duration ?? '—'} мин`
              : 'Анкеты после утренней тренировки нет'}
          </p>
        </div>

        <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${data.restrictions?.length || activeInjuries.length || postMorning.hasLoadConcern ? tone('red') : evening.hasInjury || painZones.length || postMorningPainZones.length ? tone('yellow') : 'border-white/[0.08] bg-white/[0.02] text-slate-400'}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"><AlertTriangle size={11} /> Ограничения</div>
          <p className="mt-1 text-[12px] font-semibold">
            {activeInjuries.length ? `Активная травма: ${activeInjuries[0].bodyPart}` : postMorning.hasLoadConcern ? `Проблема после утра: ${(postMorning.discomfortAreas || []).join(', ') || 'указана'}` : evening.hasInjury ? evening.fresh ? 'Свежая травма: Recovery / Prehab' : 'Травма отмечена в старой анкете' : postMorningPainZones.length ? `Боль после утра: ${postMorningPainZones.map(zone => zone.area).join(', ')}` : data.restrictions?.length ? `${data.restrictions.length} активно` : 'Нет активных ограничений'}
          </p>
          <p className="mt-0.5 text-[10px] opacity-70">
            {neuroMetrics.length
              ? `KPI: ${neuroMetrics.map(([label, metric, unit]) => `${label} ${metric.value}${unit}${metric.date ? ` (${metric.date.slice(5)})` : ''}${metric.stale ? ' · устар.' : ''}`).join(' · ')}`
              : workspace === 'zarechie' ? 'Нейротест: данных нет' : 'Тесты CMJ/RSI/10 м не используются'}
          </p>
        </div>

        <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${tone('green')}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"><SlidersHorizontal size={11} /> {workspace === 'zarechie' ? 'Режим Заречье' : 'Режим NK Performance'}</div>
          <p className="mt-1 text-[12px] font-semibold">Ручной выбор тренера</p>
          <p className="mt-0.5 text-[10px] leading-snug opacity-70">Календарь не определяет тип сессии. Выберите метод для конкретного игрока и даты.</p>
        </div>
      </div>

      <p className="mt-2 text-[10px] leading-snug text-slate-600">{data.decision?.detail} При генерации применяется более осторожный из статуса тренера и автоматической оценки; выбранный метод тренировки сохраняется.</p>
    </section>
  );
}

function StrengthCycleDecisionEditor({cycle,workspace,playerId,apiKey,onSaved}) {
  const [entries,setEntries]=useState(cycle.decision?.entries || []);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const signature=items=>JSON.stringify(items.map(({key,exercise,progression,note,volume='normal',volumeReason=''})=>({key,exercise,progression,note,volume,volumeReason})).sort((a,b)=>a.key.localeCompare(b.key)));
  const dirty=signature(entries)!==signature(cycle.decision?.entries || []);
  const draft=useCoachEdits({storageKey:`gym:coach-single-decision:v1:${workspace}:${playerId}:${cycle.id}`,baseRevision:cycle.decision?.revision || null,value:{entries:JSON.parse(signature(entries))},dirty,onRestore:saved=>{if(!Array.isArray(saved.entries) || saved.entries.length>9)return;const restored=saved.entries.map(entry=>({...cycle.exercises.find(row=>row.key===entry.key),...entry}));if(restored.every(entry=>cycle.exercises.some(row=>row.key===entry.key)))setEntries(restored);}});
  const slots=[...new Set(cycle.exercises.map(row=>row.trainingType+':'+row.code))];
  function change(slot,patch) {
    setEntries(previous=>{
      const old=previous.find(entry=>entry.trainingType+':'+entry.code===slot);
      const row=cycle.exercises.find(row=>row.key===(patch.key || old?.key)) || cycle.exercises.find(row=>row.trainingType+':'+row.code===slot);
      return [...previous.filter(entry=>entry.trainingType+':'+entry.code!==slot),{...row,exercise:'keep',progression:'auto',note:'',volume:'normal',volumeReason:'',...old,...patch,key:row.key,name:row.name,loadUnits:row.loadUnits}];
    });
  }
  async function save() {
    if(entries.some(entry=>entry.volume==='reduce_one' && !entry.volumeReason?.trim())){setMessage('Укажите причину снижения объёма каждого выбранного движения.');return;}
    setSaving(true);setMessage('');
    try {
      const response=await fetch('/api/players/strength-cycle-review',{method:'POST',headers:{'x-api-key':apiKey,'content-type':'application/json'},body:JSON.stringify({workspace,playerId,cycleId:cycle.id,expectedRevision:cycle.decision?.revision || null,entries:entries.map(({key,exercise,progression,note,volume='normal',volumeReason=''})=>({key,exercise,progression,note,volume,volumeReason}))})});
      const result=await response.json();if(!response.ok)throw new Error(result.error || 'Не удалось сохранить решения');
      draft.clear();onSaved(result.decision);
    } catch(error){setMessage(error.message);}finally{setSaving(false);}
  }
  return <div className="coach-cycle-decision-editor rounded-xl border border-emerald-300/20 p-3">
    <p className="text-sm font-bold text-slate-200">Решения на следующий цикл</p><CoachEditsRecovery draft={draft}/>
    <p className="my-2 text-xs text-slate-500">Выберите только нужные изменения. «Удерживать» запрещает прибавку кг и повторов, но позволяет снижение по состоянию. Ограничения ReadySix и локальные адаптации сохраняются. Уже сохранённые программы не меняются. Чтобы отменить решения, выберите «Без отдельного решения» и сохраните.</p>
    {dirty?<p className="mb-2 text-xs text-amber-200">Изменения ещё не сохранены.</p>:cycle.decision && <p className="mb-2 text-xs text-emerald-300">{entries.length?'Решения сохранены. Они учитываются при новой генерации следующего цикла.':'Отдельные решения отменены. Действуют обычные правила генерации.'}</p>}
    {slots.map(slot=>{
      const rows=cycle.exercises.filter(row=>row.trainingType+':'+row.code===slot);
      const entry=entries.find(entry=>entry.trainingType+':'+entry.code===slot);
      return <div key={slot} className="mb-3 space-y-2 rounded-lg bg-white/[0.03] p-2">
        <div className="block text-xs text-slate-300">{{full_body:'Общая силовая',anterior_chain:'Передняя цепь',posterior_chain:'Задняя цепь'}[rows[0].trainingType]} · {rows[0].code}
          <PremiumSelect title={'Упражнение '+slot} disabled={saving || !!draft.recovered || draft.conflict} value={entry?.key || ''} onChange={value=>value?change(slot,{key:value}):setEntries(previous=>previous.filter(e=>e.trainingType+':'+e.code!==slot))} options={[{value:'',label:'Без отдельного решения'},...rows.map(row=>({value:row.key,label:row.name}))]} compact />
        </div>
        {entry && <>
          <PremiumSelect title={'Вариант '+slot} disabled={saving || !!draft.recovered || draft.conflict} value={entry.exercise} onChange={value=>change(slot,{exercise:value})} options={[{value:'keep',label:'Сохранить упражнение'},{value:'rotate',label:'Сменить упражнение в том же движении'}]} compact />
          <PremiumSelect title={'Прогрессия '+slot} disabled={saving || !!draft.recovered || draft.conflict} value={entry.progression} onChange={value=>change(slot,{progression:value})} options={[{value:'auto',label:'Прогрессия по фактической истории и RPE'},{value:'hold',label:'Удерживать нагрузку'}]} compact />
          <PremiumSelect title={'Объём '+slot} disabled={saving || !!draft.recovered || draft.conflict} value={entry.volume || 'normal'} onChange={value=>change(slot,{volumeReason:'',volume:value})} options={[{value:'normal',label:'Обычный объём движения'},{value:'reduce_one',label:'На один рабочий подход меньше'}]} compact />
          {entry.volume==='reduce_one' && <><p className="text-xs text-amber-200">От обычной дозы, минимум 1 подход. Снижение по состоянию не суммируется; прибавка кг и повторов отключена только здесь.</p><input aria-label={'Причина снижения '+slot} disabled={saving || !!draft.recovered || draft.conflict} maxLength={300} value={entry.volumeReason || ''} onChange={event=>change(slot,{volumeReason:event.target.value})} placeholder="Обязательная причина снижения объёма" className="w-full rounded bg-slate-900 p-2 text-xs" /></>}
          <input aria-label={'Комментарий '+slot} disabled={saving || !!draft.recovered || draft.conflict} maxLength={300} value={entry.note} onChange={event=>change(slot,{note:event.target.value})} placeholder="Причина / комментарий тренера" className="w-full rounded bg-slate-900 p-2 text-xs" />
        </>}
      </div>;
    })}
    <button type="button" disabled={saving || !dirty || !!draft.recovered || draft.conflict} onClick={save} className="rounded-lg bg-emerald-400/15 px-3 py-2 text-xs text-emerald-200">{saving?'Сохраняем…':'Сохранить решения'}</button>
    {message && <p role="alert" className="mt-2 text-xs text-rose-300">{message}</p>}
  </div>;
}

function StrengthCycleComparison({comparison}) {
  if(!comparison || comparison.status==='no_previous')return <p className="text-xs text-slate-500">Для сравнения нужен предыдущий соседний силовой цикл.</p>;
  if(comparison.status==='overlapping_cycles')return <p className="rounded-xl border border-amber-300/20 p-3 text-xs text-amber-200">Даты выполнений соседних циклов пересекаются. Проверьте принадлежность занятий к циклам; прямое сравнение пока недоступно.</p>;
  if(comparison.status==='awaiting_completion')return <p className="rounded-xl border border-white/10 p-3 text-xs text-slate-400">Сравнение появится после завершения обоих соседних циклов: предыдущий {comparison.previousCompleted}/4, выбранный {comparison.currentCompleted}/4. Незавершённый цикл не пропускается.</p>;
  const chains={full_body:'Общая силовая',anterior_chain:'Передняя цепь',posterior_chain:'Задняя цепь'};
  const statuses={comparable:'Сопоставимая силовая доза',new_variant:'Новый вариант: кг с другим упражнением не сравниваются',previous_variant:'Вариант остался в предыдущем цикле',adapted:'Локальная адаптация: прямое сравнение ограничено',missing_or_mixed_sets:'Нет полных кг/повторов или подходы различаются',units_changed:'Изменился способ подсчёта повторов',context_unknown:'Не сохранены условия нагрузки',dose_changed:'Изменилась доза или силовой режим'};
  const delta=value=>value==null?'—':`${value>0?'+':''}${value}`;
  const point=value=>!value?'—':`${value.date} · ${value.sets.map(set=>`${set.kg ?? '—'} кг × ${set.reps ?? '—'}${set.perSide?'/стор.':''}`).join('; ')} · RPE упражнения ${value.exerciseRpe ?? '—'}`;
  const contexts=({exposures,adaptedSessions})=>`Занятий с адаптацией: ${adaptedSessions}. `+exposures.map(item=>`${item.date}: партии ${item.playedSets ?? '—'}, площадка ${item.courtLoad ?? '—'}, поездки ${item.travelDates.join(', ') || 'не отмечены'}${item.missing.length?' · данные неполные':''}${item.reasons.length?' · '+item.reasons.map(reason=>reason.text).join(' '):''}`).join('; ');
  return <section className="coach-cycle-comparison rounded-xl border border-cyan-300/20 p-3">
    <h3 className="text-sm font-bold text-cyan-100">Сравнение соседних циклов</h3>
    <p className="mt-1 text-xs text-slate-400">{comparison.previousId} → {comparison.currentId}. Сопоставимых вариантов: {comparison.summary.comparable}; новых: {comparison.summary.newVariants}; с ограничениями данных: {comparison.summary.limited}.</p>
    <p className="my-2 text-xs text-slate-500">Последнее полное выполнение каждого точного варианта в цикле. Это фактическое изменение нагрузки, не оценка прироста силы. Разницу RPE показываем только при одинаковых кг, повторах и дозе.</p>
    {comparison.rows.map(row=><div key={row.key} className="coach-cycle-result mt-2 rounded-lg bg-white/[0.025] p-3 text-xs">
      <p className="font-bold text-slate-200">{chains[row.trainingType] || row.trainingType} · {row.code} · {row.name}</p>
      <p className="mt-1 text-slate-500">{statuses[row.status]} · {row.loadUnits===2?'кг одного снаряда из пары':'кг одного снаряда'}</p>
      <dl className="mt-2 grid gap-2 text-slate-300 sm:grid-cols-2"><div><dt className="text-slate-500">Предыдущий цикл</dt><dd>{point(row.before)}</dd></div><div><dt className="text-slate-500">Выбранный цикл</dt><dd>{point(row.after)}</dd></div></dl>
      {row.delta && <dl className="coach-cycle-deltas">{[['Δ веса',delta(row.delta.kg),'кг'],['Δ повторов',delta(row.delta.reps),row.after.perSide?'на сторону':'на подход'],['Δ RPE',delta(row.delta.exerciseRpe),row.effortComparable?'при той же работе':'не сопоставим']].map(([label,value,note])=><div key={label}><dt>{label}</dt><dd>{value}</dd><span>{note}</span></div>)}</dl>}
      {row.volumeReview && <div className="mt-2 rounded-lg border border-amber-300/20 p-2 text-amber-100"><p className="font-bold">Оценка снижения объёма движения</p><p>Подходы в последнем полном выполнении: {row.volumeReview.beforeSets ?? '—'} → {row.volumeReview.afterSets ?? '—'}. Выполнений этого варианта: {row.volumeReview.beforeExposures} → {row.volumeReview.afterExposures}.</p><p>{{lower_volume_observed:'Фактически выполнено меньше подходов.',variant_changed:'Вариант изменён; прямое сравнение результата ограничено.',symptom_deferred:'Приоритет у локальной адаптации; отдельное снижение отложено.',already_reduced:'Доза уже снижена по другим основаниям.',not_recorded:'Применение снижения в плане не записано.',no_confirmed_decrease:'Уменьшение относительно предыдущего выполнения не подтверждено.',changed_within_cycle:'Решение об объёме менялось внутри цикла.'}[row.volumeReview.status]}</p><p>Причина: {row.volumeReview.reason || 'см. историю решений'}.</p><p className="mt-1 text-slate-400">Кг, повторы и RPE показаны выше. При меньшем числе подходов разница RPE не доказывает улучшение переносимости или рост силы.</p></div>}
      {row.after && !row.decisions.length && <p className="mt-2 text-slate-500">Решение тренера из предыдущего цикла в выполненных планах этого варианта не записано.</p>}
      {!!row.decisions.length && <details className="mt-2"><summary className="cursor-pointer text-emerald-200">Решения тренера на момент выполнения · {row.decisions.length}</summary>{row.decisions.map((decision,index)=><p key={index} className="mt-1 text-slate-400">{decision.date}: {decision.exercise==='keep'?'сохранить':'сменить'} {decision.requestedName}; {decision.progression==='hold'?'удерживать нагрузку':'прогрессия по истории/RPE'}{decision.effect==='symptom_deferred'?' · отложено по симптомам':decision.effect==='selection_deferred'?' · сохранение варианта было недоступно':''}{decision.volume==='reduce_one'?' · меньше подходов: '+decision.volumeReason:''}{decision.note?' · '+decision.note:''}.</p>)}</details>}
    </div>)}
    <details className="mt-3 text-xs"><summary className="cursor-pointer text-slate-300">Контекст ReadySix двух циклов</summary><p className="mt-2 text-slate-500">Предыдущий: {contexts(comparison.context.before)}</p><p className="mt-2 text-slate-500">Выбранный: {contexts(comparison.context.after)}</p></details>
    <p className="mt-2 text-xs text-slate-500">Показаны решения из сохранённых выполненных планов. Поздние правки решения не переписывают историю и не доказывают причину изменения результата.</p>
  </section>;
}

function StrengthCycleReviewPanel({workspace, playerId, apiKey, date,refreshToken=0,initialOpen=false,title='Обзор силового цикла'}) {
  const [open,setOpen]=useState(initialOpen);
  const [review,setReview]=useState(null);
  const [selected,setSelected]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    if(!open || !apiKey || !playerId)return;
    let cancelled=false;const controller=new AbortController();setLoading(true);setError('');setReview(null);
    teamQueueCall(apiKey,`/api/players/strength-cycle-review?workspace=${encodeURIComponent(workspace)}&playerId=${encodeURIComponent(playerId)}&asOf=${encodeURIComponent(date || todayISO())}`,{signal:controller.signal,timeoutMs:25000})
      .then(data=>{if(!Array.isArray(data.cycles))throw new Error('Обзор получен не полностью. Повторите обновление.');return data;})
      .then(data=>{if(!cancelled){setReview(data);setSelected(previous=>data.cycles.some(c=>c.id===previous)?previous:(data.cycles.find(c=>c.status==='completed') || data.cycles[0])?.id || '');}})
      .catch(error=>{if(!cancelled)setError(error.message);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;controller.abort();};
  },[open,workspace,playerId,apiKey,date,refresh,refreshToken]);
  const cycle=review?.cycles.find(c=>c.id===selected);
  const chains={full_body:'Общая силовая',anterior_chain:'Передняя цепь',posterior_chain:'Задняя цепь'};
  const formatSet=set=>`${set.kg==null?'кг не записаны':set.kg+' кг'} × ${set.reps==null?'повторы не записаны':set.reps+(set.perSide?'/стор.':'')}`;
  return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)} className="coach-cycle-review mb-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.025] print:hidden">
    <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-300">{title}</summary>
    {open && <div className="border-t border-white/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Четыре полностью выполненных занятия. Кг, повторы и RPE показаны по факту; это не оценка 1ПМ.</p><button type="button" onClick={()=>setRefresh(value=>value+1)} disabled={loading} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Обновить обзор</button></div>
      {loading && <p role="status" className="text-xs text-slate-500">Проверяем выполнение…</p>}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {review && <>
        <p className="mb-2 text-xs text-slate-500">По состоянию на {review.asOf}. {review.legacySessions>0?'Занятия старой версии не включены в счётчик выполненных циклов.':''}</p>
        {!review.cycles.length && <p className="text-sm text-slate-400">Пока нет силового цикла новой версии. После сохранения и выполнения занятий здесь появится обзор.</p>}
        {!!review.cycles.length && <PremiumSelect value={selected} onChange={setSelected} options={review.cycles.map(c=>({value:c.id,label:`${c.startDate} · ${c.status==='completed'?'завершён':'идёт'} · ${c.completedCount}/4`}))} compact />}
        {cycle && <div className="mt-3 space-y-3">
          <div className="coach-cycle-hero"><div><p className="coach-overview-eyebrow">СИЛОВОЙ ЦИКЛ / ФАКТ</p><h3>{cycle.status==='completed'?'Цикл завершён':'Цикл продолжается'}</h3><p>{cycle.startDate}{cycle.endDate?' → '+cycle.endDate:''}</p></div><div className="coach-cycle-counter"><strong>{cycle.completedCount}<span>/ 4</span></strong><p>полных выполнения</p><div className="coach-cycle-steps" aria-label={`Выполнено ${cycle.completedCount} из 4 занятий`}>{[0,1,2,3].map(index=><span key={index} className={index<cycle.completedCount?'is-complete':''}/>)}</div></div><p className="coach-cycle-hero-caption">Сохранено планов: {cycle.plannedCount} · занятий с адаптацией: {cycle.adaptedSessions}. Полные выполнения: {cycle.completionDates.join(', ') || 'ещё нет'}.</p></div>
          <StrengthPerformance key={cycle.id} series={cyclePerformanceSeries(cycle)} scope={`Полных выполнений в выбранном цикле: ${cycle.completedCount} / 4`}/>
          <StrengthCycleComparison comparison={cycle.comparison} />
          {cycle.status==='completed' && <StrengthCycleDecisionEditor key={`${workspace}:${playerId}:${cycle.id}:${cycle.decision?.revision || 'new'}`} cycle={cycle} workspace={workspace} playerId={playerId} apiKey={apiKey} onSaved={decision=>setReview(previous=>({...previous,cycles:previous.cycles.map(item=>item.id===cycle.id?{...item,decision}:item)}))} />}
          {cycle.suggestions.map(text=><p key={text} className="text-xs text-amber-200/80">{text}</p>)}
          {!cycle.exercises.length && <p className="text-xs text-slate-500">Пока нет полных выполнений для сравнения основных упражнений.</p>}
          <details className="coach-cycle-observation-details"><summary>Все фактические подходы</summary>{cycle.exercises.map(row=><div key={row.key} className="coach-cycle-observation overflow-hidden rounded-xl border border-white/10">
            <div className="bg-white/[0.035] p-3 text-xs font-bold text-slate-300">{row.code} · {row.name}<span className="mt-1 block font-normal text-slate-500">{chains[row.trainingType] || row.trainingType} · {row.loadUnits===2?'кг одной гантели / снаряда из пары':'кг одного снаряда'} · повторы на сторону обозначены отдельно</span></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="p-2">Дата</th><th className="p-2">Выполненные подходы</th><th className="p-2">RPE упражнения</th><th className="p-2">RPE занятия</th></tr></thead><tbody>{row.observations.map(point=><tr key={point.date} className="border-t border-white/5 text-slate-300"><td className="whitespace-nowrap p-2">{point.date}{point.adapted?' · адаптация':''}</td><td className="min-w-[180px] p-2">{point.sets.filter(set=>set.completed).map(formatSet).join('; ') || 'Нет записанных подходов'}</td><td className="p-2">{point.exerciseRpe ?? '—'}</td><td className="p-2">{point.sessionRpe ?? '—'}</td></tr>)}</tbody></table></div>
          </div>)}</details>
          {!!cycle.replacements.length && <div className="rounded-xl border border-white/10 p-3"><p className="mb-2 text-xs font-bold text-slate-300">Замены тренера и причины</p>{cycle.replacements.map((event,i)=><p key={i} className="mt-1 text-xs text-slate-400">{event.date} · {event.code}: {event.from} → {event.to}. {REPLACEMENT_REASONS[event.reason] || 'Причина не задана'}{event.note?' · '+event.note:''}</p>)}</div>}
          <details className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-xs text-slate-300">Контекст ReadySix на момент планов</summary>{cycle.context.map(item=><p key={item.date} className="mt-2 text-xs text-slate-500">{item.date} · {item.source==='ReadySix' && <>Партии: {item.playedSets ?? '—'}; площадка: {item.courtLoad ?? '—'} sRPE×мин; поездки: {item.travelDates.join(', ') || 'не отмечены'}. </>}{item.source==='ReadySix'?(item.reasons.map(reason=>reason.text).join(' ') || 'Ограничивающие факторы не отмечены.'):'Контекст не сохранён.'}{item.missing.length?' Часть данных отсутствовала; прибавка нагрузки не подтверждалась.':''}</p>)}</details>
          {!!cycle.otherPlans.length && <details className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-xs text-slate-400">Остальные сохранённые планы · {cycle.otherPlans.length}</summary>{cycle.otherPlans.map(plan=><p key={plan.date} className="mt-1 text-xs text-slate-500">{plan.date}{plan.finishReason?' · завершена раньше: '+plan.finishReason:' · не входит в четыре полных выполнения'}</p>)}</details>}
        </div>}
      </>}
    </div>}
  </details>;
}

function DevelopmentPlanPanel({ plan, onChange, onSave, saving, saved }) {
  const goals = Array.isArray(plan?.goals) ? plan.goals : [];
  const cycleStart = plan?.cycleStart || todayISO();
  const reviewDate = addDaysToStr(cycleStart, 28);
  const reviewDue = todayISO() >= reviewDate;
  const metricOptions = [
    { value: 'manual', label: 'Ручная оценка' },
    { value: 'rsi', label: 'RSI' },
    { value: 'cmj', label: 'CMJ, см' },
    { value: 'sprint10m', label: '10 м, сек' },
  ];
  const reviewLabels = {
    achieved: 'цель достигнута', improved_not_target: 'есть значимый прогресс',
    within_noise: 'изменение в пределах погрешности', regressed: 'результат снизился',
    insufficient_data: 'недостаточно данных', manual_review: 'нужно решение тренера', in_progress: 'цикл продолжается',
  };

  function updateGoal(index, patch) {
    onChange({
      ...plan,
      goals: goals.map((goal, goalIndex) => goalIndex === index ? { ...goal, ...patch } : goal),
    });
  }

  function addGoal() {
    if (goals.length >= 3) return;
    onChange({
      ...plan,
      goals: [...goals, { id: `goal-${Date.now()}`, title: '', criterion: '', metric: 'manual', baselineValue: null, targetValue: null }],
    });
  }

  return (
    <details className="mb-4 rounded-2xl border border-accent/15 bg-accent/[0.035] print:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
        <Target size={12} className="text-accent" />
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">План развития</span>
        <span className={`ml-auto text-[10px] font-semibold ${reviewDue ? 'text-amber-400' : 'text-slate-600'}`}>
          {reviewDue ? 'нужен пересмотр' : `${goals.filter(goal => goal.title?.trim()).length}/3 цели · 4 недели`}
        </span>
      </summary>
      <div className="border-t border-white/[0.05] px-4 pb-4 pt-3">
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-600">Начало цикла</div>
            <DatePicker
              value={cycleStart}
              onChange={value => onChange({ ...plan, cycleStart: value, reviewDate: addDaysToStr(value, 28) })}
              size="sm"
            />
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/15 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-600">Пересмотр</div>
            <div className="mt-1 text-[12px] font-bold text-slate-300">{reviewDate}</div>
            <div className="text-[9px] text-slate-600">автоматически через 28 дней</div>
          </div>
        </div>

        <div className="space-y-2">
          {goals.map((goal, index) => (
            <div key={goal.id || index} className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-md bg-accent/15 text-[10px] font-black text-accent">{index + 1}</span>
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">Цель развития</span>
                <button
                  type="button"
                  onClick={() => onChange({ ...plan, goals: goals.filter((_, goalIndex) => goalIndex !== index) })}
                  className="ml-auto text-slate-700 transition hover:text-rose-400"
                  aria-label="Удалить цель"
                ><X size={13} /></button>
              </div>
              <input
                value={goal.title || ''}
                onChange={event => updateGoal(index, { title: event.target.value })}
                maxLength={120}
                placeholder="Например: увеличить силу задней цепи"
                className="w-full rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[12px] text-slate-200 outline-none placeholder:text-slate-700 focus:border-accent/30"
              />
              <div className="mt-2">
                <div className="mb-1 text-[10px] text-slate-500">Подтверждённый приоритет силовой</div>
                <PremiumSelect
                  value={goal.strengthPriority || ''}
                  onChange={strengthPriority => updateGoal(index, { strengthPriority: strengthPriority || null })}
                  options={[
                    { value: '', label: 'Без отдельного силового приоритета' },
                    { value: 'posterior', label: 'Задняя цепь' },
                    { value: 'unilateral', label: 'Односторонняя сила ног' },
                    { value: 'adductor', label: 'Приводящие' },
                    { value: 'calf', label: 'Икроножные' },
                    { value: 'shoulder', label: 'Плечо / лопатка' },
                    { value: 'core', label: 'Кор' },
                  ]}
                  compact
                />
                <div className="mt-1 text-[10px] text-slate-600">Первые два приоритета направляют дополнительные задачи без лишних подходов. Боль и ограничения учитываются отдельно в ReadySix.</div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <PremiumSelect
                  value={goal.metric || 'manual'}
                  onChange={nextValue => updateGoal(index, { metric: nextValue, baselineValue: null, baselineDate: null, targetValue: null })}
                  options={metricOptions}
                  className="rounded-lg border border-white/[0.07] bg-[#101a1d] px-3 py-2 text-[11px] text-slate-300 outline-none focus:border-accent/30"
                  compact
                />
                {goal.metric && goal.metric !== 'manual' ? (
                  <input
                    type="number"
                    step="0.01"
                    value={goal.targetValue ?? ''}
                    onChange={event => updateGoal(index, { targetValue: event.target.value })}
                    placeholder="Целевое значение"
                    className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-slate-300 outline-none placeholder:text-slate-700 focus:border-accent/30"
                  />
                ) : <div className="rounded-lg border border-white/[0.05] px-3 py-2 text-[10px] text-slate-700">оценит тренер</div>}
              </div>
              {goal.metric && goal.metric !== 'manual' && goal.baselineValue != null && (
                <div className="mt-2 rounded-lg border border-accent/10 bg-accent/[0.03] px-3 py-2 text-[10px] text-slate-500">
                  Baseline: <span className="font-bold text-slate-300">{goal.baselineValue}{goal.unit || ''}</span>
                  {goal.currentValue != null && <> · Сейчас: <span className="font-bold text-slate-300">{goal.currentValue}{goal.unit || ''}</span></>}
                  {goal.performanceDeltaPercent != null && <> · Результативность: <span className={goal.performanceDeltaPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{goal.performanceDeltaPercent > 0 ? '+' : ''}{goal.performanceDeltaPercent}%</span></>}
                  <div className="mt-0.5">{reviewLabels[goal.reviewStatus] || goal.reviewStatus}</div>
                </div>
              )}
              <input
                value={goal.criterion || ''}
                onChange={event => updateGoal(index, { criterion: event.target.value })}
                maxLength={200}
                placeholder="Критерий: что должно измениться за 4 недели"
                className="mt-2 w-full rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-slate-300 outline-none placeholder:text-slate-700 focus:border-accent/30"
              />
            </div>
          ))}
        </div>

        {plan?.review && (
          <div className={`mt-3 rounded-xl border px-3 py-2.5 ${plan.review.due ? 'border-amber-500/20 bg-amber-500/[0.04]' : 'border-white/[0.06] bg-black/10'}`}>
            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-600">Контроль цикла</div>
            <div className="mt-1 text-[11px] text-slate-400">
              Выполнено {plan.review.actualSessions}/{plan.review.plannedSessions} тренировок
              {plan.review.adherencePercent != null ? ` · приверженность ${plan.review.adherencePercent}%` : ''}
              {plan.review.measurableGoals ? ` · достигнуто ${plan.review.achievedGoals}/${plan.review.measurableGoals} измеримых целей` : ''}
            </div>
            {plan.review.due && <div className="mt-1 text-[10px] font-semibold text-amber-400">Цикл завершён: подтвердите продолжение, смену дозы/метода или новую цель.</div>}
            {plan.review.due && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <PremiumSelect
                  value={plan.reviewDecision || 'pending'}
                  onChange={nextValue => onChange({ ...plan, reviewDecision: nextValue })}
                  options={[
                    { value: 'pending', label: 'Решение не принято' },
                    { value: 'continue', label: 'Продолжить метод' },
                    { value: 'adjust', label: 'Изменить дозу или метод' },
                    { value: 'complete', label: 'Закрыть цель' },
                  ]}
                  className="rounded-lg border border-white/[0.08] bg-[#101a1d] px-3 py-2 text-[11px] text-slate-300 outline-none focus:border-accent/30"
                  compact
                />
                <input
                  value={plan.reviewNote || ''}
                  onChange={event => onChange({ ...plan, reviewNote: event.target.value })}
                  maxLength={300}
                  placeholder="Решение и причина"
                  className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[11px] text-slate-300 outline-none placeholder:text-slate-700 focus:border-accent/30"
                />
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {goals.length < 3 && (
            <button type="button" onClick={addGoal} className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-3 py-2 text-[11px] font-semibold text-slate-500 transition hover:text-slate-300">
              <Plus size={12} /> Добавить цель
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-[11px] font-black text-[#07101a] transition disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saved ? 'Сохранено' : 'Сохранить план'}
          </button>
        </div>
      </div>
    </details>
  );
}

function ReturnToPlayModal({ player, plan, saving, onChange, onSave, onClose }) {
  if (!player) return null;
  const normalized = normalizeReturnToPlay(plan || {}, todayISO());
  const current = { ...normalized, criteria: Array.isArray(plan?.criteria) ? plan.criteria : normalized.criteria };
  const update = patch => onChange({ ...current, ...patch });
  const addCriterion = () => update({ criteria: [...(current.criteria || []), { id: `criterion-${Date.now()}`, label: '', complete: false }] });
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#02060b]/85 px-4 py-6 backdrop-blur-xl" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-[30px] border border-white/[0.11] bg-gradient-to-br from-[#111d22] via-[#09131c] to-[#151326] p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300/70">Return-to-Play</div><h3 className="mt-1 text-xl font-black text-white">{player.name}</h3><p className="mt-1 text-[11px] text-slate-500">Этапный возврат с ограничителями объёма, интенсивности и RPE.</p></div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] text-slate-500 transition hover:text-white"><X size={15} /></button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Статус
            <PremiumSelect value={current.status} onChange={value => update({ status: value })} options={[{ value: 'inactive', label: 'Не активен' }, { value: 'active', label: 'Активен' }, { value: 'paused', label: 'Приостановлен' }, { value: 'cleared', label: 'Допущен' }]} className="mt-1.5 min-h-11 w-full rounded-xl border border-white/[0.08] bg-[#101a1d] px-3 text-[12px] normal-case text-slate-200 outline-none" compact />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Название кейса
            <input value={current.title} onChange={event => update({ title: event.target.value })} maxLength={120} placeholder="Например: правый голеностоп" className="mt-1.5 min-h-11 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-[12px] normal-case text-white outline-none placeholder:text-slate-700" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Зона
            <input value={current.bodyPart} onChange={event => update({ bodyPart: event.target.value })} maxLength={80} placeholder="Колено, плечо…" className="mt-1.5 min-h-11 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-[12px] normal-case text-white outline-none placeholder:text-slate-700" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Следующий контроль
            <input type="date" value={current.nextReviewDate || ''} onChange={event => update({ nextReviewDate: event.target.value || null })} className="mt-1.5 min-h-11 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-[12px] normal-case text-white outline-none" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Диагноз / причина
            <input value={current.diagnosis} onChange={event => update({ diagnosis: event.target.value })} maxLength={180} placeholder="Рабочая формулировка" className="mt-1.5 min-h-11 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-[12px] normal-case text-white outline-none placeholder:text-slate-700" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Ответственный
            <input value={current.owner} onChange={event => update({ owner: event.target.value })} maxLength={100} placeholder="Врач / физиотерапевт" className="mt-1.5 min-h-11 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-[12px] normal-case text-white outline-none placeholder:text-slate-700" />
          </label>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">Фаза возврата</span><span className="text-[10px] font-bold text-violet-200">Боль {current.painScore}/10</span></div>
          <div className="grid grid-cols-5 gap-1.5">{RTP_PHASES.map(phase => <button key={phase.id} type="button" onClick={() => update({ currentPhase: phase.id })} className={`min-h-14 rounded-xl border px-1.5 py-2 text-center ${current.currentPhase === phase.id ? 'border-violet-300/35 bg-violet-300/[0.14] text-violet-100' : 'border-white/[0.06] bg-white/[0.02] text-slate-600'}`}><div className="text-[11px] font-black">{phase.id}</div><div className="mt-0.5 hidden text-[8px] font-bold sm:block">{phase.label}</div></button>)}</div>
          <input type="range" min="0" max="10" step="1" value={current.painScore} onChange={event => update({ painScore: Number(event.target.value) })} className="mt-4 w-full accent-violet-300" aria-label="Уровень боли" />
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/15 p-4">
          <div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">Критерии перехода</div><div className="mt-1 text-[10px] text-slate-700">Отметьте объективные критерии текущей фазы.</div></div><button type="button" onClick={addCriterion} className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] font-bold text-slate-400">+ Критерий</button></div>
          <div className="mt-3 space-y-2">{(current.criteria || []).map((criterion, index) => <div key={criterion.id} className="flex items-center gap-2"><button type="button" onClick={() => update({ criteria: current.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, complete: !item.complete } : item) })} className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${criterion.complete ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border-white/[0.07] text-slate-700'}`}>{criterion.complete ? <Check size={13} /> : <Square size={13} />}</button><input value={criterion.label} onChange={event => update({ criteria: current.criteria.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} maxLength={160} placeholder="Например: прыжки без боли на следующий день" className="min-h-9 flex-1 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 text-[11px] text-white outline-none placeholder:text-slate-700" /><button type="button" onClick={() => update({ criteria: current.criteria.filter((_, itemIndex) => itemIndex !== index) })} className="grid h-9 w-9 place-items-center text-slate-700 hover:text-rose-300"><X size={12} /></button></div>)}</div>
        </div>

        <textarea value={current.notes} onChange={event => update({ notes: event.target.value })} maxLength={600} placeholder="Ограничения, наблюдения, условия допуска" className="mt-4 min-h-[88px] w-full resize-none rounded-xl border border-white/[0.08] bg-black/20 p-3 text-[12px] text-white outline-none placeholder:text-slate-700" />
        <button type="button" onClick={onSave} disabled={saving} className="mt-4 min-h-12 w-full rounded-2xl bg-gradient-to-r from-violet-300 via-cyan-300 to-emerald-300 text-[12px] font-black text-[#071018] disabled:opacity-50">{saving ? 'Сохраняю…' : 'Сохранить Return-to-Play'}</button>
      </div>
    </div>
  );
}

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [authChecking, setAuthChecking] = useState(true);
  const [loginSecret, setLoginSecret] = useState('');
  const [loginError, setLoginError] = useState('');
  const [reauthNotice, setReauthNotice] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const pendingAuthRetryRef = useRef(null);
  const [players, setPlayers] = useState([]);
  const [playersError, setPlayersError] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [date, setDate] = useState(todayISO());
  useEffect(()=>{setDate(calendarToday());},[]);
  const dateDrafts = useRef(new Map());
  const draftOpenRequest = useRef(0),activeTeamDraftRef=useRef(null),draftOpenController=useRef(null),teamDraftEdits=useRef(new Map());
  const [teamDraftOpening,setTeamDraftOpening]=useState(false),[teamModalOpen,setTeamModalOpen]=useState(false),[savedTeamBatches,setSavedTeamBatches]=useState(new Set()),[teamPendingEdits,setTeamPendingEdits]=useState(0);
  function changeTrainingDate(nextDate) {
    if (nextDate === date || loading || batchId || saving || (batchRunning && mainSection!=='team') || weekPlanLoading) return;
    rememberTeamDraft();activeTeamDraftRef.current=null;draftOpenController.current?.abort();
    draftOpenRequest.current++;
    const key = value => `${workspace}:${playerId}:${value}`;
    dateDrafts.current.set(key(date), { session, meta, justSaved, autoSaved, dayGoal, notes, sessionType, period, focus, trainingType, powerMode, strengthMode });
    const draft = dateDrafts.current.get(key(nextDate));
    setSession(draft?.session || null); setMeta(draft?.meta || null);
    setJustSaved(draft?.justSaved || false); setAutoSaved(draft?.autoSaved || false);
    setDayGoal(draft?.dayGoal || ''); setNotes(draft?.notes || '');
    if (draft) {
      setSessionType(draft.sessionType); setPeriod(draft.period); setFocus(draft.focus);
      setTrainingType(draft.trainingType); setPowerMode(draft.powerMode); setStrengthMode(draft.strengthMode);
    }
    setWeekPlan(null); setPendingSaved(null); setTodayWarmup(null); setError(''); setShowSummary(false);
    setDate(nextDate);
  }
  const [dayGoal, setDayGoal] = useState('');
  const [days, setDays] = useState(7);
  const [period, setPeriod] = useState('inseason');
  const [focus, setFocus] = useState('inseason_strength');
  const [trainingType, setTrainingType] = useState('full_body');
  const [powerMode, setPowerMode] = useState('development');
  const [strengthMode, setStrengthMode] = useState('maintenance');
  const [notes, setNotes] = useState('');
  const [sessionType, setSessionType] = useState('gym'); // 'gym' | 'warmup'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [genProgress, setGenProgress] = useState(0);
  const [genStage, setGenStage] = useState('');
  const genTimers = useRef([]);

  // Main section navigation
  const [mainSection, setMainSection] = useState('workouts');

  // Left panel tabs
  const [leftTab, setLeftTab] = useState('players'); // 'players' | 'day'
  const [teamStatus, setTeamStatus] = useState({});
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [accessAction, setAccessAction] = useState('');
  const [accessConfirm, setAccessConfirm] = useState('');
  const [liveCommandPlayer, setLiveCommandPlayer] = useState(null);
  const [liveCommandType, setLiveCommandType] = useState('message');
  const [liveCommandText, setLiveCommandText] = useState('');
  const [liveReplacement, setLiveReplacement] = useState('');
  const [liveCommandSending, setLiveCommandSending] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [latestSnapshot, setLatestSnapshot] = useState(null);
  const [recoveryDrillLoading, setRecoveryDrillLoading] = useState(false);
  const [latestRecoveryDrill, setLatestRecoveryDrill] = useState(null);
  const [matchLoads, setMatchLoads] = useState({});
  const [matchLoadSaving, setMatchLoadSaving] = useState(false);

  // Warmup
  const [warmupDate, setWarmupDate] = useState(todayISO());
  const [warmupPlan, setWarmupPlan] = useState(null);
  const [warmupLoading, setWarmupLoading] = useState(false);
  const [warmupError, setWarmupError] = useState('');
  const [warmupHistory, setWarmupHistory] = useState([]);
  const [teamStatusLoading, setTeamStatusLoading] = useState(false);
  const [rtpPlayer, setRtpPlayer] = useState(null);
  const [rtpDraft, setRtpDraft] = useState(null);
  const [rtpSaving, setRtpSaving] = useState(false);
  const [adaptationDraft, setAdaptationDraft] = useState(null);
  const [adaptationSaving, setAdaptationSaving] = useState(false);
  const [versionPlayer, setVersionPlayer] = useState(null);
  const [sessionVersions, setSessionVersions] = useState([]);
  const [versionLoading, setVersionLoading] = useState(false);

  // Batch generation
  const [batchId, setBatchId] = useState(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState(new Set());

  const [showSummary, setShowSummary] = useState(false);

  const [scheduleEvents, setScheduleEvents] = useState([]);
  const [showSchedule, setShowSchedule] = useState(false);

  const [session, setSession] = useState(null);
  const [removedBlock, setRemovedBlock] = useState(null);
  useEffect(() => {
    if (removedBlock && session !== removedBlock.after) setRemovedBlock(null);
  }, [session, removedBlock]);
  const [meta, setMeta] = useState(null);
  const [pendingSaved, setPendingSaved] = useState(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [playerExecution,setPlayerExecution]=useState(null);

  const [compliance, setCompliance] = useState(null); // null | { percent, actualTonnage, plannedTonnage }
  const [savingActual, setSavingActual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progressionError,setProgressionError] = useState('');
  const [progressionLoading,setProgressionLoading] = useState(false);
  const [progressionRefresh,setProgressionRefresh] = useState(0);
  const [editorActionsOpen,setEditorActionsOpen] = useState(false);
  const [editorPreview,setEditorPreview] = useState(false);
  const [editorCompact,setEditorCompact]=useState(true),[compactSelected,setCompactSelected]=useState({bi:0,ei:0}),[exerciseUndo,setExerciseUndo]=useState({});
  const [progressionMap, setProgressionMap] = useState({}); // exerciseName → { kg, rpe, suggestedKg }
  const [tonnageData, setTonnageData] = useState(null);
  const [tonnageLoading, setTonnageLoading] = useState(false);
  const [tonnageRefresh,setTonnageRefresh]=useState(0),[tonnageUpdatedAt,setTonnageUpdatedAt]=useState(null);
  const [todaySnapshot,setTodaySnapshot]=useState(null);
  const [loadFilters,setLoadFilters]=useState({});
  const [todayError,setTodayError]=useState(''),[todayUpdatedAt,setTodayUpdatedAt]=useState(null);
  const [calendarError,setCalendarError]=useState(''),[calendarUpdatedAt,setCalendarUpdatedAt]=useState(null);
  const overviewWorkspaceRef=useRef(null),todayControllerRef=useRef(null),overviewSectionRef=useRef(null),teamStatusRequestRef=useRef(0),overviewScrollTargetRef=useRef(null);
  const [teamStatusError,setTeamStatusError]=useState('');
  overviewSectionRef.current=mainSection;
  const [justSaved, setJustSaved] = useState(false);
  // True after an async gym generation completes with autoSave enabled.
  const [autoSaved, setAutoSaved] = useState(false);
  const [resuming, setResuming] = useState(false);

  // Sidebar navigation
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [mobileView, setMobileView] = useState('players'); // 'players' | 'workspace'

  // Share link — stores the playerId whose link was just copied
  const [linkCopied, setLinkCopied] = useState(null);

  // Player feedbacks: { [playerId]: { rpe, feel, date } }
  const [playerFeedbacks, setPlayerFeedbacks] = useState({});

  // Position filter for player list
  const [positionFilter, setPositionFilter] = useState('all');

  // Copy program to another player
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyWorkspace, setCopyWorkspace] = useState('nkperf');
  const [copyDate, setCopyDate] = useState('');
  const [copyPlayers, setCopyPlayers] = useState([]);
  const [copyError, setCopyError] = useState('');
  const [copyKeepExact, setCopyKeepExact] = useState(false);
  const [copyPlayersLoading, setCopyPlayersLoading] = useState(false);
  useEffect(() => {
    if (!copyModalOpen || !apiKey) return;
    let cancelled = false;
    setCopyPlayersLoading(true); setCopyPlayers([]); setCopyError('');
    fetch(`/api/players/list?workspace=${copyWorkspace}`, {headers:{'x-api-key':apiKey}})
      .then(async response => {const data=await response.json(); if(!response.ok)throw new Error(data.error || 'Не удалось загрузить игроков'); return data;})
      .then(data => {if(!cancelled)setCopyPlayers(data.players || []);})
      .catch(error => {if(!cancelled)setCopyError(error.message);})
      .finally(() => {if(!cancelled)setCopyPlayersLoading(false);});
  return () => {cancelled=true;};
  }, [copyModalOpen,copyWorkspace,apiKey]);
  const [copyDone, setCopyDone] = useState(null);

  // Player photo editing
  const [editPhotoFor, setEditPhotoFor] = useState(null);
  const [photoInput, setPhotoInput] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoFileRef = useRef(null);

  // Per-exercise weight history (for sparklines)
  const [exHistoryMap, setExHistoryMap] = useState({});

  // 1RM database
  const [oneRM, setOneRM] = useState({});
  const [rmHistory, setRmHistory] = useState([]);
  const [oneRMPanelOpen, setOneRMPanelOpen] = useState(false);
  // Load + neuro trends panel (Feature 2)
  const [trendsOpen, setTrendsOpen] = useState(false);
  const [trendsData, setTrendsData] = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [lsiValue, setLsiValue] = useState('');
  // Player recovery status (simplified manual proxy for external dashboard)
  const [recoveryStatus, setRecoveryStatus] = useState('green'); // 'green' | 'yellow' | 'red'
  // Microcycle templates
  const [templates, setTemplates] = useState([]);
  // Player contraindications
  const [restrictions, setRestrictions] = useState([]);
  // Four-week individual development plan (maximum three measurable goals).
  const [developmentPlan, setDevelopmentPlan] = useState(() => emptyDevelopmentPlan());
  const [developmentPlanSaving, setDevelopmentPlanSaving] = useState(false);
  const [developmentPlanSaved, setDevelopmentPlanSaved] = useState(false);
  // Read-only pre-generation snapshot: the same signals that drive the AI prompt.
  const [decisionData, setDecisionData] = useState(null);
  const [decisionDataLoading, setDecisionDataLoading] = useState(false);
  const [oneRMSaveTimer, setOneRMSaveTimer] = useState(null);

  // Warmup → Gym integration
  const [todayWarmup, setTodayWarmup] = useState(null);

  // Weekly plan
  const [weekPlan, setWeekPlan] = useState(null);
  const [weekPlanLoading, setWeekPlanLoading] = useState(false);
  const [weekPlanOpen, setWeekPlanOpen] = useState([0]);

  // Player history workspace
  const [historyFactTarget,setHistoryFactTarget]=useState(null);
  const [workspaceTab, setWorkspaceTab] = useState('program'); // 'program' | 'history'
  const [factsRefresh,setFactsRefresh]=useState(0);

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem('kps-sidebar-collapsed') === '1');
  }, []);

  // Keep long-running coaching sessions valid and re-check immediately when a
  // suspended Safari tab becomes active again. Network failures do not sign the
  // coach out; only an authoritative 401 requests re-authentication.
  useEffect(() => {
    if (apiKey !== 'session') return undefined;
    let cancelled = false;
    const renew = async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!cancelled && response.status === 401) {
          requestReauthentication(null, 'Сессия истекла. Войдите снова — текущая программа останется на экране.');
        }
      } catch (_) {}
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') renew(); };
    const timer = setInterval(renew, SESSION_HEARTBEAT_MS);
    window.addEventListener('focus', renew);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', renew);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  function toggleDesktopSidebar() {
    setSidebarCollapsed(current => {
      const next = !current;
      window.localStorage.setItem('kps-sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  }

  // Block collapse in session view
  const [collapsedBlocks, setCollapsedBlocks] = useState(new Set());
  function toggleBlock(label) {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  // Player search in sidebar
  const [playerSearch, setPlayerSearch] = useState('');

  // Quick-add exercise to a block
  const [addExBlock, setAddExBlock] = useState(null); // null | blockIndex
  const [addExQuery, setAddExQuery] = useState('');
  function addExerciseToBlock(bi, name) {
    if (!name.trim()) return;
    setSession(prev => {
      if (!prev) return prev;
      const blocks = (prev.blocks || []).map((b, i) => {
        if (i !== bi) return b;
        return {
          ...b,
          exercises: [
            ...(b.exercises || []),
            { name: name.trim(), code: '', targetSets: ['8', '8', '8'], weightNote: '', weightKg: null, loadUnits: 1, tempo: '', autoReg: '', cue: '' },
          ],
        };
      });
      return { ...prev, blocks };
    });
    setAddExBlock(null);
    setAddExQuery('');
  }

  // Workspace: 'zarechie' | 'nkperf'
  const [workspace, setWorkspace] = useState('zarechie');
  overviewWorkspaceRef.current=workspace;
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      if(overviewScrollTargetRef.current==='drafts' && mainSection==='workouts'){overviewScrollTargetRef.current=null;document.getElementById('coach-team-drafts')?.scrollIntoView({block:'start'});}
      else if(!(overviewScrollTargetRef.current?.type==='restore' && overviewScrollTargetRef.current.section===mainSection)){document.querySelector('.workspace-main')?.scrollTo({top:0});window.scrollTo({top:0});}
    });return()=>cancelAnimationFrame(frame);
  },[mainSection,workspace]);
  useEffect(()=>setEditorActionsOpen(false),[workspace,playerId,date]);
  useEffect(()=>{const refresh=event=>{if(event.detail?.workspace!==workspace)return;setFactsRefresh(value=>value+1);setTrendsData(null);setProgressionMap({});};window.addEventListener('gym-strength-facts-updated',refresh);window.addEventListener('gym-strength-inventory-updated',refresh);return()=>{window.removeEventListener('gym-strength-facts-updated',refresh);window.removeEventListener('gym-strength-inventory-updated',refresh);};},[workspace]);
  useEffect(()=>{if(!apiKey || !playerId || !date){setPlayerExecution(null);return;}let cancelled=false,busy=false;const controller=new AbortController();setPlayerExecution(null);const read=async()=>{if(busy || document.hidden)return;busy=true;try{const result=await teamQueueCall(apiKey,'/api/players/execution?'+new URLSearchParams({workspace,playerId:String(playerId),date}),{signal:controller.signal,timeoutMs:15000});if(!cancelled)setPlayerExecution(result.execution);}catch{if(!cancelled)setPlayerExecution(null);}finally{busy=false;}};void read();const timer=setInterval(read,30000);window.addEventListener('focus',read);return()=>{cancelled=true;controller.abort();clearInterval(timer);window.removeEventListener('focus',read);};},[workspace,playerId,date,apiKey,factsRefresh]);
  const teamQueue=useTeamGenerationQueue({workspace,date,apiKey});
  const batchResults=teamQueue.results.map(row=>savedTeamBatches.has(row.batchId)?{...row,saved:true,draft:false}:row),batchRunning=teamQueue.running;
  useEffect(()=>{const context=activeTeamDraftRef.current;if(context && meta?.teamDraft && session && pendingSaved?.session)teamDraftEdits.current.set(teamDraftIdentity(context),{session,meta,pendingSaved,workspace,batchId:context.batchId,dirty:JSON.stringify(session)!==JSON.stringify(pendingSaved.session)});if(context && session && pendingSaved?.session && JSON.stringify(session)!==JSON.stringify(pendingSaved.session))setJustSaved(false);setTeamPendingEdits([...teamDraftEdits.current.values()].filter(edit=>edit.workspace===workspace && edit.meta?.teamDraft?.queueId===teamQueue.queue?.id && edit.dirty && !savedTeamBatches.has(edit.batchId)).length);},[session,meta,pendingSaved,workspace,savedTeamBatches,teamQueue.queue?.id]);
  const [playerClockNow,setPlayerClockNow] = useState(null);
  useEffect(()=>{const tick=()=>setPlayerClockNow(new Date());tick();const timer=setInterval(tick,30000);return()=>clearInterval(timer);},[]);
  const activePlayerTimeZone = workspace==='nkperf'?playerTimeZone(selectedPlayer?.timeZone):'Europe/Moscow';
  const playerToday = playerLocalDate(activePlayerTimeZone,playerClockNow || new Date());
  function changePlayerTimeZone(timeZone){
    if(currentSaveViewRef.current.workspace!=='nkperf'||currentSaveViewRef.current.playerId!==playerId)return;
    setPlayers(list=>list.map(p=>p.id===playerId?{...p,timeZone}:p));
    setSelectedPlayer(p=>p?.id===playerId?{...p,timeZone}:p);
    if(!currentSaveViewRef.current.session)setDate(playerLocalDate(timeZone));
  }
  const programSaveLockRef = useRef(false);
  const currentSaveViewRef = useRef(null);
  currentSaveViewRef.current = {workspace,playerId,date,session};
  const plannedIssues=plannedInputIssues(session);
  useEffect(()=>{setExerciseUndo({});setCompactSelected({bi:0,ei:0});},[workspace,playerId,date]);
  const executionConfirmed=playerExecution?.completed && playerExecution.date===date && playerExecution.savedAt===pendingSaved?.savedAt && !pendingSaved?.draft;
  useEffect(()=>{if(executionConfirmed){setEditorPreview(true);setRescheduleOpen(false);}},[executionConfirmed]);
  const openingDayRef=useRef(calendarToday());
  useEffect(()=>{const wake=()=>{if(document.hidden)return;const today=calendarToday();if(today===openingDayRef.current)return;openingDayRef.current=today;const view=currentSaveViewRef.current;if(!view?.playerId && !view?.session)setDate(today);};window.addEventListener('pageshow',wake);document.addEventListener('visibilitychange',wake);return()=>{window.removeEventListener('pageshow',wake);document.removeEventListener('visibilitychange',wake);};},[]);
  const matchDayManualReview = isManualMatchDayFocus(focus);
  const [nkSyncing, setNkSyncing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('workspace');
    if (saved === 'nkperf') setWorkspace('nkperf');
  }, []);

  // Team readiness (Feature 1)
  const [readinessDate, setReadinessDate] = useState(() => todayISO());
  const [readinessData, setReadinessData] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  // Team calendar
  const [calWeekStart, setCalWeekStart] = useState(() => getMondayOf(todayISO()));
  const [calData, setCalData] = useState(null);
  const [calLoading, setCalLoading] = useState(false);
  const calendarRequestRef = useRef(0);
  const [weekFilters,setWeekFilters] = useState({});
  const weekConflictsOnly=!!weekFilters[workspace],setWeekConflictsOnly=value=>setWeekFilters(previous=>({...previous,[workspace]:typeof value==='function'?value(!!previous[workspace]):value}));
  const loadFilter=loadFilters[workspace] || 'all',setLoadFilter=value=>setLoadFilters(previous=>({...previous,[workspace]:value}));
  const [liveAttentionOnly,setLiveAttentionOnly] = useState(false);
  const [weekBatchSelected, setWeekBatchSelected] = useState(new Set());
  const [weekBatchDraft, setWeekBatchDraft] = useState(null);
  const [weekBatchSaving, setWeekBatchSaving] = useState(false);
  const [weekRollbackBatch, setWeekRollbackBatch] = useState(null);

  // Monthly planner
  const [plannerMonth, setPlannerMonth] = useState(() => todayISO().slice(0, 7));
  const [monthSchedule, setMonthSchedule] = useState(null); // array of day objects
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerEditDate, setPlannerEditDate] = useState(null); // date string of open popup

  // Tonnage section sub-tab
  const [tonnageTab, setTonnageTab] = useState('tonnage'); // 'tonnage' | 'status'

  // Volume stats
  const [volumeStats, setVolumeStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    localStorage.removeItem('coachApiKey');
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(response => {
        if (!cancelled) setApiKey(response.ok ? 'session' : '');
      })
      .catch(() => {
        if (!cancelled) setApiKey('');
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Resume a pending async gym generation after a tab reload. Only resumes when the saved
  // batch matches the currently selected player + date, so we don't clobber other state.
  const resumeAttempted = useRef(false);
  useEffect(() => {
    if (resumeAttempted.current || !apiKey || !playerId || !date) return;
    let pending;
    try { pending = JSON.parse(localStorage.getItem('pending_batch') || 'null'); } catch (_) { pending = null; }
    if (!pending?.batchId) return;
    if (pending.playerId !== playerId || pending.date !== date) return;

    resumeAttempted.current = true;
    setResuming(true);
    setLoading(true);
    setBatchId(pending.batchId);
    setSessionType('gym');
    setError('');
    startGenProgress(true);
    pollBatchResult(pending.batchId, pending.focusLabel || getFocusLabel(period, focus))
      .catch(err => { setError(err.message); stopGenProgress(false); })
      .finally(() => { setBatchId(null); setLoading(false); setResuming(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, playerId, date, workspace]);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    if (!usesSeasonCalendar(workspace)) {
      setScheduleEvents([]);
      setShowSchedule(false);
      return () => { cancelled = true; };
    }
    fetch(`/api/schedule?workspace=${workspace}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => {
        if (!cancelled && Array.isArray(data.events)) setScheduleEvents(data.events);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [apiKey, workspace]);

  function switchWorkspace(ws) {
    rememberTeamDraft();setTeamModalOpen(false);activeTeamDraftRef.current=null;draftOpenController.current?.abort();draftOpenRequest.current++;setTeamDraftOpening(false);
    setHistoryFactTarget(null);setSelectedPlayer(null);setDate(calendarToday());
    setWorkspaceTab('program');
    overviewWorkspaceRef.current=ws;todayControllerRef.current?.abort();calendarRequestRef.current++;
    teamStatusRequestRef.current++;setTeamStatusError('');setTeamStatus({});setReadinessData(null);setCalData(null);setTonnageData(null);setLiveUpdatedAt(null);
    setTodaySnapshot(null);setLoadFilter('all');setLiveDebrief(false);setOverviewReturn(null);setTodayError('');setTodayUpdatedAt(null);setCalendarError('');setCalendarUpdatedAt(null);setTonnageUpdatedAt(null);
    setWorkspace(ws);
    if (!usesSeasonCalendar(ws) && mainSection === 'planner') setMainSection('workouts');
    if (typeof window !== 'undefined') localStorage.setItem('workspace', ws);
    setPlayerId('');
    setSession(null);
    setRescheduleOpen(false);
    setRescheduleDate('');
    setPlayers([]);
    setPlayerFeedbacks({});
    setOneRM({});
    setRmHistory([]);
    setPendingSaved(null);
    setDecisionData(null);
    setRestrictions([]);
    setDevelopmentPlan(emptyDevelopmentPlan());
    setVolumeStats(null);
    setTrendsData(null);
    setError('');
    setJustSaved(false);
    setAutoSaved(false);
  }

  const assignedProgramOpened = useRef(false);
  useEffect(() => {
    if (!apiKey || assignedProgramOpened.current) return;
    const query = new URLSearchParams(window.location.search);
    const ws=query.get('assignedWorkspace'), id=query.get('assignedPlayer'), d=query.get('assignedDate');
    if (!['zarechie','nkperf'].includes(ws) || !id || !/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return;
    assignedProgramOpened.current=true;
    switchWorkspace(ws); setPlayerId(id); setDate(d); setMainSection('workouts'); setWorkspaceTab('program');setMobileView('workspace');
    fetch(`/api/players/list?workspace=${ws}`, {headers:{'x-api-key':apiKey}})
      .then(r=>r.json()).then(data=>setSelectedPlayer((data.players||[]).find(p=>String(p.id)===id)||null)).catch(()=>{});
  }, [apiKey]);

  async function loadNKPlayers(forceSync = false, shouldCommit = () => true) {
    if (shouldCommit()) setPlayersError('');
    try {
      if (forceSync) {
        const sr = await fetch('/api/nkperf/sync', { method: 'POST', headers: { 'x-api-key': apiKey } });
        const sd = await sr.json().catch(() => ({}));
        if (!sr.ok) throw new Error(sd.error || `Ошибка NK Performance (${sr.status})`);
        if (sr.ok && Array.isArray(sd.players)) {
          if (shouldCommit()) setPlayers(sd.players);
          return;
        }
      }
      const r = await fetch('/api/nkperf/sync', { headers: { 'x-api-key': apiKey } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Ошибка NK Performance (${r.status})`);
      const list = data.players || [];
      if (!list.length) {
        // Auto-sync on first load
        const sr2 = await fetch('/api/nkperf/sync', { method: 'POST', headers: { 'x-api-key': apiKey } });
        const sd2 = await sr2.json().catch(() => ({}));
        if (!sr2.ok) throw new Error(sd2.error || `Ошибка NK Performance (${sr2.status})`);
        if (shouldCommit()) setPlayers(sd2.players || []);
      } else {
        if (shouldCommit()) setPlayers(list);
      }
    } catch (err) {
      if (shouldCommit()) setPlayersError(err.message);
    }
  }

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    setPlayersError('');

    if (workspace === 'nkperf') {
      loadNKPlayers(false, () => !cancelled);
      return () => { cancelled = true; };
    }

    fetch(`/api/players/list?workspace=${encodeURIComponent(workspace)}`, { headers: { 'x-api-key': apiKey } })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (r.status === 401) setApiKey('');
        if (!r.ok) throw new Error(data.error || `Ошибка (${r.status})`);
        const list = data.players || [];
        if (cancelled) return;
        setPlayers(list);
        // Load today's feedback for all players
        const today = todayISO();
        fetch('/api/players/feedbacks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ playerIds: list.map(p => p.id), date: today, workspace }),
        }).then(r2 => r2.json()).then(d => {
          if (!cancelled) setPlayerFeedbacks(d.feedbacks || {});
        }).catch(() => {});
      })
      .catch(err => {
        if (cancelled) return;
        setPlayers([]);
        setPlayersError(err.message);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, workspace]);

  useEffect(() => {
    if (!apiKey || !playerId || !date) {
      setPendingSaved(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/programs/get?playerId=${encodeURIComponent(playerId)}&date=${encodeURIComponent(date)}&workspace=${workspace}`,
      { headers: { 'x-api-key': apiKey } }
    )
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          if(sameDraftView(activeTeamDraftRef.current,workspace,playerId,date))return;
          setPendingSaved(data.record || null);
          if (data.record && !dateDrafts.current.get(`${workspace}:${playerId}:${date}`)?.session) loadSavedRecord(data.record);
        }
      })
      .catch(() => {
        if (!cancelled && !sameDraftView(activeTeamDraftRef.current,workspace,playerId,date)) setPendingSaved(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, playerId, date, workspace]);

  // Reset trends when player changes
  useEffect(() => {
    setTrendsData(null);
    setTrendsOpen(false);
  }, [playerId, workspace]);

  // Load stored LSI (jump limb-symmetry index) for the selected player
  useEffect(() => {
    setLsiValue('');
    if (!apiKey || !playerId || workspace !== 'zarechie') return;
    fetch(`/api/players/lsi?playerId=${encodeURIComponent(playerId)}&workspace=${encodeURIComponent(workspace)}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => { if (d && d.lsi != null) setLsiValue(String(d.lsi)); })
      .catch(() => {});
  }, [apiKey, playerId, workspace]);

  // Persist LSI to Redis (debounced on blur/change via the handler below)
  const saveLSI = useCallback((val) => {
    if (!apiKey || !playerId || workspace !== 'zarechie') return;
    fetch('/api/players/lsi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ playerId, lsi: val === '' ? null : Number(val), workspace }),
    }).catch(() => {});
  }, [apiKey, playerId, workspace]);

  const handleLSIChange = useCallback((val) => {
    setLsiValue(val);
    saveLSI(val);
  }, [saveLSI]);

  // Fetch load + neuro trends when the panel opens
  useEffect(() => {
    if (!trendsOpen || !apiKey || !playerId) return;
    if (trendsData) return;
    setTrendsLoading(true);
    fetch(`/api/players/trends?playerId=${encodeURIComponent(playerId)}&days=28&workspace=${workspace}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => setTrendsData(d))
      .catch(() => setTrendsData({ cmjHistory: [], acwrHistory: [], gymAcwrHistory: [], tsbHistory: [] }))
      .finally(() => setTrendsLoading(false));
  }, [trendsOpen, apiKey, playerId, trendsData, workspace]);

  // Restore recovery status when player changes
  useEffect(() => {
    if (!playerId) { setRecoveryStatus('green'); return; }
    try {
      const saved = localStorage.getItem(`recovery_${playerId}`);
      setRecoveryStatus(saved === 'yellow' || saved === 'red' ? saved : 'green');
    } catch (_) { setRecoveryStatus('green'); }
  }, [playerId]);

  function changeRecovery(status) {
    setRecoveryStatus(status);
    if (playerId) { try { localStorage.setItem(`recovery_${playerId}`, status); } catch (_) {} }
  }

  // Fetch 1RM data (+ history) when player changes
  useEffect(() => {
    if (!apiKey || !playerId) { setOneRM({}); setRmHistory([]); return; }
    fetch(`/api/players/1rm?playerId=${encodeURIComponent(playerId)}&workspace=${workspace}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setOneRM(data.values || {}))
      .catch(() => setOneRM({}));
    fetch(`/api/players/1rm-history?playerId=${encodeURIComponent(playerId)}&workspace=${workspace}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setRmHistory(Array.isArray(data.history) ? data.history : []))
      .catch(() => setRmHistory([]));
  }, [apiKey, playerId, workspace]);

  // Load microcycle templates list when the coach key is present.
  useEffect(() => {
    if (!apiKey) { setTemplates([]); return; }
    fetch('/api/programs/templates', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setTemplates(Array.isArray(data.templates) ? data.templates : []))
      .catch(() => setTemplates([]));
  }, [apiKey]);

  // Fetch player contraindications when player changes.
  useEffect(() => {
    if (!apiKey || !playerId) { setRestrictions([]); return; }
    fetch(`/api/player/restrictions?playerId=${encodeURIComponent(playerId)}&workspace=${workspace}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setRestrictions(Array.isArray(data.restrictions) ? data.restrictions : []))
      .catch(() => setRestrictions([]));
  }, [apiKey, playerId, workspace]);

  useEffect(() => {
    setDevelopmentPlanSaved(false);
    if (!apiKey || !playerId) { setDevelopmentPlan(emptyDevelopmentPlan()); return; }
    let cancelled = false;
    fetch(`/api/players/development-plan?playerId=${encodeURIComponent(playerId)}&workspace=${encodeURIComponent(workspace)}`, { headers: { 'x-api-key': apiKey } })
      .then(response => response.json())
      .then(data => { if (!cancelled) setDevelopmentPlan(data.plan || emptyDevelopmentPlan()); })
      .catch(() => { if (!cancelled) setDevelopmentPlan(emptyDevelopmentPlan()); });
    return () => { cancelled = true; };
  }, [apiKey, playerId, workspace]);

  // Refresh whenever the selected player, date, or workspace changes. This is
  // deliberately separate from generation, so the coach can verify inputs first.
  useEffect(() => {
    if (!apiKey || !playerId || !date) {
      setDecisionData(null);
      setDecisionDataLoading(false);
      return;
    }
    let cancelled = false;
    setDecisionDataLoading(true);
    fetch(`/api/players/decision-data?playerId=${encodeURIComponent(playerId)}&date=${encodeURIComponent(date)}&workspace=${encodeURIComponent(workspace)}`, {
      headers: { 'x-api-key': apiKey },
    })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Не удалось загрузить данные');
        return body;
      })
      .then(body => { if (!cancelled) setDecisionData(body); })
      .catch(error => { if (!cancelled) setDecisionData({ source: 'ReadySix', decision: { level: 'yellow', label: 'Данные ReadySix недоступны', detail: error.message } }); })
      .finally(() => { if (!cancelled) setDecisionDataLoading(false); });
    return () => { cancelled = true; };
  }, [apiKey, playerId, date, workspace]);

  // Fetch weekly volume when player changes
  useEffect(() => {
    if (!apiKey || !playerId) { setVolumeStats(null); return; }
    fetch(`/api/players/volume?playerId=${encodeURIComponent(playerId)}&days=7&workspace=${workspace}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setVolumeStats(data))
      .catch(() => setVolumeStats(null));
  }, [apiKey, playerId, workspace]);

  // Cards and generation share the exact server prescription, never 1RM fallback.
  useEffect(() => {
    if (!session || !playerId || !apiKey) { setProgressionMap({}); setExHistoryMap({}); setProgressionLoading(false);setProgressionError('');return; }
    const exercises=(session.blocks || []).flatMap(b=>(b.exercises || []).map(e=>({...e,exerciseId:e.exerciseId || canonicalExerciseId(e.name)}))).filter(e=>e.name);
    if(!exercises.length){setProgressionMap({});setProgressionLoading(false);return;}
    const controller=new AbortController();setProgressionMap({});setExHistoryMap({});setProgressionError('');setProgressionLoading(true);
    const input={playerId:String(playerId),exercises,workspace,date:meta?.date || date,focus:meta?.focus || focus,trainingType:meta?.trainingType || trainingType,strengthMode:meta?.strengthMode || strengthMode,dayGoal,notes};
    const timer=setTimeout(()=>{
      requestCoachProgression({input,apiKey,signal:controller.signal})
       .then(data=>{if(!controller.signal.aborted){setProgressionMap(data.progression);setExHistoryMap(data.history);}})
       .catch(error=>{if(!controller.signal.aborted)setProgressionError(error.message);})
       .finally(()=>{if(!controller.signal.aborted)setProgressionLoading(false);});
    },300);
    return()=>{clearTimeout(timer);controller.abort();};
  },[session,playerId,apiKey,workspace,factsRefresh,progressionRefresh,date,focus,trainingType,strengthMode,meta?.date,meta?.focus,meta?.trainingType,meta?.strengthMode,dayGoal,notes]);

  // Load team tonnage when switching to the Нагрузка section.
  useEffect(() => {
    if (mainSection !== 'tonnage' || !apiKey) return;
    const controller=new AbortController();setTonnageLoading(true);setTonnageData(null);setTonnageUpdatedAt(null);
    const deadline=setTimeout(()=>controller.abort('timeout'),25000);
    overviewJson(`/api/players/team-tonnage?days=7&workspace=${workspace}`,{apiKey,signal:controller.signal})
      .then(data => {if(!Array.isArray(data.players) || !Array.isArray(data.dates))throw Error('Нагрузка получена не полностью. Обновите данные.');if(!controller.signal.aborted){setTonnageData(data);setTonnageUpdatedAt(new Date().toISOString());}})
      .catch(error => {if(!controller.signal.aborted || controller.signal.reason==='timeout')setTonnageData({error:controller.signal.reason==='timeout'?'Превышено время ожидания. Повторите обновление.':error.message,players:[],dates:[]});})
      .finally(() => {clearTimeout(deadline);if(!controller.signal.aborted || controller.signal.reason==='timeout')setTonnageLoading(false);});
    return()=>{clearTimeout(deadline);controller.abort();};
  }, [mainSection, apiKey, workspace,factsRefresh,tonnageRefresh]);

  // Auto-load team status when switching to status sub-tab in Нагрузка.
  useEffect(() => {
    if (mainSection === 'tonnage' && tonnageTab === 'status' && players.length > 0 && apiKey) loadTeamStatus(todayISO());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSection, tonnageTab,workspace,players.length,factsRefresh]);

  // Floor command centre: keep the team view current without manual reloads.
  useEffect(() => {
    if (!['live', 'attention'].includes(mainSection) || !apiKey || players.length === 0) return undefined;
    loadTeamStatus(todayISO());
    const timer = setInterval(() => loadTeamStatus(todayISO(), true), 8000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSection, apiKey, workspace, players.length]);

  // One cancellable snapshot for Today; failures remain visible, never become empty success.
  useEffect(() => {
    if(mainSection!=='today' || !apiKey || !players.length)return;
    loadTodayOverview(false);loadPlatformHealth();
    const timer=setInterval(()=>loadTodayOverview(true),30000);
    return()=>{clearInterval(timer);todayControllerRef.current?.abort();todayControllerRef.current=null;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mainSection,apiKey,workspace,players.length,factsRefresh]);

  useEffect(() => {
    if (mainSection === 'health' && apiKey) loadPlatformHealth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSection, apiKey, workspace,factsRefresh]);

  // Load team readiness when switching to readiness section or changing date.
  useEffect(() => {
    if (!['readiness', 'attention'].includes(mainSection) || !apiKey) return;
    setReadinessLoading(true);
    fetch(`/api/team/readiness?date=${readinessDate}&workspace=${workspace}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => setReadinessData(d))
      .catch(() => setReadinessData({ players: [] }))
      .finally(() => setReadinessLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSection, apiKey, readinessDate, workspace]);

  // Load the week after resolving today's decision inputs. This keeps the load
  // budget and batch-adaptation preview on the same recommendation snapshot.
  useEffect(() => {
    if (mainSection !== 'calendar' || !apiKey || !players.length) return;
    setWeekBatchSelected(new Set());setCalData(null);setCalendarUpdatedAt(null);setCalendarError('');
    loadCalendarWeek(false);
    return()=>{calendarRequestRef.current++;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSection, apiKey, calWeekStart, workspace,players.length,factsRefresh]);

  // Load monthly schedule when switching to planner section or changing month.
  useEffect(() => {
    if (mainSection !== 'planner' || !apiKey || !usesSeasonCalendar(workspace)) return;
    setPlannerLoading(true);
    setMonthSchedule(null);
    setPlannerEditDate(null);
    fetch(`/api/schedule/month?month=${plannerMonth}&workspace=${workspace}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => setMonthSchedule(Array.isArray(d.days) ? d.days : []))
      .catch(() => setMonthSchedule([]))
      .finally(() => setPlannerLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSection, apiKey, plannerMonth, workspace]);

  function plannerDayFor(dateStr) {
    return (monthSchedule || []).find(d => d.date === dateStr) || null;
  }

  async function savePlannerDay(dateStr, patch) {
    if (!usesSeasonCalendar(workspace)) return;
    const existing = monthSchedule || [];
    let next;
    if (patch === null) {
      next = existing.filter(d => d.date !== dateStr);
    } else {
      const found = existing.find(d => d.date === dateStr);
      const merged = { date: dateStr, ...(found || {}), ...patch };
      if (merged.type !== 'training') delete merged.focus;
      next = found
        ? existing.map(d => (d.date === dateStr ? merged : d))
        : [...existing, merged];
    }
    next.sort((a, b) => (a.date < b.date ? -1 : 1));
    setMonthSchedule(next);
    const response = await fetch('/api/schedule/month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ month: plannerMonth, days: next, workspace }),
    }).catch(() => null);
    if (response?.ok) {
      const data = await response.json().catch(() => ({}));
      if (Array.isArray(data.events)) setScheduleEvents(data.events);
    }
  }

  async function runPlannerAutoplan() {
    if (!usesSeasonCalendar(workspace)) return;
    setPlannerLoading(true);
    try {
      const r = await fetch(`/api/schedule/month?month=${plannerMonth}&workspace=${workspace}`, {
        method: 'PUT',
        headers: { 'x-api-key': apiKey },
      });
      const d = await r.json();
      setMonthSchedule(Array.isArray(d.days) ? d.days : []);
      if (Array.isArray(d.events)) setScheduleEvents(d.events);
    } catch {}
    setPlannerLoading(false);
  }

  const filteredPlayers = (positionFilter === 'all' ? players : players.filter(p => {
    const pos = (p.position || '').toLowerCase();
    if (positionFilter === 'diagonal') return pos.includes('диагон');
    if (positionFilter === 'outside') return pos.includes('доигр');
    if (positionFilter === 'middle') return pos.includes('центр') || pos.includes('middle');
    if (positionFilter === 'setter') return pos.includes('связ') || pos.includes('setter');
    if (positionFilter === 'libero') return pos.includes('либеро');
    return true;
  })).filter(p => !playerSearch || p.name.toLowerCase().includes(playerSearch.toLowerCase()));

  const playerIndex = useMemo(
    () => filteredPlayers.findIndex(p => p.id === playerId),
    [filteredPlayers, playerId]
  );
  const prevPlayer = useMemo(() => {
    if (filteredPlayers.length <= 1 || playerIndex < 0) return null;
    return filteredPlayers[(playerIndex - 1 + filteredPlayers.length) % filteredPlayers.length];
  }, [filteredPlayers, playerIndex]);
  const nextPlayer = useMemo(() => {
    if (filteredPlayers.length <= 1 || playerIndex < 0) return null;
    return filteredPlayers[(playerIndex + 1) % filteredPlayers.length];
  }, [filteredPlayers, playerIndex]);

  const keyConnected = apiKey && !playersError;
  const liveRows = useMemo(() => players.map(player => ({ player, status: teamStatus[player.id] || {} })).sort((a,b)=>(Number(!!b.status.live?.alerts?.length)*10+Number(!!b.status.pendingCommands?.length)*5+Number(!!b.status.live?.started))-(Number(!!a.status.live?.alerts?.length)*10+Number(!!a.status.pendingCommands?.length)*5+Number(!!a.status.live?.started))), [players, teamStatus]);
  const [warmupConduct,setWarmupConduct]=useState(false);
  useEffect(()=>setWarmupConduct(false),[workspace,warmupPlan?.date]);
  const [liveDebrief,setLiveDebrief]=useState(false);
  const liveSummary = useMemo(() => liveRows.reduce((summary, row) => {
    if (row.status.live?.started) summary.started += 1;
    if (row.status.live?.completed || row.status.live?.endedEarly) summary.completed += 1;
    if (!row.status.live?.completed && !row.status.live?.endedEarly && (row.status.live?.alerts || []).length) summary.alerts += 1;
    if (row.status.hasSession) summary.planned += 1;
    return summary;
  }, { planned: 0, started: 0, completed: 0, alerts: 0 }), [liveRows]);
  const stationRotation = useMemo(() => buildStationRotation(liveRows.filter(row=>!row.status.live?.completed && !row.status.live?.endedEarly)), [liveRows]);
  const attentionQueue = useMemo(() => buildAttentionQueue(liveRows, readinessData?.players || []), [liveRows, readinessData]);
  const todayCenter = useMemo(
    () => buildTodayDecisionCenter(players.map(player=>({player,status:todaySnapshot?.workspace===workspace?todaySnapshot.status?.[player.id] || {}:{}})), todaySnapshot?.workspace===workspace?todaySnapshot.readiness?.players || []:[], healthData),
    [players, todaySnapshot, workspace, healthData]
  );

  // Session volume: total sets + estimated tonnage
  const sessionVolume = useMemo(() => {
    if (!session) return null;
    let sets = 0, kgTotal = 0;
    (session.blocks || []).forEach(b => {
      (b.exercises || []).forEach(ex => {
        sets += (ex.targetSets || []).length;
        const kg = ex.weightKg != null ? ex.weightKg : parseKgFromNote(ex.weightNote || '');
        if (kg > 0) (ex.targetSets || []).forEach(s => { kgTotal += exerciseTonnage(ex, targetSetReps(s), kg); });
      });
    });
    const exCount = (session.blocks || []).reduce((s, b) => s + (b.exercises || []).length, 0);
    return { sets, exCount, tonnes: kgTotal > 0 ? (kgTotal / 1000).toFixed(1) : null };
  }, [session]);

  const continuitySummary = useMemo(() => {
    if (!session) return { known: 0, recommendations: 0, pain: 0 };
    return (session.blocks || []).flatMap(block => block.exercises || []).reduce((summary, ex) => {
      const record = (meta?.focus || focus)==='inseason_strength'?progressionMap[strengthProgressionKey(ex)]:progressionMap[ex.exerciseId || canonicalExerciseId(ex.name)] || progressionMap[ex.name];
      if (!record) return summary;
      summary.known += 1;
      if (record.pain) summary.pain += 1;
      if (record.suggestedKg && !record.pain) summary.recommendations += 1;
      return summary;
    }, { known: 0, recommendations: 0, pain: 0 });
  }, [session, progressionMap,meta?.focus,focus]);

  const methodViolations = useMemo(() => {
    if (!session || !(meta?.focus || focus).startsWith('camp_')) return [];
    const v = [];
    (session.blocks || []).forEach(b =>
      (b.exercises || []).forEach(ex => {
        const hit = CAMP_FORBIDDEN.find(r => r.re.test(ex.name || ''));
        if (hit) v.push({ name: ex.name, label: hit.label });
      })
    );
    return v;
  }, [session, meta?.focus, focus]);

  const jumpVolume = useMemo(() => {
    if (!session) return null;
    let exCount = 0, sets = 0;
    (session.blocks || []).forEach(b =>
      (b.exercises || []).forEach(ex => {
        if (JUMP_TAGS.some(t => (ex.name || '').toLowerCase().includes(t))) {
          exCount++;
          sets += (ex.targetSets || []).length;
        }
      })
    );
    return exCount > 0 ? { exCount, sets } : null;
  }, [session]);

  const generationQuality = useMemo(() => {
    if (!session || !meta) return [];
    const blocks = session.blocks || [];
    const exercises = blocks.flatMap(b => (b.exercises || []).map(ex => ({ ...ex, block: b.label })));
    const exCount = exercises.length;
    const qualityFocus = meta.focus || focus;
    const qualityTrainingType = meta.trainingType || trainingType;
    const isRecovery = qualityTrainingType === 'recovery_prehab' || recoveryStatus === 'red';
    const isSeason = isInSeasonFocus(qualityFocus);
    const isPrehab = session.kind === 'prehab_training_draft';
    const prescribedExercises = isPrehab ? {min:10,max:12} : meta.quality?.dose?.prescription?.exercises;
    const targetMin = prescribedExercises?.min ?? (isRecovery ? 5 : isSeason ? 6 : 10);
    const targetMax = prescribedExercises?.max ?? (isRecovery ? 8 : isSeason ? 10 : 12);
    const hasMainAlternatives = exercises.some(ex => /^[ABC]1\b/i.test(ex.code || '') && Array.isArray(ex.alternatives) && ex.alternatives.length >= 2);
    const dOrEAlt = exercises.some(ex => ['D','E'].includes(String(ex.block || '')) && Array.isArray(ex.alternatives) && ex.alternatives.length > 0);
    const nonMainFiveSec = exercises.some(ex => !/^[ABC]1\b/i.test(ex.code || '') && /5-0-X-0|0-5/i.test(ex.tempo || ''));
    const hasKgOrManual = exercises.every(ex => {
      const note = String(ex.weightNote || '').toLowerCase();
      return ex.weightKg != null || note.includes('rpe') || note.includes('вручную') || note.includes('вес тела') || note.includes('без отягощения') || !/^[ABC]1\b/i.test(ex.code || '');
    });
    return [
      ...(Number.isFinite(meta.quality?.score) ? [{
        label: 'Проф. оценка',
        ok: meta.quality.score >= 85,
        detail: `${meta.quality.score}/100 · ${meta.quality.grade || 'проверено'}`,
      }] : []),
      { label: 'Фаза', ok: !!qualityFocus, detail: getFocusLabel(period, qualityFocus) },
      { label: 'Тип', ok: !!qualityTrainingType, detail: TRAINING_TYPE_LABELS[qualityTrainingType] || 'не выбран' },
      { label: 'Метод', ok: true, detail: 'ручной выбор тренера' },
      { label: 'Recovery', ok: isPrehab ? exercises.every(ex=>ex.targetSets.length<=2) : recoveryStatus !== 'red' || exCount <= 8, detail: recoveryStatus === 'red' ? 'сниженный объем' : 'по готовности' },
      { label: 'Упражнения', ok: exCount >= targetMin && exCount <= targetMax, detail: `${exCount} / цель ${targetMin}-${targetMax}` },
      { label: 'Запреты', ok: methodViolations.length === 0, detail: methodViolations.length ? `${methodViolations.length} наруш.` : 'чисто' },
      isPrehab ? {label:'Основное время',ok:session.methodology?.timing?.plannedMainMinutes===50,detail:'50 минут с паузами и контролем'} : { label: 'Альтернативы', ok: hasMainAlternatives && !dOrEAlt, detail: hasMainAlternatives ? 'A/B/C есть' : 'нет в основных' },
      { label: 'Темп', ok: !nonMainFiveSec, detail: nonMainFiveSec ? '5 сек вне A1/B1/C1' : 'методически чисто' },
      { label: 'Вес/RPE', ok: hasKgOrManual, detail: hasKgOrManual ? 'задан' : 'проверь основные' },
    ];
  }, [session, meta, focus, period, trainingType, workspace, recoveryStatus, methodViolations]);

  // Keyboard shortcuts: G=generate, S=save, Alt+←/→=prev/next player, Esc=blur
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      if (e.altKey && e.key === 'ArrowLeft') {
        if (prevPlayer) { e.preventDefault(); selectPlayer(prevPlayer); }
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        if (nextPlayer) { e.preventDefault(); selectPlayer(nextPlayer); }
        return;
      }
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') {
        if (session === null && playerId) { e.preventDefault(); handleGenerate(e); }
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
        if (session !== null && !justSaved && !autoSaved) { e.preventDefault(); handleSave(); }
      } else if (e.key === 'Escape') {
        document.activeElement?.blur?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, playerId, justSaved, autoSaved, prevPlayer, nextPlayer]);
  const playerOptions = players.map(p => ({
    value: p.id,
    label: `${p.name}${p.position ? ` (${p.position})` : ''}`,
  }));

  function handleOneRMChange(field, value) {
    const updated = { ...oneRM };
    const num = parseFloat(value);
    if (!Number.isNaN(num) && num > 0) updated[field] = num;
    else delete updated[field];
    setOneRM(updated);
    if (oneRMSaveTimer) clearTimeout(oneRMSaveTimer);
    const t = setTimeout(() => {
      fetch('/api/players/1rm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, values: updated, workspace }),
      }).catch(() => {});
    }, 800);
    setOneRMSaveTimer(t);
  }

  async function copyTo(targetPlayerId) {
    setCopying(true); setCopyError('');
    try {
      const response = await fetch('/api/programs/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ fromPlayerId: playerId, toPlayerId: targetPlayerId, date, workspace, targetWorkspace:copyWorkspace, targetDate:copyDate, sourceSession:session, allowRepeatedExercises:copyKeepExact }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error([data.error || 'Не удалось скопировать программу', ...(data.repeated || []).map(e=>e.name)].join(' · '));
      const target = copyPlayers.find(p => String(p.id) === String(targetPlayerId));
      setCopyDone({name:target?.name || 'Игрок',workspace:copyWorkspace,playerId:String(targetPlayerId),date:copyDate});
      setCopyModalOpen(false);
    } catch (error) {setCopyError(error.message);}
    finally {setCopying(false);}
  }

  async function savePhoto(url) {
    const photoUrl = typeof url === 'string' ? url : photoInput.trim();
    try {
      await fetch('/api/players/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId: editPhotoFor, photoUrl, workspace }),
      });
      setPlayers(prev => prev.map(p => p.id === editPhotoFor ? { ...p, photo: photoUrl || null } : p));
      if (selectedPlayer?.id === editPhotoFor) {
        setSelectedPlayer(prev => ({ ...prev, photo: photoUrl || null }));
      }
    } catch (_) {}
    setEditPhotoFor(null);
  }

  async function uploadPlayerPhoto(file) {
    if (!file || !editPhotoFor) return;
    setPhotoUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; };
        img.onload = () => {
          const MAX = 400;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = reject;
        reader.readAsDataURL(file);
      });
      await savePhoto(dataUrl);
    } catch (_) {
      setPhotoUploading(false);
    }
  }

  function selectPlayer(p) {
    rememberTeamDraft();activeTeamDraftRef.current=null;draftOpenController.current?.abort();setTeamDraftOpening(false);
    setHistoryFactTarget(null);
    setEditorPreview(false);
    draftOpenRequest.current++;
    if(workspace==='nkperf' && date===playerToday)setDate(playerLocalDate(playerTimeZone(p.timeZone)));
    setSelectedPlayer(p);
    setPendingSaved(null);
    setPlayerId(p.id);
    setSession(null);
    setMeta(null);
    setRescheduleOpen(false);
    setRescheduleDate('');
    setWeekPlan(null);
    setError('');
    setJustSaved(false);
    setAutoSaved(false);
    setTodayWarmup(null);
    setLinkCopied(null);
    setMobileView('workspace');
    setWorkspaceTab('program');
    setSidebarOpen(false);
  }

  function startGenProgress(longRun = false) {
    genTimers.current.forEach(clearTimeout);
    genTimers.current = [];
    setGenProgress(0);
    // Gym sessions now run through the async generation path (~1-3 мин) — use a slower, longer
    // timeline so the messaging matches reality. Warmup stays on the quick timeline.
    const stages = longRun
      ? [
          { delay: 0,      pct: 3,  msg: 'Ставлю задачу в очередь...' },
          { delay: 4000,   pct: 10, msg: 'Генерирую тренировку... обычно 1-3 минуты' },
          { delay: 20000,  pct: 25, msg: 'Анализирую состояние и историю...' },
          { delay: 45000,  pct: 42, msg: 'Составляю структуру и подбираю упражнения...' },
          { delay: 80000,  pct: 60, msg: 'Генерирую PAP-блоки и прогрессию...' },
          { delay: 120000, pct: 76, msg: 'Финализирую программу...' },
          { delay: 160000, pct: 88, msg: 'Почти готово, ожидаю результат...' },
        ]
      : [
          { delay: 0,     pct: 3,  msg: 'Загружаю данные игрока...' },
          { delay: 1500,  pct: 12, msg: 'Анализирую состояние и историю...' },
          { delay: 4000,  pct: 28, msg: 'Составляю структуру тренировки...' },
          { delay: 10000, pct: 45, msg: 'Подбираю упражнения и нагрузку...' },
          { delay: 22000, pct: 62, msg: 'Генерирую PAP-блоки...' },
          { delay: 38000, pct: 76, msg: 'Рассчитываю прогрессию...' },
          { delay: 55000, pct: 88, msg: 'Финализирую программу...' },
          { delay: 75000, pct: 93, msg: 'Ожидаю результат...' },
        ];
    stages.forEach(({ delay, pct, msg }) => {
      const t = setTimeout(() => { setGenProgress(pct); setGenStage(msg); }, delay);
      genTimers.current.push(t);
    });
  }

  function stopGenProgress(success) {
    genTimers.current.forEach(clearTimeout);
    genTimers.current = [];
    if (success) {
      setGenProgress(100);
      setGenStage('Готово!');
      setTimeout(() => { setGenProgress(0); setGenStage(''); }, 800);
    } else {
      setGenProgress(0);
      setGenStage('');
    }
  }

  useEffect(()=>{const target=overviewScrollTargetRef.current,updatedAt=({calendar:calendarUpdatedAt,tonnage:tonnageUpdatedAt,today:todayUpdatedAt,live:liveUpdatedAt})[mainSection];if(target?.type!=='restore' || target.section!==mainSection || target.workspace!==workspace || calLoading || tonnageLoading || !overviewRestoreReady(target,updatedAt))return;let second;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{document.querySelector('.workspace-main')?.scrollTo({top:target.scroll});document.querySelector('.coach-week-scroll')?.scrollTo({left:target.horizontal,top:target.tableScroll});overviewScrollTargetRef.current=null;});});return()=>{cancelAnimationFrame(first);if(second)cancelAnimationFrame(second);};},[mainSection,workspace,calLoading,tonnageLoading,calendarUpdatedAt,tonnageUpdatedAt,todayUpdatedAt,liveUpdatedAt]);
  const [overviewReturn,setOverviewReturn]=useState(null);
  function openOverviewPlayer(player,targetDate=todayISO(),tab='program') {
    if(['calendar','tonnage','today','live'].includes(mainSection))setOverviewReturn({section:mainSection,workspace,scroll:document.querySelector('.workspace-main')?.scrollTop || 0,horizontal:document.querySelector('.coach-week-scroll')?.scrollLeft || 0,tableScroll:document.querySelector('.coach-week-scroll')?.scrollTop || 0});
    const current=players.find(item=>String(item.id)===String(player.id));
    if(!current)return;
    selectPlayer(current);setDate(targetDate);setWorkspaceTab(tab);setMainSection('workouts');
  }
  function openHistoryFacts(player,target){openOverviewPlayer(player,target.date,'history');setHistoryFactTarget({...target,token:crypto.randomUUID()});}
  function overviewDraft(playerId,targetDate=todayISO()) {return draftForPlayer(batchResults,playerId,workspace,targetDate);}
  function openOverviewSection(section){
    if(section==='drafts'){setMainSection('team');setMobileView('workspace');setSidebarOpen(false);}
    else setMainSection(section);
  }
  async function loadTodayOverview(quiet=false,refresh=false){
    if(quiet && todayControllerRef.current)return;
    todayControllerRef.current?.abort();
    const controller=new AbortController(),requestedWorkspace=workspace;todayControllerRef.current=controller;
    const current=()=>todayControllerRef.current===controller && overviewWorkspaceRef.current===requestedWorkspace;
    setReadinessLoading(true);
    const deadline=setTimeout(()=>controller.abort('timeout'),25000);
    try{
      const data=await requestDailyOverview({apiKey,workspace:requestedWorkspace,date:todayISO(),playerIds:players.map(p=>p.id),signal:controller.signal,refresh});
      if(current() && !controller.signal.aborted){setTodaySnapshot({workspace:requestedWorkspace,...data});setReadinessData(data.readiness);setTeamStatus(data.status);setTodayError('');setTodayUpdatedAt(new Date().toISOString());setLiveUpdatedAt(new Date().toISOString());}
    }catch(error){if(current() && (!controller.signal.aborted || controller.signal.reason==='timeout'))setTodayError(controller.signal.reason==='timeout'?'Превышено время ожидания. Повторите обновление.':error.message);}
    finally{clearTimeout(deadline);if(current()){setReadinessLoading(false);todayControllerRef.current=null;}}
  }

  async function loadTeamStatus(statusDate = date, quiet = false, readinessPlayers = readinessData?.players || []) {
    if (!apiKey || !players.length) return {};
    const request=++teamStatusRequestRef.current,requestedWorkspace=workspace,requestedSection=mainSection;
    const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),25000);
    const current=()=>request===teamStatusRequestRef.current && overviewWorkspaceRef.current===requestedWorkspace && overviewSectionRef.current===requestedSection;
    if (!quiet) setTeamStatusLoading(true);
    let loadedStatus={};
    try{
      const data=await overviewJson('/api/programs/team-status',{apiKey,signal:controller.signal,body:{playerIds:players.map(p=>p.id),date:statusDate,workspace:requestedWorkspace,readinessPlayers}});
      if(current()){loadedStatus=data.status || {};setTeamStatus(loadedStatus);setTeamStatusError('');setLiveUpdatedAt(new Date().toISOString());}
    }catch(error){if(current())setTeamStatusError(controller.signal.aborted?'Превышено время ожидания. Повторите обновление.':error.message);}
    finally{clearTimeout(deadline);if(current() && !quiet)setTeamStatusLoading(false);}
    return loadedStatus;
  }

  async function loadCalendarWeek(quiet = false) {
    if (!apiKey) return;
    const requestId = ++calendarRequestRef.current;
    const requestedWorkspace = workspace;
    const requestedWeek = calWeekStart;
    if (!quiet) setCalLoading(true);
    const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),25000);
    try {
      const daily=await requestDailyOverview({apiKey,workspace:requestedWorkspace,date:todayISO(),playerIds:players.map(p=>p.id),signal:controller.signal});
      const readiness=daily.readiness,statuses=daily.status;
      const recommendations = Object.fromEntries(Object.entries(statuses || {}).filter(([, status]) => status?.adaptation).map(([id, status]) => [id, status.adaptation]));
      const response = await fetch('/api/schedule/week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ start: requestedWeek, workspace: requestedWorkspace, recommendations }),signal:controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось загрузить неделю');
      if(!Array.isArray(data.players) || !Array.isArray(data.athletes) || !Array.isArray(data.dates))throw Error('Неделя получена не полностью. Обновите данные.');
      if (requestId !== calendarRequestRef.current) return;
      setReadinessData(readiness);
      setTeamStatus(statuses);
      setLiveUpdatedAt(new Date().toISOString());
      setCalData(data);setCalendarError('');setCalendarUpdatedAt(new Date().toISOString());
    } catch (calendarError) {
      if (requestId === calendarRequestRef.current) {
        setCalendarError(controller.signal.aborted?'Превышено время ожидания. Повторите обновление.':calendarError.message);
      }
    } finally {
      clearTimeout(deadline);
      if (!quiet && requestId === calendarRequestRef.current) setCalLoading(false);
    }
  }

  function toggleWeekBatch(playerId, date) {
    const key = `${playerId}:${date}`;
    setWeekBatchSelected(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function createWeekAdaptationBatch() {
    if (!weekBatchSelected.size || weekBatchSaving || calLoading || calendarError || readinessData?.cache==='stale' || readinessData?.revalidating) return;
    const items = Array.from(weekBatchSelected).map(key => {
      const separator = key.lastIndexOf(':');
      const playerIdValue = key.slice(0, separator);
      const dateValue = key.slice(separator + 1);
      const athlete = calData?.athletes?.find(item => String(item.player.id) === playerIdValue);
      return {
        playerId: playerIdValue,
        playerName: athlete?.player?.name || '',
        date: dateValue,
        recommendation: teamStatus[playerIdValue]?.adaptation,
      };
    }).filter(item => item.playerId && item.recommendation);
    if (!items.length) return;
    setWeekBatchSaving(true);
    try {
      const response = await fetch('/api/programs/adaptation-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ action: 'create', workspace, items }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось собрать пакет адаптации');
      setWeekBatchDraft(data.batch);
    } catch (batchError) {
      setError(batchError.message);
    } finally {
      setWeekBatchSaving(false);
    }
  }

  async function confirmWeekAdaptationBatch() {
    if (!weekBatchDraft || weekBatchSaving) return;
    setWeekBatchSaving(true);
    try {
      const response = await fetch('/api/programs/adaptation-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ action: 'commit', workspace, batchId: weekBatchDraft.batchId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Пакет не применён');
      setWeekBatchDraft(null);
      setWeekBatchSelected(new Set());
      await loadCalendarWeek(true);
    } catch (batchError) {
      setError(batchError.message);
    } finally {
      setWeekBatchSaving(false);
    }
  }

  async function rollbackWeekAdaptationBatch() {
    if (!weekRollbackBatch || weekBatchSaving) return;
    setWeekBatchSaving(true);
    try {
      const response = await fetch('/api/programs/adaptation-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ action: 'rollback', workspace, batchId: weekRollbackBatch.batchId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Пакет не удалось откатить');
      setWeekRollbackBatch(null);
      await loadCalendarWeek(true);
    } catch (batchError) {
      setError(batchError.message);
    } finally {
      setWeekBatchSaving(false);
    }
  }

  function openReturnToPlay(player, plan = null) {
    setRtpPlayer(player);
    setRtpDraft(normalizeReturnToPlay(plan || {}, todayISO()));
  }

  async function saveReturnToPlay() {
    if (!rtpPlayer || rtpSaving) return;
    setRtpSaving(true);
    try {
      const response = await fetch('/api/players/return-to-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId: rtpPlayer.id, workspace, plan: rtpDraft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить RTP');
      setTeamStatus(previous => ({
        ...previous,
        [rtpPlayer.id]: { ...(previous[rtpPlayer.id] || {}), returnToPlay: data.plan },
      }));
      setRtpPlayer(null);
      setRtpDraft(null);
      await loadTeamStatus(todayISO(), true, readinessData?.players || []);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setRtpSaving(false);
    }
  }

  async function applyTodayRecommendation(player, recommendation, hasSession) {
    if (!hasSession) {
      selectPlayer(player);
      setDate(todayISO());
      setRecoveryStatus(recommendation.mode === 'recover' || recommendation.mode === 'hold' ? 'red' : recommendation.mode === 'reduce' || recommendation.mode === 'rtp' ? 'yellow' : 'green');
      const instruction = `Адаптация на сегодня: ${recommendation.label}. Объём ${recommendation.volumePercent}%, интенсивность ${recommendation.intensityPercent}%, RPE ≤ ${recommendation.rpeCap}. Причины: ${recommendation.reasons.join('; ')}.`;
      setNotes(previous => previous.includes('Адаптация на сегодня:') ? instruction : [previous.trim(), instruction].filter(Boolean).join('\n'));
      setMainSection('workouts');
      return;
    }
    setAdaptationSaving(true);
    try {
      const response = await fetch('/api/programs/adaptation-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ action: 'create', playerId: player.id, date: todayISO(), workspace, recommendation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось создать черновик адаптации');
      setAdaptationDraft({ ...data.draft, player });
    } catch (adaptationError) {
      setError(adaptationError.message);
    } finally {
      setAdaptationSaving(false);
    }
  }

  async function closeAdaptationDraft() {
    const draft = adaptationDraft;
    if (!draft || adaptationSaving) return;
    setAdaptationSaving(true);
    try {
      await fetch(`/api/programs/adaptation-draft?playerId=${encodeURIComponent(draft.playerId)}&date=${encodeURIComponent(draft.date)}&workspace=${encodeURIComponent(workspace)}`, {
        method: 'DELETE', headers: { 'x-api-key': apiKey },
      });
      setAdaptationDraft(null);
    } finally {
      setAdaptationSaving(false);
    }
  }

  async function confirmAdaptationDraft() {
    if (!adaptationDraft || adaptationSaving) return;
    setAdaptationSaving(true);
    try {
      const response = await fetch('/api/programs/adaptation-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ action: 'commit', playerId: adaptationDraft.playerId, date: adaptationDraft.date, workspace, draftId: adaptationDraft.draftId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось применить адаптацию');
      const player = adaptationDraft.player;
      setAdaptationDraft(null);
      selectPlayer(player);
      setDate(todayISO());
      setPendingSaved(data.record);
      setMainSection('workouts');
      await loadTeamStatus(todayISO(), true, readinessData?.players || []);
    } catch (adaptationError) {
      setError(adaptationError.message);
    } finally {
      setAdaptationSaving(false);
    }
  }

  async function openSessionVersions(player) {
    setVersionPlayer(player);
    setSessionVersions([]);
    setVersionLoading(true);
    try {
      const response = await fetch(`/api/programs/versions?playerId=${encodeURIComponent(player.id)}&date=${todayISO()}&workspace=${encodeURIComponent(workspace)}`, { headers: { 'x-api-key': apiKey } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось загрузить версии');
      setSessionVersions(data.versions || []);
    } catch (versionError) {
      setError(versionError.message);
      setVersionPlayer(null);
    } finally {
      setVersionLoading(false);
    }
  }

  async function restoreSessionVersion(savedAt) {
    if (!versionPlayer || versionLoading) return;
    setVersionLoading(true);
    try {
      const response = await fetch('/api/programs/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId: versionPlayer.id, date: todayISO(), workspace, savedAt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось восстановить версию');
      const player = versionPlayer;
      setVersionPlayer(null);
      setSessionVersions([]);
      selectPlayer(player);
      setDate(todayISO());
      setPendingSaved(data.record);
      setMainSection('workouts');
      await loadTeamStatus(todayISO(), true, readinessData?.players || []);
    } catch (versionError) {
      setError(versionError.message);
    } finally {
      setVersionLoading(false);
    }
  }

  async function loadPlatformHealth() {
    if (!apiKey) return;
    setHealthLoading(true);
    try {
      const response = await fetch(`/api/system/health?workspace=${encodeURIComponent(workspace)}`, { headers: { 'x-api-key': apiKey } });
      const body = await response.json();
      if (response.ok) setHealthData(body);
    } catch (_) {
      setHealthData(null);
    } finally {
      setHealthLoading(false);
    }
  }

  async function sendLiveCommand() {
    if (!liveCommandPlayer || liveCommandSending) return;
    const defaults = {
      pause: 'Остановись и подойди к тренеру перед продолжением.',
      rest: 'Увеличь отдых и продолжай только после полного восстановления.',
      adjust_load: 'Снизь рабочий вес на 10% в текущем упражнении.',
      stop_exercise: 'Закончи текущее упражнение. Следующий шаг согласуй с тренером.',
      replace_exercise: liveReplacement ? `Замени текущее упражнение на: ${liveReplacement}.` : 'Замени текущее упражнение по указанию тренера.',
      message: 'Подойди к тренеру после текущего подхода.',
    };
    setLiveCommandSending(true);
    try {
      const response = await fetch('/api/programs/live-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          playerId: liveCommandPlayer.id,
          date: todayISO(),
          workspace,
          type: liveCommandType,
          message: liveCommandText.trim() || defaults[liveCommandType],
          payload: {
            percent: liveCommandType === 'adjust_load' ? -10 : null,
            seconds: liveCommandType === 'rest' ? 90 : null,
            replacement: liveCommandType === 'replace_exercise' ? liveReplacement : '',
          },
        }),
      });
      if (!response.ok) throw new Error('Команда не отправлена');
      setLiveCommandPlayer(null);
      setLiveCommandText('');
      setLiveReplacement('');
      await loadTeamStatus(todayISO(), true);
    } catch (commandError) {
      setError(commandError.message);
    } finally {
      setLiveCommandSending(false);
    }
  }

  async function createOperationsSnapshot() {
    if (snapshotLoading) return;
    setSnapshotLoading(true);
    try {
      const response = await fetch('/api/system/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ workspace }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Не удалось создать резервную копию');
      setLatestSnapshot(body.snapshot);
      await loadPlatformHealth();
    } catch (snapshotError) {
      setError(snapshotError.message);
    } finally {
      setSnapshotLoading(false);
    }
  }

  async function startRecoveryDrill() {
    if (recoveryDrillLoading) return;
    setRecoveryDrillLoading(true);
    try {
      const response = await fetch('/api/system/recovery-drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ workspace }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Контрольное восстановление не выполнено');
      setLatestRecoveryDrill(body.drill);
      await loadPlatformHealth();
    } catch (drillError) {
      setError(drillError.message);
    } finally {
      setRecoveryDrillLoading(false);
    }
  }

  async function managePlayerAccess(action) {
    if (!playerId || accessAction) return;
    setAccessAction(action);
    try {
      const response = await fetch('/api/players/share-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, workspace, action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Не удалось изменить доступ');
      if (body.token) {
        await navigator.clipboard.writeText(`${window.location.origin}/player/${body.token}`);
        setLinkCopied(playerId);
        setTimeout(() => setLinkCopied(null), 2500);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAccessAction('');
      setAccessConfirm('');
    }
  }

  async function loadMatchLoads() {
    if (!apiKey || !date) return;
    try {
      const r = await fetch(`/api/team/match-load?date=${encodeURIComponent(date)}&workspace=${encodeURIComponent(workspace)}`, {
        headers: { 'x-api-key': apiKey },
      });
      const data = await r.json();
      if (r.ok) setMatchLoads(data.loads || {});
    } catch (_) {}
  }

  async function saveMatchLoads(nextLoads) {
    if (!apiKey || !date) return;
    setMatchLoadSaving(true);
    try {
      await fetch('/api/team/match-load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ date, workspace, loads: nextLoads }),
      });
    } catch (_) {
    } finally {
      setMatchLoadSaving(false);
    }
  }

  function updateMatchLoad(playerId, status) {
    const next = { ...matchLoads };
    if (!status) delete next[playerId];
    else next[playerId] = { ...(next[playerId] || {}), status };
    setMatchLoads(next);
    saveMatchLoads(next);
  }

  // Auto-load team status when switching to 'day' tab
  useEffect(() => {
    if ((leftTab === 'day' || mainSection==='team') && players.length > 0 && apiKey) {
      loadTeamStatus();
      loadMatchLoads();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftTab, mainSection, date, workspace, players.length]);

  async function loadWarmupHistory() {
    if (!apiKey) return;
    try {
      const r = await fetch(`/api/warmup/history?workspace=${encodeURIComponent(workspace)}`, { headers: { 'x-api-key': apiKey } });
      const d = await r.json();
      if (r.ok) setWarmupHistory(d.dates || []);
    } catch (_) {}
  }

  async function loadWarmupByDate(d) {
    if (!apiKey) return;
    setWarmupDate(d);
    try {
      const r = await fetch(`/api/warmup/get?date=${encodeURIComponent(d)}&workspace=${encodeURIComponent(workspace)}`, { headers: { 'x-api-key': apiKey } });
      const data = await r.json();
      if (r.ok && data.plan) setWarmupPlan(data.plan);
    } catch (_) {}
  }

  async function generateWarmup() {
    if (!apiKey || warmupLoading) return;
    setWarmupLoading(true);
    setWarmupError('');
    setWarmupPlan(null);
    try {
      const r = await fetch('/api/warmup/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ date: warmupDate, workspace }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Ошибка генерации');
      setWarmupPlan(data.plan);
      loadWarmupHistory();
    } catch (e) {
      setWarmupError(e.message);
    } finally {
      setWarmupLoading(false);
    }
  }

  function toggleBatchPlayer(id) {
    setBatchSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllBatch() {
    if (batchSelectedIds.size === players.length) {
      setBatchSelectedIds(new Set());
    } else {
      setBatchSelectedIds(new Set(players.map(p => p.id)));
    }
  }

  async function executeTeamGeneration(selected,request={date,dayGoal,days,focus,trainingType,powerMode,strengthMode,notes,coachRecovery:recoveryStatus}) {
    if(isManualMatchDayFocus(request.focus))return {error:'Игровой праймер требует индивидуального подбора. Откройте игрока в зале.'};
    return teamQueue.start(selected,{...request,workspace,manualMethodSelection: true,autoSave:false});
  }
  async function retryFailedBatch(){await teamQueue.retry();}
  async function runBatchGeneration() {
    if(matchDayManualReview){setError('В игровой день праймер генерируется индивидуально: откройте игрока, проверьте программу и сохраните вручную. Командное автосохранение отключено.');return;}
    await executeTeamGeneration(players.filter(player=>batchSelectedIds.has(player.id)));
  }

  function rememberTeamDraft(){
    const context=activeTeamDraftRef.current;
    if(context && session && meta?.teamDraft)teamDraftEdits.current.set(teamDraftIdentity(context),{session,meta,pendingSaved,workspace,batchId:context.batchId,dirty:JSON.stringify(session)!==JSON.stringify(pendingSaved?.session)});
  }
  async function openBatchDraft(result) {
    const player=players.find(player=>String(player.id)===String(result.playerId));
    if(!player || result.workspace!==workspace)return;
    selectPlayer(player);setDate(result.date || date);setMainSection('team');setWorkspaceTab('program');setEditorPreview(false);setTeamModalOpen(true);
    const context={...result,date:result.date || date},requestId=draftOpenRequest.current,controller=new AbortController();
    activeTeamDraftRef.current=context;draftOpenController.current=controller;setTeamDraftOpening(true);setError('');
    try{
      const data=await teamQueueCall(apiKey,result.teamQueueId?'/api/programs/team-queue?'+new URLSearchParams({workspace:result.workspace,queueId:result.teamQueueId,playerId:result.playerId}):'/api/programs/get?'+new URLSearchParams({workspace:result.workspace,playerId:result.playerId,date:context.date}),{signal:controller.signal,timeoutMs:25000});
      if(requestId!==draftOpenRequest.current || controller.signal.aborted)return;
      if(!data.record)throw Error('Готовый черновик не найден. Обновите очередь.');
      const cached=teamDraftEdits.current.get(teamDraftIdentity(context));
      setPendingSaved(data.record);loadSavedRecord(data.record);
      if(cached && cached.meta.teamDraft?.version===data.record.teamDraft?.version){setSession(cached.session);setMeta(cached.meta);}
      setEditorPreview(!!result.saved);setCollapsedBlocks(new Set());
      requestAnimationFrame(()=>document.querySelector('.team-program-dialog-body')?.scrollTo({top:0}));
    }catch(error){if(requestId===draftOpenRequest.current && !controller.signal.aborted)setError(error.message);}
    finally{if(requestId===draftOpenRequest.current)setTeamDraftOpening(false);}
  }

  function closeTeamProgram(){rememberTeamDraft();draftOpenController.current?.abort();draftOpenRequest.current++;setTeamDraftOpening(false);setTeamModalOpen(false);}
  async function saveTeamCorrection(){
    const context=activeTeamDraftRef.current;if(!context || !meta?.teamDraft || !session || saving)return;
    if(!validatePlannedEdit())return;
    setSaving(true);setError('');const submitted=session;
    try{const result=await teamQueue.saveDraft(context,submitted,meta.teamDraft.version);if(!result?.record)throw Error(result?.error || 'Не удалось подтвердить сохранение черновика. Обновите очередь.');
      setPendingSaved(result.record);if(currentSaveViewRef.current.session===submitted){setSession(result.record.session);setMeta(previous=>({...previous,quality:result.record.quality,teamDraft:result.record.teamDraft}));}setJustSaved(true);
    }catch(error){setError(error.message);}finally{setSaving(false);}
  }

  async function handleGenerate(e) {
    e.preventDefault();
    if (!playerId) return;
    setLoading(true);
    setError('');
    setSession(null);
    setMeta(null);
    setWeekPlan(null);
    setJustSaved(false);
    setAutoSaved(false);
    setBatchId(null);
    startGenProgress(sessionType === 'gym');
    try {
      const fl = getFocusLabel(period, focus);

      // ── Warmup: stays synchronous ──
      if (sessionType === 'warmup') {
        const res = await fetch('/api/programs/generate-warmup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ playerId, date, dayGoal, days, focus, notes, workspace }),
        });
        let data;
        try { data = await res.json(); } catch (_) {
          throw new Error(res.status === 504
            ? 'Превышено время ожидания — попробуйте ещё раз (обычно 2-я попытка быстрее из-за кэша)'
            : 'Ошибка соединения — попробуйте ещё раз');
        }
        if (!res.ok) throw new Error(data.error || 'Ошибка генерации');
        setSession(data.session);
        setMeta({ player: data.player, dataSummary: data.dataSummary, date: data.date, dayGoal: data.dayGoal || '', focusLabel: fl, sessionType });
        setTodayWarmup(data.session);
        setShowSummary(false);
        stopGenProgress(true);
        return;
      }

      // ── Gym: OpenAI background generation path ──
      setAutoSaved(false);
      const warmupSummary = todayWarmup ? summarizeWarmupForGym(todayWarmup) : '';
      const submitRes = await fetch('/api/programs/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          playerId,
          date,
          dayGoal,
          days,
          focus,
          trainingType,
          powerMode,
          strengthMode,
          notes,
          warmupSummary,
          coachRecovery: recoveryStatus,
          workspace,
          manualMethodSelection: true,
          autoSave: false,
        }),
      });
      const submitData = await submitRes.json().catch(() => ({}));
      if (!submitRes.ok) throw new Error(submitData.error || 'Ошибка постановки в очередь');
      const nextBatchId = submitData.batchId;
      if (!nextBatchId) throw new Error('Сервер не вернул идентификатор задачи');

      setBatchId(nextBatchId);
      try {
        localStorage.setItem('pending_batch', JSON.stringify({ batchId: nextBatchId, playerId, date, focusLabel: fl }));
      } catch (_) {}
      await pollBatchResult(nextBatchId, fl);
    } catch (err) {
      setError(err.message);
      stopGenProgress(false);
      try { localStorage.removeItem('pending_batch'); } catch (_) {}
    } finally {
      setBatchId(null);
      setLoading(false);
    }
  }

  // Poll a submitted gym batch until done (or timeout). Used for fresh generation and for
  // resuming a batch saved in localStorage after a tab reload.
  async function pollBatchResult(batchId, focusLabel) {
    // Poll every 5s, up to 6 minutes (72 attempts).
    const MAX_ATTEMPTS = 72;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise(r => setTimeout(r, 5000));
      let statusData;
      try {
        const statusRes = await fetch(`/api/programs/generate-status?batchId=${encodeURIComponent(batchId)}`, {
          headers: { 'x-api-key': apiKey },
        });
        statusData = await statusRes.json();
        if (!statusRes.ok) {
          const terminalError = new Error(statusData.error || 'Ошибка проверки статуса');
          terminalError.terminal = true;
          throw terminalError;
        }
      } catch (pollErr) {
        if (pollErr?.terminal) throw pollErr;
        // Transient network blip during polling — keep trying until the attempt cap.
        continue;
      }
      if (statusData.status === 'done') {
        setSession(statusData.session);
        if (statusData.strengthMode) setStrengthMode(statusData.strengthMode);
        setMeta({ sourceState:statusData.sourceState || null,sourceCapturedAt:statusData.sourceCapturedAt || statusData.completedAt || null,player: statusData.player, dataSummary: statusData.dataSummary, date: statusData.date, dayGoal: statusData.dayGoal || '', focusLabel: statusData.session?.kind === 'restricted_day_plan' ? 'План дня · без нагрузки' : statusData.session?.kind === 'restricted_training_draft' ? 'Верх тела с ограничениями' : statusData.session?.kind === 'prehab_training_draft' ? 'Профилактика · индивидуальная программа' : focusLabel, sessionType: 'gym', quality: statusData.quality || null, focus: statusData.focus || focus, trainingType: statusData.trainingType || trainingType, strengthMode: statusData.strengthMode || null });
        setShowSummary(false);
        setAutoSaved(!!statusData.autoSaved);
        if (!isCoachReviewDraft(statusData.session) && (statusData.saveWarning || statusData.quality?.medicalReviewRequired)) {
          setError(statusData.saveWarning || statusData.quality.medicalReviewReason);
        }
        stopGenProgress(true);
        try { localStorage.removeItem('pending_batch'); } catch (_) {}
        return;
      }
      // status 'pending' → loop again
    }
    try { localStorage.removeItem('pending_batch'); } catch (_) {}
    throw new Error('Генерация заняла слишком долго, попробуйте ещё раз');
  }

  async function handleGenerateWeek() {
    if (!playerId) return;
    setWeekPlanLoading(true);
    setWeekPlan(null);
    setSession(null);
    setMeta(null);
    setError('');
    const focusList = getWeekFocuses(focus);
    const offsets = focusList.length === 4 ? [0, 2, 4, 6] : [0, 2, 4];
    const planEntries = focusList.map((item, index) => ({
      ...item,
      date: addDaysToDate(date, offsets[index] ?? index * 2),
      trainingType: defaultTrainingTypeForFocus(item.focus),
    }));
    try {
      const warmupSummary = todayWarmup ? summarizeWarmupForGym(todayWarmup) : '';
      // Generate days sequentially, accumulating used exercises so each new day avoids
      // repeating exercises from earlier days (a cohesive week, not 3 isolated days).
      const usedExercises = [];
      const results = [];
      for (let i = 0; i < planEntries.length; i++) {
        const f = planEntries[i];
        const response = await fetch('/api/programs/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({
            playerId,
            date: f.date,
            dayGoal,
            days,
            focus: f.focus,
            trainingType: f.trainingType,
            powerMode: f.focus === 'inseason_power' ? powerMode : 'auto',
            strengthMode: f.focus === 'inseason_strength' ? strengthMode : 'development',
            notes,
            warmupSummary: i === 0 ? warmupSummary : '',
            teamUsedExercises: usedExercises,
            coachRecovery: recoveryStatus,
            workspace,
            manualMethodSelection: true,
            planningMode: 'week',
            microcycleSlot: i + 1,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Тренировка ${i + 1} не прошла контроль качества`);

        // Collect this day's exercises so subsequent days don't repeat them.
        const dayExercises = (data.session?.blocks || []).flatMap(b => (b.exercises || []).map(e => e.name).filter(Boolean));
        usedExercises.push(...dayExercises);

        results.push({ ...data, planLabel: f.label, planDate: f.date });
      }
      const planItems = results.map((data, i) => ({
        session: data.session,
        player: data.player,
        date: planEntries[i].date,
        focus: data.focus || planEntries[i].focus,
        trainingType: data.trainingType || planEntries[i].trainingType,
        label: planEntries[i].label,
        quality: data.quality || null,
        saving: false,
        saved: false,
      }));
      setWeekPlan(planItems);
      setWeekPlanOpen([0]);
    } catch (err) {
      setError('Ошибка генерации плана: ' + err.message);
    } finally {
      setWeekPlanLoading(false);
    }
  }

  async function handleSaveWeekSession(idx) {
    if (!weekPlan?.[idx]?.session || weekPlan[idx].session.kind === 'restricted_day_plan') return;
    const item = weekPlan[idx];
    setWeekPlan(prev => prev.map((p, i) => i === idx ? { ...p, saving: true } : p));
    try {
      const res = await fetch('/api/programs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, date: item.date, session: item.session, player: item.player, dataSummary: '', dayGoal: item.label, focus: item.focus, trainingType: item.trainingType, trainingLabel: item.label, quality: item.quality, workspace }),
      });
      if (res.status === 401) {
        setWeekPlan(prev => prev.map((p, i) => i === idx ? { ...p, saving: false } : p));
        requestReauthentication(() => handleSaveWeekSession(idx), 'Сессия истекла. Войдите снова — тренировка будет сохранена автоматически.');
        return;
      }
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Ошибка сохранения (${res.status})`); }
      setWeekPlan(prev => prev.map((p, i) => i === idx ? { ...p, saving: false, saved: true } : p));
      // Refresh volume stats
      fetch(`/api/players/volume?playerId=${encodeURIComponent(playerId)}&days=7&workspace=${workspace}`, { headers: { 'x-api-key': apiKey } })
        .then(r => r.json()).then(setVolumeStats).catch(() => {});
    } catch (err) {
      setWeekPlan(prev => prev.map((p, i) => i === idx ? { ...p, saving: false } : p));
      setError(err.message);
    }
  }

  function loadSavedRecord(record = pendingSaved) {
    if (!record) return;
    if (record.focus) setFocus(record.focus);
    if (record.trainingType) setTrainingType(record.trainingType);
    setSessionType('gym');
    const savedStrengthMode = record.strengthMode
      || record.quality?.dose?.prescription?.strengthContext?.selectedMode
      || null;
    if (savedStrengthMode) setStrengthMode(savedStrengthMode);
    setSession(record.session);
    setMeta({
      player: record.player,
      dataSummary: record.dataSummary,
      sourceState:record.sourceState || null,sourceCapturedAt:record.sourceCapturedAt || null,
      prehabReaction: record.prehabReaction || null,
      date: record.date,
      quality: record.quality || null,
      focusLabel: record.trainingLabel || '',
      sourcePlayerId: record.sourcePlayerId || null,
      teamDraft:record.teamDraft || null,
      focus: record.focus || focus,
      trainingType: record.trainingType || trainingType,
      strengthMode: savedStrengthMode,
    });
    setError('');
  }

  function focusPlannedIssue(issue){
    if(!issue)return;setCompactSelected({bi:issue.bi,ei:issue.ei});setCollapsedBlocks(previous=>{const next=new Set(previous);next.delete(session.blocks[issue.bi].label);return next;});
    requestAnimationFrame(()=>{const label=`${issue.code} · ${issue.field}`;const input=Array.from(document.querySelectorAll('[aria-label]')).find(el=>el.getAttribute('aria-label')===label);input?.focus();input?.scrollIntoView({block:'center'});});
  }
  function validatePlannedEdit(){const first=plannedInputIssues(session)[0];if(!first)return true;setError(`${first.code}: ${first.message}`);focusPlannedIssue(first);return false;}
  async function handleSave(openNext=false) {
    if (!session || !meta || session.kind === 'restricted_day_plan' || programSaveLockRef.current || executionConfirmed) return;
    if(!validatePlannedEdit())return;
    programSaveLockRef.current = true;
    const submittedSession = session;
    const editPlayerId=programEditPlayerId(playerId,meta.sourcePlayerId);
    const isCurrentView = () => {const view=currentSaveViewRef.current; return view.workspace === workspace && view.playerId === playerId && view.date === date;};
    setSaving(true);
    try {
      const {res,data} = await saveProgramRequest({
        playerId:editPlayerId, date:meta.date, session:submittedSession, player:meta.player,
        sourceState:meta.sourceState || null,sourceCapturedAt:meta.sourceCapturedAt || null,dataSummary:meta.dataSummary, dayGoal:meta.dayGoal || '', focus:meta.focus || focus,
        trainingType:meta.trainingType || trainingType, trainingLabel:meta.focusLabel || getFocusLabel(period,focus),
        strengthMode:meta.strengthMode || strengthMode, quality:meta.quality || null, workspace,
      }, apiKey);
      if (!isCurrentView()) return;
      if (res.status === 401) {
        requestReauthentication(() => handleSave(openNext===true), 'Сессия истекла. Войдите снова — программа будет сохранена автоматически.');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения');
      pendingAuthRetryRef.current = null;
      setReauthNotice('');
      setError('');
      const unchanged = currentSaveViewRef.current.session === submittedSession;
      if (unchanged && data.session) setSession(data.session);
      const savedQuality = data.quality || meta.quality || null;
      if (unchanged && data.quality) setMeta(prev => prev ? { ...prev, quality: data.quality, focusLabel: data.trainingLabel || prev.focusLabel } : prev);
      setJustSaved(unchanged);
      void teamQueue.refresh();
      setPendingSaved({
        sourcePlayerId:editPlayerId,
        session: data.session || session,
        player: meta.player,
        dataSummary: meta.dataSummary,
        date: meta.date,
        quality: savedQuality,
        savedAt: data.savedAt || new Date().toISOString(),
        focus:meta.focus || focus, trainingType:meta.trainingType || trainingType,
        strengthMode:meta.strengthMode || strengthMode, trainingLabel:data.trainingLabel || meta.focusLabel || '',
        dayGoal:meta.dayGoal || '',
      });
      const teamContext=activeTeamDraftRef.current;
      if(teamContext && meta.teamDraft){
        const list=batchResults.filter(row=>row.status==='done' && !row.saved && row.batchId!==teamContext.batchId),index=batchResults.findIndex(row=>row.batchId===teamContext.batchId),next=batchResults.slice(index+1).find(row=>row.status==='done' && !row.saved) || list[0];
        setSavedTeamBatches(previous=>new Set([...previous,teamContext.batchId]));teamDraftEdits.current.delete(teamDraftIdentity(teamContext));
        try{localStorage.removeItem(workCopyKey({workspace,playerId,date:meta.date,queueId:meta.teamDraft.queueId,batchId:teamContext.batchId}));}catch{}
        activeTeamDraftRef.current=null;setTeamModalOpen(false);
        if(openNext===true && next)await openBatchDraft(next);
      }
      setTimeout(() => setJustSaved(false), 2500);
    } catch (err) {
      if (isCurrentView()) setError(err.message);
    } finally {
      programSaveLockRef.current = false;
      setSaving(false);
    }
  }

  async function handleRescheduleSession() {
    const fromDate = pendingSaved?.date;
    if (!fromDate || !rescheduleDate || !playerId || executionConfirmed) return;
    setRescheduling(true);
    try {
      const res = await fetch('/api/programs/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, fromDate, toDate: rescheduleDate, workspace }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось перенести тренировку');

      const record = data.record;
      setDate(rescheduleDate);
      setPendingSaved(record);
      setSession(record.session);
      setMeta(prev => ({
        ...(prev || {}),
        player: record.player,
        dataSummary: record.dataSummary,
        dayGoal: record.dayGoal || '',
        date: rescheduleDate,
      }));
      setCompliance(null);
      setJustSaved(false);
      setAutoSaved(false);
      setRescheduleOpen(false);
      setError('');
      fetch(`/api/players/volume?playerId=${encodeURIComponent(playerId)}&days=7&workspace=${workspace}`, { headers: { 'x-api-key': apiKey } })
        .then(r => r.json()).then(setVolumeStats).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setRescheduling(false);
    }
  }

  // ── Microcycle templates ──────────────────────────────────────────────────
  async function reloadTemplates() {
    if (!apiKey) return;
    try {
      const r = await fetch('/api/programs/templates', { headers: { 'x-api-key': apiKey } });
      const data = await r.json();
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (_) {}
  }

  async function handleSaveTemplate() {
    if (!session?.blocks?.length) return;
    const name = (typeof window !== 'undefined' ? window.prompt('Название шаблона:') : '')?.trim();
    if (!name) return;
    try {
      await fetch('/api/programs/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ action: 'save', name, focus, blocks: session.blocks }),
      });
      await reloadTemplates();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLoadTemplate(name) {
    try {
      const r = await fetch('/api/programs/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ action: 'load', name }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Ошибка загрузки шаблона');
      const t = data.template;
      if (t?.focus) setFocus(t.focus);
      // Drop the loaded blocks into the editable session view.
      setSession(prev => ({
        assessment: prev?.assessment || '',
        periodization_note: prev?.periodization_note || `Загружен шаблон: ${t.name}`,
        warnings: prev?.warnings || '',
        blocks: Array.isArray(t?.blocks) ? t.blocks : [],
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteTemplate(name) {
    if (!confirm(`Удалить шаблон "${name}"?`)) return;
    try {
      await fetch(`/api/programs/templates?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
      });
      await reloadTemplates();
    } catch (_) {}
  }

  // ── Plan vs Actual: complete workout ───────────────────────────────────────
  async function handleCompleteWorkout() {
    if (!session || !meta || !pendingSaved || executionConfirmed) return;
    setSavingActual(true);
    try {
      const blockFeedback = {};
      for (const block of session.blocks || []) {
        blockFeedback[block.label] = {
          rpe: block.actualRpe ?? null,
          pain: !!block.pain,
          note: block.feedbackNote || '',
        };
      }
      const exercises = (session.blocks || []).flatMap(b =>
        (b.exercises || []).map(ex => ({
          block: b.label,
          name: ex.name,
          plannedKg: parseFloat(ex.weightKg ?? parseKgFromNote(ex.weightNote)) || 0,
          actualKg: parseFloat(ex.actualKg) || 0,
          loadUnits: loadUnitsForExercise(ex),
          actualRpe: ex.actualRpe ?? null,
          pain: !!b.pain,
          sets: (ex.targetSets || []).length || parseInt(ex.sets, 10) || 3,
          reps: parseInt((ex.targetSets || [])[0], 10) || parseInt(ex.reps, 10) || 8,
          totalReps: (ex.targetSets || []).reduce((total, set) => total + targetSetReps(set), 0) || ((parseInt(ex.sets, 10) || 3) * (parseInt(ex.reps, 10) || 8)),
          completed: (parseFloat(ex.actualKg) || 0) > 0,
        }))
      );
      const res = await fetch('/api/programs/save-actual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, date: meta.date, workspace, exercises, blockFeedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      const plannedTonnage = exercises.reduce((s, e) => s + e.plannedKg * e.loadUnits * e.totalReps, 0);
      setCompliance({ percent: data.compliance, actualTonnage: data.actualTonnage, plannedTonnage: Math.round(plannedTonnage) });
      const names = exercises.map(e => e.name).filter(Boolean);
      if (names.length) {
        fetch('/api/players/progression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ playerId, names, workspace }),
        }).then(r => r.json()).then(d => setProgressionMap(d.progression || {})).catch(() => {});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingActual(false);
    }
  }

  // ── Player contraindications ───────────────────────────────────────────────
  async function toggleRestriction(id) {
    if (!playerId) return;
    const next = restrictions.includes(id)
      ? restrictions.filter(r => r !== id)
      : [...restrictions, id];
    setRestrictions(next);
    try {
      await fetch('/api/player/restrictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, restrictions: next, workspace }),
      });
    } catch (_) {}
  }

  async function saveDevelopmentPlan() {
    if (!playerId || developmentPlanSaving) return;
    setDevelopmentPlanSaving(true);
    setDevelopmentPlanSaved(false);
    try {
      const response = await fetch('/api/players/development-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, workspace, plan: developmentPlan }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить план');
      setDevelopmentPlan(data.plan || developmentPlan);
      setDevelopmentPlanSaved(true);
      setTimeout(() => setDevelopmentPlanSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setDevelopmentPlanSaving(false);
    }
  }

  function updateExercise(blockIdx, exIdx, patch) {
    if(executionConfirmed || saving)return;
    const before=session?.blocks?.[blockIdx]?.exercises?.[exIdx];if(!before)return;
    setExerciseUndo(previous=>({...previous,[`${blockIdx}:${exIdx}`]:[...(previous[`${blockIdx}:${exIdx}`] || []).slice(-19),before]}));
    setJustSaved(false);setAutoSaved(false);
    setSession(prev=>({...prev,blocks:prev.blocks.map((b,bi)=>bi!==blockIdx?b:{...b,exercises:b.exercises.map((ex,ei)=>ei!==exIdx?ex:{...replaceExerciseDescription(ex,patch),...(patch.name && patch.cue?{cue:patch.cue}:{})})})}));
  }
  function undoExercise(bi,ei){
    const key=`${bi}:${ei}`,stack=exerciseUndo[key];if(!stack?.length || saving || executionConfirmed)return;
    setSession(prev=>({...prev,blocks:prev.blocks.map((b,index)=>index!==bi?b:{...b,exercises:b.exercises.map((ex,index)=>index!==ei?ex:stack.at(-1))})}));
    setExerciseUndo(previous=>({...previous,[key]:stack.slice(0,-1)}));setJustSaved(false);setAutoSaved(false);
  }

  function applyProgressionRecommendations() {
    setSession(previous => ({
      ...previous,
      blocks: (previous.blocks || []).map(block => ({
        ...block,
        exercises: (block.exercises || []).map(ex => {
          const identity = ex.exerciseId || canonicalExerciseId(ex.name);
          if((meta?.focus || focus)==='inseason_strength')return applyStrengthCardProposal(ex,progressionMap[strengthProgressionKey(ex)],strengthProgressionScope({workspace,playerId,date:meta?.date || date,focus:'inseason_strength',trainingType:meta?.trainingType || trainingType,strengthMode:meta?.strengthMode || strengthMode}));
          const recommendation = progressionMap[identity] || progressionMap[ex.name];
          if (!recommendation?.suggestedKg || recommendation.pain) return { ...ex, exerciseId: identity };
          return {
            ...ex,
            exerciseId: identity,
            weightKg: recommendation.suggestedKg,
            weightNote: `${recommendation.suggestedKg} кг`,
          };
        }),
      })),
    }));
  }

  function updateBlock(blockIdx, patch) {
    setSession(prev => ({
      ...prev,
      blocks: prev.blocks.map((b, bi) => (bi !== blockIdx ? b : { ...b, ...patch })),
    }));
  }

  function removeBlock(blockIdx) {
    if (saving || !session?.blocks?.[blockIdx]) return;
    const before = session;
    const block = before.blocks[blockIdx];
    const blocks = before.blocks.filter((_, index) => index !== blockIdx);
    let after = { ...before, blocks };
    if (before.methodology?.timing) {
      const timedBlocks = blocks.every(item => Number.isFinite(item.plannedMinutes));
      const minutes = blocks.length === 0 ? 0 : timedBlocks
        ? blocks.reduce((sum, item) => sum + item.plannedMinutes, 0)
        : before.methodology.version === 'inseason-strength-v2-2026-10' ? estimateStrengthMinutes(after) : null;
      after = { ...after, methodology: { ...before.methodology, coachEditedBlocks: true,
        ...(before.methodology.activeSeconds != null ? { activeSeconds: blocks.flatMap(item => item.exercises || []).reduce((sum, ex) => sum + (ex.activeSecondsPerSet || 0) * (ex.targetSets || []).length, 0) } : {}),
        timing: { ...before.methodology.timing, ...(minutes != null ? { plannedMainMinutes: minutes, estimatedMainMinutes: minutes } : {}) },
      } };
    }
    setRemovedBlock({ before, after, label: block.label || blockIdx + 1 });
    setSession(after);
    setAddExBlock(null);
    setJustSaved(false);
    setAutoSaved(false);
  }

  function undoRemoveBlock() {
    if (!removedBlock || saving) return;
    setSession(removedBlock.before);
    setRemovedBlock(null);
    setJustSaved(false);
    setAutoSaved(false);
  }

  async function regenerateExercise(blockIdx, exIdx) {
    const originalExercise = session?.blocks?.[blockIdx]?.exercises?.[exIdx];
    const sessionDate = meta?.date || date;
    if (!session || !originalExercise || !sessionDate) throw new Error('Сначала откройте программу игрока');
    const res = await fetch('/api/programs/regenerate-exercise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        playerId,
        date: sessionDate,
        blockIndex: blockIdx,
        exerciseIndex: exIdx,
        workspace,
        session,
        focus:meta?.focus || focus,
        trainingType:meta?.trainingType || trainingType,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка генерации');
    if (data.exercise) {
      if(currentSaveViewRef.current.session?.blocks?.[blockIdx]?.exercises?.[exIdx]===originalExercise)updateExercise(blockIdx,exIdx,data.exercise);
    }
  }

  function updateSet(bi,ei,si,value){const ex=session.blocks[bi].exercises[ei];updateExercise(bi,ei,{targetSets:ex.targetSets.map((s,i)=>i===si?value:s)});}
  function addSetRow(bi,ei){const sets=session.blocks[bi].exercises[ei].targetSets || [];updateExercise(bi,ei,{targetSets:[...sets,sets.at(-1) || '']});}
  function removeSetRow(bi,ei,si){const sets=session.blocks[bi].exercises[ei].targetSets || [];if(sets.length>1)updateExercise(bi,ei,{targetSets:sets.filter((_,i)=>i!==si)});}

  function saveScheduleToServer(events) {
    if (!apiKey) return;
    fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ events, workspace }),
    }).catch(() => {});
  }

  function toggleScheduleDay(day) {
    const current = scheduleEvents.find(e => e.date === day)?.type;
    const next = !current ? 'game' : current === 'game' ? 'travel' : null;
    const updated = scheduleEvents.filter(e => e.date !== day);
    if (next) updated.push({ date: day, type: next });
    updated.sort((a, b) => a.date.localeCompare(b.date));
    setScheduleEvents(updated);
    saveScheduleToServer(updated);
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (!loginSecret || loginSubmitting) return;
    setLoginSubmitting(true);
    setLoginError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainerKey: loginSecret }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Ошибка авторизации (${response.status})`);
      setLoginSecret('');
      setLoginError('');
      setReauthNotice('');
      setApiKey('session');
    } catch (loginFailure) {
      setLoginError(loginFailure.message || 'Не удалось войти');
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    pendingAuthRetryRef.current = null;
    setReauthNotice('');
    setApiKey('');
    setPlayers([]);
    setPlayerId('');
    setSession(null);
  }

  function requestReauthentication(retry = null, message = 'Сессия истекла. Войдите снова, чтобы продолжить.') {
    if (retry) pendingAuthRetryRef.current = retry;
    setReauthNotice(message);
    setLoginError('');
    setApiKey('');
  }

  useEffect(() => {
    if (apiKey !== 'session' || !pendingAuthRetryRef.current) return undefined;
    const retry = pendingAuthRetryRef.current;
    pendingAuthRetryRef.current = null;
    const timer = setTimeout(() => Promise.resolve(retry()).catch(error => setError(error.message || 'Не удалось повторить сохранение')), 0);
    return () => clearTimeout(timer);
  }, [apiKey]);

  if (authChecking) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#060c15] text-slate-300">
        <Head><title>Korenchuk Performance System</title></Head>
        <div className="flex items-center gap-3 text-sm font-semibold">
          <Loader2 size={18} className="animate-spin text-emerald-300" />
          Проверка защищённой сессии…
        </div>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <>
        <Head>
          <title>Вход · Korenchuk Performance System</title>
          <meta name="robots" content="noindex,nofollow" />
        </Head>
        <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#060c15] px-4 text-slate-100">
          <div className="pointer-events-none absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-emerald-400/[0.08] blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-48 -right-40 h-[520px] w-[520px] rounded-full bg-cyan-400/[0.07] blur-[120px]" />
          <form onSubmit={handleLogin} className="relative w-full max-w-md rounded-[30px] border border-white/[0.09] bg-[#0b141f]/95 p-7 shadow-[0_35px_100px_-30px_rgba(0,0,0,0.9)] sm:p-9">
            <div className="mb-7 flex items-center gap-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/nk-logo.jpg" alt="NK" className="h-12 w-12 rounded-2xl object-cover ring-1 ring-emerald-300/35" />
              <div>
                <div className="text-[15px] font-black tracking-tight text-white">Nikolay Korenchuk</div>
                <div className="mt-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">Performance System</div>
              </div>
            </div>
            <div className="mb-6">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-300">
                <Shield size={19} />
              </div>
              <h1 className="text-xl font-black text-white">Защищённый вход</h1>
              <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">Введите ключ тренера. Он используется один раз и не сохраняется в браузере.</p>
            </div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500" htmlFor="trainer-key">Ключ доступа</label>
            {reauthNotice && (
              <div className="mb-3 mt-2 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-amber-100">
                <Shield size={14} className="mt-0.5 shrink-0" /> {reauthNotice}
              </div>
            )}
            <input
              id="trainer-key"
              type="password"
              value={loginSecret}
              onChange={event => setLoginSecret(event.target.value)}
              autoComplete="current-password"
              autoFocus
              maxLength={512}
              className="mt-2 w-full rounded-2xl border border-white/[0.10] bg-black/25 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-300/10"
              placeholder="••••••••••••"
            />
            {loginError && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2.5 text-[12px] text-rose-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {loginError}
              </div>
            )}
            <button
              type="submit"
              disabled={!loginSecret || loginSubmitting}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-4 py-3.5 text-[12px] font-black text-[#061116] shadow-[0_16px_36px_-18px_rgba(52,211,153,0.9)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loginSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Shield size={15} />}
              {loginSubmitting ? 'Проверка…' : 'Войти в систему'}
            </button>
          </form>
        </main>
      </>
    );
  }

  const teamQueuePanel = <div id="coach-team-drafts"><TeamQueueReview queue={teamQueue.queue} results={batchResults} running={batchRunning} recovering={teamQueue.recovering} error={teamQueue.error} onOpen={openBatchDraft} onRetry={retryFailedBatch} onRefreshPlayer={teamQueue.refreshPlayer} onResume={teamQueue.resume} onRefresh={teamQueue.refresh} onReview={teamQueue.review} onPause={teamQueue.pause} onCancel={teamQueue.cancel} onCheckPublication={teamQueue.checkPublication} onPublish={teamQueue.publish} workspace={workspace} apiKey={apiKey} unsavedEdits={teamPendingEdits}/></div>;
    const savedProgram = session && meta && (
            <div inert={saving || undefined} data-preview={editorPreview || !!executionConfirmed} className="premium-session-card coach-session-workspace mt-7 animate-fade-in rounded-3xl border border-white/[0.10] p-5 backdrop-blur-xl sm:p-7 print:border-none print:bg-white print:p-0 print:shadow-none">

              {/* Result toolbar */}
              <div className="coach-editor-toolbar mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden" role="region" aria-label="Сохранение программы">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-base font-black tracking-tight text-white">Тренировка</h2>
                  <span className="rounded-full border border-accent/25 bg-accent/[0.09] px-3 py-1 text-xs font-semibold text-accent">
                    {meta.player?.name}
                  </span>
                  <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-500">
                    {meta.date}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="coach-editor-view-toggle" aria-pressed={editorPreview} disabled={executionConfirmed} onClick={()=>setEditorPreview(value=>!value)} title={editorPreview?'Перейти к редактированию':'Просмотреть программу без полей ввода'}>{editorPreview?<>{PENCIL_ICON}<span>Редактировать</span></>:<><BookOpen size={14}/><span>Просмотр</span></>}</button>
                  {/* Secondary actions */}
                  <div className="coach-editor-secondary" data-open={editorActionsOpen}>
                  <button type="button" className="coach-editor-more" aria-label="Дополнительные действия программы" aria-expanded={editorActionsOpen} onClick={()=>setEditorActionsOpen(value=>!value)}>•••</button>
                  <div className="coach-editor-secondary-items flex items-center rounded-xl border border-white/[0.07] bg-white/[0.025] p-1 gap-0.5">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className={`grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-200 ${focusRing}`}
                      title="Печать"
                    >
                      <Printer size={14} />
                    </button>
                    {session?.blocks?.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSaveTemplate}
                        className={`grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-200 ${focusRing}`}
                        title="Сохранить как шаблон микроцикла"
                      >
                        <Layers size={14} />
                      </button>
                    )}
                    {(justSaved || autoSaved || pendingSaved) && (
                      <button
                        type="button"
                        onClick={() => {setCopyWorkspace(workspace==='zarechie'?'nkperf':'zarechie');setCopyDate(date); setCopyKeepExact(false);setCopyError('');setCopyModalOpen(true);}}
                        className={`grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-200 ${focusRing}`}
                        title="Скопировать тренировку другому игроку"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                    {pendingSaved && !executionConfirmed && (
                      <button
                        type="button"
                        onClick={() => {
                          const minimum = rescheduleEarliestDate(pendingSaved.date);
                          setRescheduleDate(current => current && current >= minimum ? current : minimum);
                          setRescheduleOpen(open => !open);
                        }}
                        className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-200 ${focusRing}`}
                        title="Перенести невыполненную тренировку"
                      >
                        <CalendarRange size={14} />
                        Перенести
                      </button>
                    )}
                  </div>
                  </div>
                  {/* Primary save */}
                  <button
                    type="button"
                    onClick={()=>handleSave()}
                    aria-label="Сохранить программу"
                    disabled={saving || executionConfirmed || plannedIssues.length>0 || session.kind === 'restricted_day_plan'}
                    title={session.kind === 'restricted_day_plan' ? 'План дня не заменяет тренировку игрока' : undefined}
                    className={`flex items-center gap-1.5 rounded-xl bg-cyan-500 px-3.5 py-2 text-xs font-bold text-[#04212b] shadow-[0_2px_12px_-2px_rgba(34,211,238,0.35)] transition hover:bg-cyan-400 disabled:opacity-50 ${focusRing}`}
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    <span className="coach-save-label-long">{saving?'Сохранение…':justSaved ? 'Сохранено ✓' : (autoSaved || pendingSaved ? 'Сохранить изменения' : 'Сохранить программу')}</span><span className="coach-save-label-short">{saving?'Сохраняю…':justSaved?'Сохранено':'Сохранить'}</span>
                  </button>
                  {pendingSaved && session && (
                    <button
                      type="button"
                      onClick={handleCompleteWorkout}
                      aria-label={executionConfirmed?"Тренировка уже выполнена":"Завершить тренировку"}
                      title={executionConfirmed?"Выполнение подтверждено по журналу игрока":"Завершить тренировку"}
                      disabled={savingActual || executionConfirmed}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      {savingActual ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      <span className="coach-complete-label">{executionConfirmed?"Выполнена":"Завершить"}</span>
                    </button>
                  )}
                </div>
              </div>

              {executionConfirmed && <p className="coach-execution-confirmed" role="status">Тренировка выполнена · {playerExecution.totalSets} / {playerExecution.totalSets} подходов · {new Date(playerExecution.completedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})} МСК. Исходный план защищён: редактирование, сохранение и перенос отключены. Факты дополняются отдельно в истории.</p>}
              <ProgramOverview readOnly={!!executionConfirmed} blocks={session.blocks || []} title={meta.focusLabel || getFocusLabel(period,focus)} preview={editorPreview || !!executionConfirmed} onPreview={value=>{if(!executionConfirmed)setEditorPreview(value);}} onNavigate={index=>{
                const block=session.blocks[index];setCompactSelected({bi:index,ei:0});setCollapsedBlocks(previous=>{const next=new Set(previous);next.delete(block.label);return next;});
                requestAnimationFrame(()=>document.getElementById('coach-program-block-'+index)?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
              }}/>

              {!editorPreview && !executionConfirmed && pendingSaved?.session && meta.date===date && <ProgramWorkCopy key={workCopyKey({workspace,playerId,date,queueId:meta.teamDraft?.queueId,batchId:activeTeamDraftRef.current?.batchId})} context={{workspace,playerId,date,queueId:meta.teamDraft?.queueId,batchId:activeTeamDraftRef.current?.batchId}} record={pendingSaved} session={session} onRestore={setSession}/>}
              {!editorPreview && !executionConfirmed && <div className="coach-editor-layout-choice"><button type="button" aria-pressed={editorCompact} onClick={()=>setEditorCompact(true)}>Таблица · быстрая коррекция</button><button type="button" aria-pressed={!editorCompact} onClick={()=>setEditorCompact(false)}>Все карточки</button>{plannedIssues.length>0 && <button type="button" className="coach-field-warning" onClick={()=>focusPlannedIssue(plannedIssues[0])}>Проверить поля · {plannedIssues.length}</button>}</div>}
              {rescheduleOpen && pendingSaved && (
                <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3.5 print:hidden">
                  <div className="flex items-start gap-2.5">
                    <CalendarRange size={15} className="mt-0.5 shrink-0 text-amber-300" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-amber-200">Перенести тренировку</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-amber-100/60">
                        Программа будет перенесена без изменения упражнений. Выполненную тренировку перенести нельзя.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div className="min-w-[190px] flex-1">
                      <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-amber-200/55">Новая дата</div>
                      <DatePicker
                        value={rescheduleDate}
                        onChange={setRescheduleDate}
                        minDate={rescheduleEarliestDate(pendingSaved.date)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRescheduleSession}
                      disabled={rescheduling || !rescheduleDate}
                      className="flex items-center gap-1.5 rounded-xl bg-amber-300 px-3.5 py-2.5 text-xs font-black text-[#181108] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {rescheduling ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                      Перенести
                    </button>
                  </div>
                </div>
              )}

              {/* Plan vs Actual compliance summary */}
              {compliance && (
                <div className="mt-3 mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2.5 text-[11px] animate-fade-in print:hidden">
                  <span className="font-black text-emerald-400 text-[15px]">{compliance.percent}%</span>
                  <span className="text-slate-500">выполнено</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">план <span className="text-slate-200 font-semibold">{Math.round(compliance.plannedTonnage / 1000 * 10) / 10}т</span></span>
                  <span className="text-slate-600">→</span>
                  <span className="text-slate-400">факт <span className={`font-semibold ${compliance.actualTonnage / compliance.plannedTonnage < 0.8 ? 'text-rose-400' : 'text-emerald-400'}`}>{Math.round(compliance.actualTonnage / 1000 * 10) / 10}т</span></span>
                </div>
              )}

              <details className="coach-correction-context" open={editorPreview || !!executionConfirmed || undefined}><summary>Проверки и история нагрузки</summary>
              {generationQuality.length > 0 && (
              <details className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 print:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={12} className="text-emerald-400" />
                      <span className="text-[10px] font-black uppercase tracking-[0.20em] text-slate-500">Проверки структуры программы</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-600">
                      {generationQuality.filter(i => i.ok).length}/{generationQuality.length}
                    </span>
                  </summary>
                  <p className="mt-2 text-xs text-slate-300">Число пройденных автоматических проверок ниже. Перед назначением тренер проверяет метод, точный вариант упражнения, дозу, симптомы и медицинские противопоказания. Это не оценка допуска.</p><div className="mt-2.5 flex flex-wrap gap-1.5">
                    {generationQuality.map(item => (
                      <div
                        key={item.label}
                        className={`rounded-lg border px-2 py-1 ${qualityTone(item.ok)}`}
                        title={item.detail}
                      >
                        <span className="text-[10px] font-bold">{item.ok ? '✓' : '!' } {item.label}</span>
                        <span className="ml-1 text-[10px] opacity-70">{item.detail}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {pendingSaved?.savedAt && Number.isFinite(Date.parse(pendingSaved.savedAt)) && <p className="coach-source-snapshot">Обоснование ниже — снимок при сохранении {new Date(pendingSaved.savedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})} МСК. Текущие данные ReadySix показаны в настройках нового черновика; изменения после сохранения не переписывают исходный план.</p>}
              {pendingSaved && decisionData?.source==='ReadySix' && <details className="coach-source-comparison"><summary>Сравнить текущий источник с обоснованием программы</summary><SourceComparison previous={meta?.sourceState} current={decisionData.sourceState} savedAt={meta?.sourceCapturedAt} checkedAt={decisionData.checkedAt}/><div><section><h3>При сохранении · {coachDate(pendingSaved.date)}</h3><p>{session.assessment || 'Обоснование не записано в этой версии.'}</p></section><section><h3>Текущий источник · {coachDate(decisionData.targetDate || date)}</h3><p>{decisionData.recommendation?.state?.detail || decisionData.decision?.detail || 'Подробности не переданы.'}</p></section></div><p>Тексты из разных моментов времени. Изменение формулировок само по себе не подтверждает изменение состояния или допуска; решение проверяется в ReadySix.</p></details>}
              {/* Volume stats bar */}
              {volumeStats && volumeStats.sessions > 0 && (
                <div className="mb-4 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-2.5 print:hidden">
                  <div className="mb-2.5 flex items-center gap-2">
                    <BarChart2 size={10} className="text-slate-600" />
                    <span className="text-[9px] font-black uppercase tracking-[0.20em] text-slate-600">Объём за 7д</span>
                    <span className="ml-auto text-[9px] text-slate-700">{volumeStats.sessions} сессий</span>
                  </div>
                  <div className="flex items-end gap-3">
                    {['A', 'B', 'C', 'D', 'E'].map(label => {
                      const val = volumeStats.byBlock[label];
                      if (!val) return null;
                      const bc = blockCfg(label);
                      const maxVal = Math.max(...['A','B','C','D','E'].map(l => volumeStats.byBlock[l] || 0));
                      const pct = Math.max(8, Math.round((val / maxVal) * 100));
                      return (
                        <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-400 tabular-nums">{val}</span>
                          <div className="relative h-8 w-full max-w-[34px] overflow-hidden rounded-md bg-white/[0.04]">
                            <div className={`absolute inset-x-0 bottom-0 rounded-md ${bc.circle} transition-all duration-500`} style={{ height: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] font-black text-slate-500">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {continuitySummary.known > 0 && (
                <section className="mb-5 rounded-2xl border border-cyan-300/[0.14] bg-gradient-to-r from-cyan-300/[0.065] to-emerald-300/[0.035] p-4 print:hidden" aria-label="Преемственность нагрузки">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-200/15 bg-cyan-300/10 text-cyan-200">
                      <TrendingUp size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/65">Преемственность нагрузки</div>
                      <p className="mt-1 text-[12px] text-slate-300">
                        История найдена для {continuitySummary.known} упражнений · рекомендаций {continuitySummary.recommendations}
                        {continuitySummary.pain > 0 ? ` · ${continuitySummary.pain} с ограничением по боли` : ''}
                      </p>
                    </div>
                    {continuitySummary.recommendations > 0 && !editorPreview && (
                      <button
                        type="button"
                        onClick={applyProgressionRecommendations}
                        className="min-h-11 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3.5 py-2 text-[11px] font-bold text-cyan-100 transition hover:bg-cyan-300/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                      >
                        Применить безопасные рекомендации
                      </button>
                    )}
                  </div>
                </section>
              )}

              </details>
              {/* Assessment */}
              {(session.assessment || session.periodization_note) && (
                <div className="mb-5 grid gap-3 lg:grid-cols-2 print:hidden">
                {session.assessment && (
                <div className="overflow-hidden rounded-xl border border-accent/[0.16] bg-accent/[0.05]">
                  <div className="flex gap-0">
                    <div className="w-1 shrink-0 bg-accent/40" />
                    <div className="px-4 py-3.5">
                      <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-accent/60">Оценка состояния</div>
                      <p className="text-[13px] leading-relaxed text-slate-200">{session.assessment}</p>
                    </div>
                  </div>
                </div>
                )}
                {session.periodization_note && (
                <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
                  <div className="flex gap-0">
                    <div className="w-1 shrink-0 bg-slate-600/50" />
                    <div className="px-4 py-3.5">
                      <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-slate-600">Логика периодизации</div>
                      <p className="text-[13px] leading-relaxed text-slate-400">{session.periodization_note}</p>
                    </div>
                  </div>
                </div>
                )}
                </div>
              )}

              {/* Camp methodology violations */}
              {methodViolations.length > 0 && (
                <div className="mb-4 rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-4 print:hidden">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle size={13} className="text-rose-400" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-rose-400">Нарушение методики сборов</span>
                  </div>
                  <div className="space-y-1">
                    {methodViolations.map((v, i) => (
                      <p key={i} className="text-[12px] text-rose-300/80">· {v.name} — запрещён в фазе сборов ({v.label})</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Recovery status warning */}
              {recoveryStatus === 'yellow' && (
                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2.5 print:hidden">
                  <AlertTriangle size={13} className="shrink-0 text-amber-400" />
                  <span className="text-[12px] font-bold text-amber-300">Объём −25% · умеренная нагрузка</span>
                </div>
              )}
              {recoveryStatus === 'red' && (
                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-2.5 print:hidden">
                  <AlertTriangle size={13} className="shrink-0 text-rose-400" />
                  <span className="text-[12px] font-bold text-rose-300">Только тонус · профилактика · без тяжёлого</span>
                </div>
              )}


              {/* Volume stats bar */}
              {sessionVolume && (
                <div className="coach-program-dose-summary mb-6 flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 print:hidden">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Упр.</span>
                    <span className="text-[18px] font-black text-slate-200">{sessionVolume.exCount}</span>
                  </div>
                  <div className="h-6 w-px bg-white/[0.06]" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Подх.</span>
                    <span className="text-[18px] font-black text-slate-200">{sessionVolume.sets}</span>
                  </div>
                  {sessionVolume.tonnes && (
                    <>
                      <div className="h-6 w-px bg-white/[0.06]" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Тоннаж</span>
                        <span className="text-[18px] font-black text-accent">~{sessionVolume.tonnes}т</span>
                      </div>
                    </>
                  )}
                  {jumpVolume && (
                    <>
                      <div className="h-6 w-px bg-white/[0.06]" />
                      <div className={`flex items-center gap-1.5 ${jumpVolume.sets > 12 ? 'text-amber-400' : ''}`}>
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Прыжки</span>
                        <span className={`text-[18px] font-black ${jumpVolume.sets > 12 ? 'text-amber-400' : 'text-slate-200'}`}>{jumpVolume.sets}</span>
                        <span className="text-[10px] text-slate-700">под.</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* High jump volume warning */}
              {jumpVolume && jumpVolume.sets > 12 && (
                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-2.5 print:hidden">
                  <Zap size={13} className="shrink-0 text-amber-400" />
                  <div>
                    <span className="text-[12px] font-bold text-amber-300">Высокий прыжковый объём</span>
                    <span className="ml-2 text-[11px] text-amber-400/70">{jumpVolume.exCount} упр. · {jumpVolume.sets} под. — проверь суставную нагрузку</span>
                  </div>
                </div>
              )}

              {removedBlock && (
                <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 text-sm text-amber-200 print:hidden">
                  <span>Блок {removedBlock.label} удалён вместе с упражнениями. Нажмите «Сохранить изменения», чтобы сохранить программу.</span>
                  <button type="button" onClick={undoRemoveBlock} disabled={saving} className={`shrink-0 rounded-lg border border-amber-300/30 px-3 py-2 font-semibold disabled:opacity-40 ${focusRing}`}>Отменить удаление</button>
                </div>
              )}

              {/* Blocks — screen only */}
              <div className={!editorPreview && !executionConfirmed && editorCompact?'coach-compact-layout':'coach-full-layout'}>
              {!editorPreview && !executionConfirmed && editorCompact && <CompactProgramEditor blocks={session.blocks || []} onChange={updateExercise} selected={compactSelected} onInspect={(bi,ei)=>{setCompactSelected({bi,ei});setCollapsedBlocks(new Set());}}/>}
              <div className="space-y-8 print:hidden coach-compact-detail">
                {(session.blocks || []).map((block, bi) => (
                  <div hidden={!editorPreview && !executionConfirmed && editorCompact && compactSelected.bi!==bi} id={`coach-program-block-${bi}`} className="coach-program-block" key={block.blockId || block.label || bi}>
                    {(() => {
                      const bc = blockCfg(block.label);
                      const isCollapsed = collapsedBlocks.has(block.label);
                      return (
                        <div className="coach-program-block-header">
                        <div className="coach-program-block-heading flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggleBlock(block.label)}
                          className={`flex min-w-0 flex-1 items-center gap-3.5 text-left rounded-xl py-1 transition-opacity hover:opacity-90 ${focusRing}`}
                        >
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bc.circle} text-base font-black text-[#04212b] ring-1 ring-inset ring-white/20`}>
                            {block.label}
                          </span>
                          <div className="min-w-0">
                            <div className={`text-[11px] font-black uppercase tracking-[0.18em] ${bc.sub}`}>Блок {block.label}</div>
                          </div>
                          {isCollapsed && (
                            <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                              {(block.exercises || []).length} упр.
                            </span>
                          )}
                          <div className={`h-px flex-1 bg-gradient-to-r ${bc.line} to-transparent`} />
                          <span className="shrink-0 grid h-7 w-7 place-items-center rounded-lg text-slate-600 transition hover:text-slate-300 print:hidden">
                            {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                          </span>
                        </button>
                        <button type="button" onClick={() => removeBlock(bi)} disabled={saving}
                          aria-label={`Удалить блок ${block.label || bi + 1}`}
                          title="Удалить блок вместе со всеми упражнениями"
                          className={`coach-edit-only flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-rose-400/20 px-3 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-40 ${focusRing}`}>
                          <X size={14} /><span className="hidden sm:inline">Удалить блок</span>
                        </button>
                        </div>
                        {block.rest_note && <p className="coach-program-block-order">⏱ {block.rest_note}</p>}
                        </div>
                      );
                    })()}
                    {!collapsedBlocks.has(block.label) && (
                    <div className="coach-exercise-grid">
                      {(block.exercises || []).map((ex, ei) => {
                        if(!editorPreview && !executionConfirmed && editorCompact && compactSelected.ei!==ei)return null;
                        const identity = ex.exerciseId || canonicalExerciseId(ex.name);
                        const progression = (meta?.focus || focus)==='inseason_strength'?progressionMap[strengthProgressionKey(ex)] || {}:progressionMap[identity] || progressionMap[ex.name] || {};
                        const exerciseHistory = exHistoryMap[identity] || exHistoryMap[ex.name] || [];
                        return (
                        <ExerciseCard
                          key={ex.code || ei}
                          apiKey={apiKey}
                          preview={editorPreview || !!executionConfirmed}
                          code={ex.code}
                          name={prehabEnglishName(ex.name)}
                          targetSets={ex.targetSets || []}
                          weightNote={ex.weightNote || ''}
                          weightKg={ex.weightKg != null ? ex.weightKg : parseKgFromNote(ex.weightNote)}
                          loadEvidence={ex.loadEvidence}
                          targetRpeMax={ex.targetRpeMax}
                          loadUnits={loadUnitsForExercise(ex)}
                          tempo={ex.tempo || ''}
                          prehabRegion={ex.prehabRegion}
                          autoReg={ex.autoReg || ''}
                          alternatives={ex.alternatives || []}
                          cue={ex.cue || ''}
                          descriptionOverride={ex.descriptionOverride}
                          descriptionExerciseId={ex.descriptionExerciseId}
                          compactDescription={ex.compactDescription}
                          controlledExecution={ex.controlledExecution}
                          preserveStoredDescription={!!pendingSaved && !pendingSaved.draft}
                          focus={meta?.focus || focus}
                          progressionLoading={progressionLoading}
                          onRetryProgression={()=>{setProgressionMap({});setProgressionError('');setProgressionLoading(true);setProgressionRefresh(value=>value+1);}}
                          progressionError={progressionError}
                          strengthProposal={(meta?.focus || focus)==='inseason_strength'?progressionMap[strengthProgressionKey(ex)]:null}
                          onApplyStrengthProgression={()=>{const proposed=applyStrengthCardProposal(ex,progressionMap[strengthProgressionKey(ex)],strengthProgressionScope({workspace,playerId,date:meta?.date || date,focus:'inseason_strength',trainingType:meta?.trainingType || trainingType,strengthMode:meta?.strengthMode || strengthMode}));if(proposed!==ex)updateExercise(bi,ei,proposed);}}
                          week={weekFromFocus(focus)}
                          oneRM={oneRM}
                          position={selectedPlayer?.position || null}
                          prevKg={progression.kg || null}
                          prevRpe={progression.rpe || null}
                          prevPain={progression.pain || false}
                          suggestedKg={progression.suggestedKg || null}
                          progressionDecision={progression.decision || ''}
                          progressionConfidence={progression.confidence || ''}
                          progressionTrend={progression.trend || ''}
                          restrictions={restrictions}
                          exHistory={exerciseHistory}
                          actualKg={ex.actualKg ?? null}
                          onActualKgChange={pendingSaved && !pendingSaved.draft ? (v => updateExercise(bi, ei, { actualKg: v })) : undefined}
                          actualRpe={ex.actualRpe ?? null}
                          onActualRpeChange={pendingSaved && !pendingSaved.draft ? (v => updateExercise(bi, ei, { actualRpe: v })) : undefined}
                          replacementFrom={ex.replacementFrom}
                          replacementReason={ex.replacementReason}
                          replacementNote={ex.replacementNote}
                          onChangeReplacementReason={v => updateExercise(bi, ei, { replacementReason: v })}
                          onChangeReplacementNote={v => updateExercise(bi, ei, { replacementNote: v })}
                          onChangeName={(v,cue) => updateExercise(bi, ei, { name: v,...cue?{cue}:{} })}
                          onUndo={exerciseUndo[`${bi}:${ei}`]?.length?()=>undoExercise(bi,ei):null}
                          onChangeSet={(si, v) => updateSet(bi, ei, si, v)}
                          onChangeSets={targetSets=>updateExercise(bi,ei,{targetSets})}
                          onAddSet={() => addSetRow(bi, ei)}
                          onRemoveSet={si => removeSetRow(bi, ei, si)}
                          onChangeWeight={v => updateExercise(bi, ei, { weightNote: v })}
                          onChangeWeightKg={v => updateExercise(bi, ei, plannedWeightPatch(ex,v))}
                          onChangeLoadUnits={v => {if(v!==loadUnitsForExercise(ex))updateExercise(bi, ei, { loadUnits: v,loadEvidence:null,loadProgression:null });}}
                          onChangeTempo={v => updateExercise(bi, ei, { tempo: v })}
                          onChangeTargetRpeMax={v => updateExercise(bi, ei, plannedRpePatch(ex,v))}
                          onChangeAutoReg={v => updateExercise(bi, ei, { autoReg: v })}
                          onChangeDescription={v => updateExercise(bi, ei, { descriptionOverride: v })}
                          onResetDescription={() => updateExercise(bi, ei, { descriptionOverride: undefined })}
                          onRegenerate={() => regenerateExercise(bi, ei)}
                        />
                        );
                      })}
                    </div>
                    )}
                    {!editorPreview && !collapsedBlocks.has(block.label) && pendingSaved && !pendingSaved.draft && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 print:hidden">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">Факт блока {block.label}</span>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          RPE
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            max="10"
                            value={block.actualRpe ?? ''}
                            onChange={e => {
                              const raw = e.target.value;
                              const v = raw === '' ? null : parseFloat(raw);
                              updateBlock(bi, { actualRpe: isNaN(v) ? null : v });
                            }}
                            className="w-14 rounded-md border border-white/[0.07] bg-white/[0.04] px-2 py-1 text-[11px] text-sky-300 outline-none focus:border-sky-400/50"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                          <input
                            type="checkbox"
                            checked={!!block.pain}
                            onChange={e => updateBlock(bi, { pain: e.target.checked })}
                            className="h-3.5 w-3.5 rounded border-white/[0.15] bg-white/[0.04]"
                          />
                          боль/дискомфорт
                        </label>
                        <input
                          value={block.feedbackNote || ''}
                          onChange={e => updateBlock(bi, { feedbackNote: e.target.value })}
                          placeholder="заметка по блоку"
                          className="min-w-[160px] flex-1 rounded-md border border-white/[0.07] bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300 outline-none placeholder:text-slate-700 focus:border-accent/40"
                        />
                      </div>
                    )}
                    {/* Quick-add exercise */}
                    {!editorPreview && !collapsedBlocks.has(block.label) && (
                      addExBlock === bi ? (
                        <div className="mt-3 flex items-center gap-2 print:hidden">
                          <input
                            type="text"
                            autoFocus
                            value={addExQuery}
                            onChange={e => setAddExQuery(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); addExerciseToBlock(bi, addExQuery); }
                              if (e.key === 'Escape') { setAddExBlock(null); setAddExQuery(''); }
                            }}
                            placeholder="Название упражнения..."
                            className="flex-1 rounded-xl border border-accent/30 bg-white/[0.04] px-3 py-2 text-[13px] text-slate-200 outline-none placeholder:text-slate-700 focus:border-accent/50"
                          />
                          <button
                            type="button"
                            onClick={() => addExerciseToBlock(bi, addExQuery)}
                            className="shrink-0 rounded-xl bg-accent/10 px-3 py-2 text-[12px] font-bold text-accent transition hover:bg-accent/20"
                          >
                            Добавить
                          </button>
                          <button
                            type="button"
                            onClick={() => { setAddExBlock(null); setAddExQuery(''); }}
                            className="shrink-0 rounded-xl p-2 text-slate-600 transition hover:text-slate-400"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setAddExBlock(bi); setAddExQuery(''); }}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.025] px-3 py-2 text-[12px] font-semibold text-slate-600 transition hover:border-accent/30 hover:bg-accent/[0.06] hover:text-accent print:hidden"
                        >
                          <Plus size={13} />
                          Добавить упражнение
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>

              </div>
              {/* Warnings — screen only */}
              {session.warnings && (
                <div className="mt-6 rounded-2xl border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.08] to-amber-500/[0.03] p-5 print:hidden">
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-400/80">Предостережения</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-amber-200/75">{session.warnings}</p>
                </div>
              )}

              {/* ── Print-only A4 landscape layout with exercise cards ── */}
              <div className="hidden print:block" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                <style>{`
                  @page { size: A4 landscape; margin: 5mm 7mm; }
                  @media print {
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .print-sheet { page-break-inside: avoid; }
                  }
                `}</style>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '3px', marginBottom: '4px' }}>
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: '10pt', fontWeight: '900', letterSpacing: '0.12em', color: '#0f172a', lineHeight: 1 }}>PERIODYX</div>
                    <div style={{ fontSize: '6pt', color: '#94a3b8', marginTop: '1px', letterSpacing: '0.05em' }}>AI PERFORMANCE COACH · ЗАРЕЧЬЕ ОДИНЦОВО</div>
                  </div>
                  <div style={{ textAlign: 'center', flex: 1, padding: '0 10px' }}>
                    <div style={{ fontSize: '7pt', fontWeight: '700', color: '#334155' }}>{meta.sessionType === 'warmup' ? 'РАЗМИНКА' : meta.focusLabel}</div>
                    {meta.dayGoal && <div style={{ fontSize: '6pt', color: '#64748b', marginTop: '1px' }}>Цель: {meta.dayGoal}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '9pt', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>{meta.player?.name}</div>
                    <div style={{ fontSize: '6.5pt', color: '#64748b', marginTop: '1px' }}>{meta.player?.position} · {meta.date}</div>
                  </div>
                </div>

                {/* Exercise card grid — one column per block */}
                <div className="print-sheet" style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${(session.blocks || []).length}, 1fr)`,
                  gap: '3px',
                  alignItems: 'start',
                }}>
                  {(session.blocks || []).map((block, bi) => (
                    <div key={bi} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {/* Block label */}
                      <div style={{
                        backgroundColor: '#0f172a',
                        color: 'white',
                        padding: '2px 5px',
                        fontWeight: '800',
                        fontSize: '7pt',
                        letterSpacing: '0.14em',
                        textAlign: 'center',
                        borderRadius: '2px',
                      }}>
                        БЛОК {block.label}
                      </div>

                      {/* Exercise mini-cards */}
                      {(block.exercises || []).map((ex, ei) => (
                        <div key={ei} style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '3px',
                          overflow: 'hidden',
                          backgroundColor: 'white',
                        }}>
                          {/* Card header: code + name */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '3px',
                            padding: '2px 4px',
                            backgroundColor: '#f1f5f9',
                            borderBottom: '1px solid #e2e8f0',
                          }}>
                            <span style={{ fontWeight: '900', color: '#0284c7', fontSize: '8pt', flexShrink: 0, lineHeight: '1.1', marginTop: '1px' }}>{ex.code}</span>
                            <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '6pt', lineHeight: '1.2', wordBreak: 'break-word' }}>{ex.name}</span>
                          </div>

                          {/* Sets · weight · cue */}
                          <div style={{ padding: '2px 4px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                            <div style={{ fontFamily: 'monospace', fontWeight: '700', color: '#1d4ed8', fontSize: '7.5pt', textAlign: 'center', marginBottom: '1px', lineHeight: '1.1' }}>
                              {(ex.targetSets || []).join(' · ')}
                            </div>
                            {ex.weightNote && (
                              <div style={{ fontSize: '6pt', color: '#475569', lineHeight: '1.15', marginBottom: '1px' }}>{ex.weightNote}</div>
                            )}
                            {(ex.cue || ex.tempo) && (
                              <div style={{ fontSize: '5.5pt', color: '#64748b', fontStyle: 'italic', lineHeight: '1.15' }}>{exerciseDescription(ex)}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Footer: assessment + warnings — clamped to 2 lines each to stay on page */}
                {(session.assessment || session.warnings) && (
                  <div style={{ marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '3px', display: 'flex', gap: '10px', fontSize: '6pt' }}>
                    {session.assessment && (
                      <div style={{ flex: 2, overflow: 'hidden', maxHeight: '2.8em' }}>
                        <span style={{ fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Оценка: </span>
                        <span style={{ color: '#475569' }}>{session.assessment}</span>
                      </div>
                    )}
                    {session.warnings && (
                      <div style={{ flex: 1, overflow: 'hidden', maxHeight: '2.8em' }}>
                        <span style={{ fontWeight: '800', color: '#b45309' }}>⚠ </span>
                        <span style={{ color: '#92400e' }}>{session.warnings}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Data summary */}
              <button
                type="button"
                onClick={() => setShowSummary(s => !s)}
                className={`mt-5 flex items-center gap-1.5 text-[11px] font-medium text-slate-700 transition hover:text-slate-500 print:hidden ${focusRing} rounded`}
              >
                <ChevronDown
                  size={13}
                  className={`transition-transform ${showSummary ? 'rotate-180' : ''}`}
                />
                Данные, на которых построена тренировка
              </button>
              {showSummary && (
                <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 text-[11px] leading-relaxed text-slate-600 print:hidden">
                  {meta.dataSummary}
                </pre>
              )}
            </div>
          );

  return (
    <>
      <Head>
        <title>Korenchuk Performance System</title>
        <meta
          name="description"
          content="Генерация тренировок в зале на конкретный день под состояние и цели игрока."
        />
      </Head>

      <div className="app-shell coach-premium relative flex min-h-screen text-slate-100">

        {/* ══════════════════════════════════════
            SIDEBAR — desktop only (sm+)
        ══════════════════════════════════════ */}
        <aside className={`premium-sidebar sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden print:hidden sm:flex ${sidebarCollapsed ? 'premium-sidebar--collapsed w-[88px]' : 'w-[312px]'}`}>

          {/* Logo + API Key */}
          <div className="sidebar-brand border-b border-white/[0.06] p-4">
            <div className="flex items-center gap-3">
              <div className="relative h-11 w-11 shrink-0">
                <div className="absolute -inset-[2px] rounded-[16px] bg-gradient-to-br from-emerald-300 via-cyan-400/70 to-violet-500/40 shadow-[0_0_24px_-8px_rgba(52,211,153,0.85)]" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/nk-logo.jpg" alt="NK" className="relative h-11 w-11 rounded-[14px] object-cover ring-1 ring-black/50" />
              </div>
              <div className="sidebar-copy min-w-0">
                <div className="truncate text-[13px] font-black leading-tight tracking-tight text-white">Nikolay Korenchuk</div>
                <div className="mt-0.5 bg-gradient-to-r from-emerald-300 via-cyan-300 to-violet-300 bg-clip-text text-[8px] font-black uppercase tracking-[0.19em] text-transparent">Performance System</div>
              </div>
              <div className="sidebar-brand-actions ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={logout}
                  aria-label="Выйти из системы"
                  title="Выйти из системы"
                  className={`sidebar-connected flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[9px] font-black uppercase tracking-wider transition-all ${focusRing} ${
                    keyConnected
                      ? 'border-emerald-400/25 bg-emerald-400/[0.10] text-emerald-300 shadow-[0_0_20px_-10px_rgba(52,211,153,0.9)]'
                      : 'border-white/[0.08] bg-white/[0.035] text-slate-500'
                  }`}
                >
                  <LogOut size={15} />
                </button>
                <button
                  type="button"
                  onClick={toggleDesktopSidebar}
                  className="sidebar-collapse-button grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-slate-400 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.08] hover:text-cyan-200"
                  aria-label={sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
                  title={sidebarCollapsed ? 'Развернуть панель' : 'Свернуть панель'}
                >
                  {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                </button>
              </div>
            </div>

          </div>

          {/* Workspace switcher */}
          {keyConnected && (
            <div className="sidebar-context sidebar-workspace border-b border-white/[0.06] px-3 py-2.5">
              <div className="sidebar-workspace-switcher flex gap-1 rounded-2xl border border-white/[0.07] bg-black/20 p-1">
                {[
                  { id: 'zarechie', label: 'Заречье', emoji: '🏐', activeClass: 'border-cyan-300/25 bg-gradient-to-br from-cyan-300/20 to-sky-500/10 text-cyan-200 shadow-[0_10px_28px_-18px_rgba(34,211,238,0.9)]' },
                  { id: 'nkperf',   label: 'NK Pro', emoji: '✦', activeClass: 'border-emerald-300/25 bg-gradient-to-br from-emerald-300/20 to-teal-500/10 text-emerald-200 shadow-[0_10px_28px_-18px_rgba(52,211,153,0.9)]' },
                ].map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => switchWorkspace(w.id)}
                    aria-pressed={workspace === w.id}
                    className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-[10px] font-bold transition-all ${
                      workspace === w.id ? w.activeClass : 'border-transparent text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
                    }`}
                  >
                    <span>{w.emoji}</span><span>{w.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {keyConnected && <CoachNavigation current={mainSection} onSelect={section => {setMainSection(section);if(section==='warmup')loadWarmupHistory();}} />}

          {/* Tab switcher: Players | Day (workouts section only) */}
          {mainSection === 'workouts' && keyConnected && players.length > 0 && (
            <div className="sidebar-context border-b border-white/[0.06] px-3 py-2">
              <div className="sidebar-roster-tabs flex rounded-xl border border-white/[0.06] bg-black/20 p-1">
                {[{ id: 'players', label: 'Игроки' }, { id: 'day', label: 'День' }].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => tab.id==='day'?setMainSection('team'):setLeftTab(tab.id)}
                    className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold transition-all ${
                      leftTab === tab.id ? 'bg-gradient-to-r from-white/[0.11] to-white/[0.06] text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Warmup sidebar panel */}
          {mainSection === 'warmup' && keyConnected && (
            <div className="sidebar-context flex-1 overflow-y-auto p-4 space-y-3">
              {/* Date */}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-slate-600">Дата</label>
                <DatePicker navigate value={warmupDate} onChange={setWarmupDate} size="sm" />
              </div>

              {/* Calendar-led season context */}
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-slate-600">Логика разминки</label>
                <p className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.05] px-3 py-2 text-[10px] leading-relaxed text-slate-500">
                  Тип разминки автоматически определяется по матчам, переездам и силовой сессии в этот день.
                </p>
              </div>

              {/* Generate button */}
              <button
                type="button"
                onClick={generateWarmup}
                disabled={warmupLoading}
                className="w-full rounded-xl bg-cyan-500 py-2.5 text-[12px] font-bold text-[#060a0e] transition hover:bg-cyan-400 disabled:opacity-50"
              >
                {warmupLoading ? 'Генерирую...' : 'Сгенерировать разминку'}
              </button>

              {warmupError && (
                <p className="rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-3 py-2 text-[11px] text-rose-400">{warmupError}</p>
              )}

              {/* History */}
              {warmupHistory.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">История</p>
                  <div className="space-y-0.5">
                    {warmupHistory.slice(0, 10).map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => loadWarmupByDate(d)}
                        className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold transition-all ${
                          d === warmupDate
                            ? 'bg-cyan-500/[0.12] text-cyan-400'
                            : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Readiness sidebar: date picker + refresh + summary */}
          {mainSection === 'readiness' && keyConnected && (
            <div className="sidebar-context flex-1 overflow-y-auto p-4 space-y-3">
              <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">Утренний экран</p>
              <DatePicker navigate value={readinessDate} onChange={setReadinessDate} maxDate={todayISO()} size="sm" className="w-full" />
              <button
                type="button"
                onClick={() => {
                  setReadinessLoading(true);
                  fetch(`/api/team/readiness?date=${readinessDate}&workspace=${workspace}&refresh=1`, { headers: { 'x-api-key': apiKey } })
                    .then(r => r.json()).then(d => setReadinessData(d))
                    .catch(() => setReadinessData({ players: [] }))
                    .finally(() => setReadinessLoading(false));
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] py-2 text-[11px] font-bold text-emerald-400 transition hover:bg-emerald-500/[0.12]"
              >
                <RefreshCw size={12} /> Обновить
              </button>
              {readinessData?.players && !readinessLoading && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-700">Сводка</p>
                  {['red', 'yellow', 'green'].map(s => {
                    const cnt = readinessData.players.filter(p => p.status === s).length;
                    const dot = s === 'red' ? '🔴' : s === 'yellow' ? '🟡' : '🟢';
                    const lbl = s === 'red' ? 'Красный' : s === 'yellow' ? 'Жёлтый' : 'Зелёный';
                    return (
                      <div key={s} className="flex items-center gap-2 text-[12px]">
                        <span>{dot}</span>
                        <span className="text-slate-500">{lbl}</span>
                        <span className="ml-auto font-bold text-slate-300">{cnt}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {readinessLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 size={16} className="animate-spin text-slate-600" />
                </div>
              )}
            </div>
          )}

          {/* Calendar sidebar: week navigation */}
          {mainSection === 'calendar' && keyConnected && (
            <div className="sidebar-context flex-1 overflow-y-auto p-4 space-y-3">
              <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">Навигация</p>
              {/* Prev / current / next week */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCalWeekStart(addDaysToStr(calWeekStart, -7))}
                  className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 transition"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setCalWeekStart(getMondayOf(todayISO()))}
                  className={`flex-1 rounded-xl py-2 text-[11px] font-bold transition ${
                    calWeekStart === getMondayOf(todayISO())
                      ? 'bg-violet-500/[0.12] text-violet-400'
                      : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
                  }`}
                >
                  Текущая
                </button>
                <button
                  type="button"
                  onClick={() => setCalWeekStart(addDaysToStr(calWeekStart, 7))}
                  className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 transition"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              {/* Week date range label */}
              {calWeekStart && (
                <p className="text-center text-[11px] font-semibold text-slate-600">
                  {coachDate(calWeekStart)} — {coachDate(addDaysToStr(calWeekStart, 6))}
                </p>
              )}
              {/* Session count summary */}
              {calData && !calLoading && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-700">Итог недели</p>
                  <p className="text-[22px] font-black text-violet-400 leading-none">
                    {Object.values(calData.sessions || {}).reduce((s, arr) => s + arr.length, 0)}
                    <span className="ml-1 text-[11px] font-semibold text-slate-600">тр.</span>
                  </p>
                  <p className="text-[10px] text-slate-700">из {calData.players.length} игроков</p>
                </div>
              )}
              {calLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 size={16} className="animate-spin text-slate-600" />
                </div>
              )}
            </div>
          )}

          {/* Planner sidebar: month navigation + autoplan + legend */}
          {mainSection === 'planner' && keyConnected && usesSeasonCalendar(workspace) && (
            <div className="sidebar-context flex-1 overflow-y-auto p-4 space-y-4">
              <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">Месяц</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPlannerMonth(shiftMonth(plannerMonth, -1))}
                  className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 transition"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setPlannerMonth(todayISO().slice(0, 7))}
                  className={`flex-1 rounded-xl py-2 text-[11px] font-bold transition ${
                    plannerMonth === todayISO().slice(0, 7)
                      ? 'bg-cyan-500/[0.12] text-cyan-400'
                      : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
                  }`}
                >
                  {monthLabel(plannerMonth)}
                </button>
                <button
                  type="button"
                  onClick={() => setPlannerMonth(shiftMonth(plannerMonth, 1))}
                  className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 transition"
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              <button
                type="button"
                onClick={runPlannerAutoplan}
                disabled={plannerLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-2.5 text-[12px] font-bold text-[#060a0e] transition hover:bg-cyan-400 disabled:opacity-50"
              >
                {plannerLoading ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Авто-план
              </button>

              <div>
                <p className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">Легенда</p>
                <div className="space-y-1">
                  {[
                    { icon: <Swords size={11} />,   label: 'Игра',          cls: PLANNER_CELL.game },
                    { icon: <Plane size={11} />,    label: 'Перелёт',       cls: PLANNER_CELL.travel },
                    { icon: <Coffee size={11} />,   label: 'Выходной',      cls: PLANNER_CELL.rest },
                    { icon: <Dumbbell size={11} />, label: 'Силовая',       cls: PLANNER_FOCUS_CELL.inseason_strength },
                    { icon: <Zap size={11} />,      label: 'Мощностная',    cls: PLANNER_FOCUS_CELL.inseason_power },
                    { icon: <Shield size={11} />,   label: 'Профилактика',  cls: PLANNER_FOCUS_CELL.inseason_prophylaxis },
                    { icon: <RotateCcw size={11} />,label: 'Deload',        cls: PLANNER_FOCUS_CELL.inseason_deload },
                    { icon: <Dumbbell size={11} />, label: 'Тейпер',        cls: PLANNER_FOCUS_CELL.inseason_taper },
                    { icon: <Dumbbell size={11} />, label: 'Накопление',    cls: PLANNER_FOCUS_CELL.inseason_accumulation },
                    { icon: <Dumbbell size={11} />, label: 'Конверсия',     cls: PLANNER_FOCUS_CELL.inseason_conversion },
                  ].map((it, i) => (
                    <div key={i} className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] font-semibold ${it.cls}`}>
                      {it.icon}<span>{it.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Player list (workouts section only) */}
          {mainSection === 'workouts' && (playerId || !keyConnected || leftTab==='day') && (
          <div className="sidebar-context sidebar-player-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
            {!keyConnected && (
              <p className="px-3 py-5 text-[11px] text-slate-600">Введи ключ чтобы загрузить состав</p>
            )}
            {keyConnected && players.length === 0 && (
              <p className="px-3 py-5 text-[11px] text-slate-600">Загрузка состава...</p>
            )}
            {/* ── Вкладка: День ── */}
            {leftTab === 'day' && keyConnected && (
              <div className="space-y-1">

                {/* Date + refresh */}
                <div className="mb-2 flex items-center gap-2 px-1">
                  <DatePicker navigate quickDays timeZone={activePlayerTimeZone} value={date} onChange={changeTrainingDate} disabled={loading || !!batchId || saving || batchRunning || weekPlanLoading} maxDate={addDaysToStr(playerToday, 1)} size="sm" className="flex-1" />
                  <button type="button" onClick={() => loadTeamStatus()} disabled={teamStatusLoading} className="shrink-0 text-slate-600 hover:text-accent transition" title="Обновить">
                    <RefreshCw size={11} className={teamStatusLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                {/* Generation parameters */}
                <div className="mb-2 space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                  {/* Period pills */}
                  <div className="flex gap-1">
                    {PERIODS.map(p => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => {
                          const nextFocus = phasesForWorkspace(p.value, workspace)[0].value;
                          setPeriod(p.value);
                          setFocus(nextFocus);
                          setTrainingType(defaultTrainingTypeForFocus(nextFocus));
                        }}
                        className={`flex-1 rounded-lg py-1 text-[9px] font-bold transition-all ${
                          period === p.value
                            ? PERIOD_COLORS[p.value].tab
                            : 'text-slate-600 hover:text-slate-400'
                        }`}
                      >
                        {p.value === 'offseason' ? 'Межс.' : p.label}
                      </button>
                    ))}
                  </div>

                  {/* Phase select */}
                  <PremiumSelect
                    value={focus}
                    onChange={nextValue => {
                      setFocus(nextValue);
                      setTrainingType(defaultTrainingTypeForFocus(nextValue));
                    }}
                    options={phasesForWorkspace(period, workspace).map(ph => ({
                      value: ph.value,
                      label: phaseLabelForWorkspace(ph, workspace),
                    }))}
                    className="w-full rounded-lg border border-white/[0.08] bg-[#0a1520] px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-accent/40 [color-scheme:dark]"
                    compact
                  />

                  {focus === 'inseason_strength' && (
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.05] p-1">
                      {[
                        { value: 'development', label: 'Развивающая', sub: '40–50 мин' },
                        { value: 'maintenance', label: 'Поддерживающая', sub: '40–50 мин' },
                      ].map(mode => (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => setStrengthMode(mode.value)}
                          className={`rounded-md px-2 py-1.5 text-left transition ${
                            strengthMode === mode.value
                              ? 'bg-cyan-400/20 text-cyan-200'
                              : 'text-slate-600 hover:text-slate-400'
                          }`}
                        >
                          <span className="block text-[10px] font-black">{mode.label}</span>
                          <span className="block text-[8px]">{mode.sub}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {focus === 'inseason_power' && (
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-violet-400/20 bg-violet-400/[0.05] p-1">
                      {[
                        { value: 'development', label: 'Development', sub: '50–55 мин' },
                        { value: 'microdose', label: 'Microdose', sub: '30 мин' },
                      ].map(mode => (
                        <button
                          key={mode.value}
                          type="button"
                          onClick={() => setPowerMode(mode.value)}
                          className={`rounded-md px-2 py-1.5 text-left transition ${
                            powerMode === mode.value
                              ? 'bg-violet-400/20 text-violet-200'
                              : 'text-slate-600 hover:text-slate-400'
                          }`}
                        >
                          <span className="block text-[10px] font-black">{mode.label}</span>
                          <span className="block text-[8px]">{mode.sub}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Manual training type */}
                  <PremiumSelect
                    value={trainingType}
                    onChange={setTrainingType}
                    options={focus === 'inseason_strength' ? STRENGTH_TRAINING_TYPES : TRAINING_TYPES}
                    className="w-full rounded-lg border border-white/[0.08] bg-[#0a1520] px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-accent/40 [color-scheme:dark]"
                    title={focus === 'inseason_strength' ? 'Акцент силовой тренировки' : 'Ручной тип тренировки'}
                    compact
                  />

                  {focus === 'inseason_strength' && <p className="text-[10px] leading-relaxed text-slate-500">Основные упражнения — цикл 4 занятия. Для соседних дней выбирайте разные цепи; пересекающаяся нагрузка снижается.</p>}

                  {/* Day goal */}
                  <input
                    type="text"
                    value={dayGoal}
                    onChange={e => setDayGoal(e.target.value)}
                    placeholder="Цель дня (необязательно)"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-slate-300 placeholder-slate-700 outline-none focus:border-accent/40"
                  />

                  {/* Notes */}
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Комментарии тренера..."
                    className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] leading-snug text-slate-300 placeholder-slate-700 outline-none focus:border-accent/40"
                  />
                </div>

                {/* Select all / clear */}
                {players.length > 0 && !batchRunning && (
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[10px] text-slate-600">
                      {batchSelectedIds.size > 0 ? `Выбрано: ${batchSelectedIds.size}` : 'Выбери игроков'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (batchSelectedIds.size === players.length) setBatchSelectedIds(new Set());
                        else setBatchSelectedIds(new Set(players.map(p => p.id)));
                      }}
                      className="text-[10px] font-semibold text-accent/70 hover:text-accent transition"
                    >
                      {batchSelectedIds.size === players.length ? 'Снять все' : 'Выбрать всех'}
                    </button>
                  </div>
                )}

                {/* Player rows with checkboxes */}
                {players.map(p => {
                  const st = teamStatus[p.id];
                  const fb = st?.feedback;
                  const sel = batchSelectedIds.has(p.id);
                  const batchRow = batchResults.find(r => r.playerId === p.id);
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 rounded-xl px-2 py-2 transition-all ${
                        sel ? 'bg-accent/[0.07] ring-1 ring-inset ring-accent/20' :
                        playerId === p.id ? 'bg-white/[0.04]' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => !batchRunning && toggleBatchPlayer(p.id)}
                        disabled={batchRunning}
                        className="shrink-0 transition"
                      >
                        {sel
                          ? <CheckSquare size={14} className="text-accent" />
                          : <Square size={14} className="text-slate-700 hover:text-slate-500" />}
                      </button>

                      {/* Player info — click to open */}
                      <button
                        type="button"
                        onClick={() => batchRow?.status === 'done' && batchRow.draft ? openBatchDraft(batchRow) : selectPlayer(p)}
                        className="flex flex-1 min-w-0 items-center gap-2 text-left"
                      >
                        <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${positionDot(p.position)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-[12px] font-semibold leading-tight text-slate-200">{p.name.split(' ')[0]}</div>
                          <div className="text-[10px] text-slate-600">{p.position || '—'}</div>
                        </div>
                      </button>

                      {/* Match load marker */}
                      <PremiumSelect
                        value={matchLoads[p.id]?.status || ''}
                        onChange={nextValue => updateMatchLoad(p.id, nextValue)}
                        options={MATCH_LOAD_OPTIONS}
                        disabled={matchLoadSaving || batchRunning}
                        className={`shrink-0 rounded-lg border border-white/[0.07] bg-[#071018] px-1.5 py-1 text-[10px] outline-none [color-scheme:dark] ${
                          matchLoads[p.id]?.status ? 'text-amber-300' : 'text-slate-600'
                        }`}
                        title="Игровая нагрузка после матча"
                        compact
                      />

                      {/* Status badges */}
                      <div className="flex items-center gap-1 shrink-0">
                        {batchRow && (
                          <span className={`text-[10px] font-bold ${
                            batchRow.status === 'done'       ? 'text-emerald-400' :
                            batchRow.status === 'error'      ? 'text-rose-400' :
                            batchRow.status === 'generating' ? 'text-accent' :
                            'text-slate-600'
                          }`}>
                            {batchRow.status === 'done'       ? (batchRow.draft ? 'Черновик' : '✓') :
                             batchRow.status === 'error'      ? '✗' :
                             batchRow.status === 'generating' ? '…' : '·'}
                          </span>
                        )}
                        {!batchRow && fb && (
                          <span title={fb.primerFeedback ? `RPE ${fb.rpe}/10 · скорость ${fb.primerFeedback.speed}/5 · ноги ${fb.primerFeedback.legs}/5 · плечо ${fb.primerFeedback.shoulder}/5` : `RPE ${fb.rpe}/10 · общая усталость ${fb.fatigue ?? '—'}/5`} className={`rounded px-1 py-0.5 text-[9px] font-black ${
                            fb.rpe >= 9 ? 'bg-red-500/20 text-red-400' :
                            fb.rpe >= 7 ? 'bg-amber-500/20 text-amber-400' :
                            'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {fb.rpe}{fb.primerFeedback ? ` · ⚡${fb.primerFeedback.speed} · Н${fb.primerFeedback.legs} · П${fb.primerFeedback.shoulder}` : fb.fatigue != null ? ` · ${fb.fatigue}` : ''}
                          </span>
                        )}
                        {!batchRow && st && !batchRunning && (
                          <span className={`text-[11px] ${st.hasSession || st.hasDraft ? 'text-emerald-500' : 'text-slate-700'}`}>
                            {st.hasDraft ? 'Черновик' : st.hasSession ? '✓' : '—'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Generate button */}
                {batchSelectedIds.size > 0 && !batchRunning && (
                  <div className="pt-2 px-1">
                    <button
                      type="button"
                      onClick={async () => {

                        await runBatchGeneration();
                        loadTeamStatus();
                      }}
                      disabled={!apiKey || matchDayManualReview}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-accent/90 py-2.5 text-[12px] font-bold text-[#060a0e] transition hover:bg-accent disabled:opacity-30"
                    >
                      <Zap size={12} strokeWidth={2.5} />
                      {matchDayManualReview ? 'Игровой день: проверка по одной' : `Сгенерировать для ${batchSelectedIds.size} ${batchSelectedIds.size === 1 ? 'игрока' : 'игроков'}`}
                    </button>
                  </div>
                )}

                {/* Running indicator */}
                {batchRunning && (
                  <div className="pt-2 px-1 flex items-center gap-2 text-[11px] text-slate-500">
                    <Loader2 size={11} className="animate-spin text-accent" />
                    Генерирую {batchResults.filter(r => r.status === 'done').length} / {batchResults.length}...
                  </div>
                )}

                {/* Done summary */}
                {!batchRunning && batchResults.length > 0 && (
                  <div className="pt-1 px-1 flex items-center justify-between">
                    <span className="text-[10px] text-emerald-400">
                      ✓ {batchResults.filter(r => r.status === 'done').length} подготовлено
                      {batchResults.some(r => r.status === 'error') && ` · ${batchResults.filter(r => r.status === 'error').length} ошибок`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {  setBatchSelectedIds(new Set()); }}
                      className="text-[10px] text-slate-600 hover:text-slate-400 transition"
                    >
                      Сбросить
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Вкладка: Игроки ── */}
            {leftTab === 'players' && keyConnected && players.length > 0 && (
              <div className="sidebar-roster-head -mx-1 mb-2 border-b border-white/[0.05] px-1 pb-2.5 pt-1">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Состав</span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-slate-400">{filteredPlayers.length}/{players.length}</span>
                </div>
                {/* Player search */}
                <div className="relative">
                  <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={playerSearch}
                    onChange={e => setPlayerSearch(e.target.value)}
                    placeholder="Поиск игрока..."
                    className="w-full rounded-xl border border-white/[0.09] bg-black/20 py-2 pl-9 pr-8 text-[11px] text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/[0.16] focus:border-cyan-300/40 focus:bg-cyan-300/[0.04]"
                  />
                  {playerSearch && (
                    <button
                      type="button"
                      onClick={() => setPlayerSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {leftTab === 'players' && keyConnected && players.length > 0 && (
              <div className="no-scrollbar flex flex-nowrap gap-0.5 overflow-x-auto px-1 pb-2">
                {[
                  { key: 'all', label: 'Все' },
                  { key: 'diagonal', label: 'Диаг', cls: 'bg-violet-400' },
                  { key: 'outside', label: 'Доигр', cls: 'bg-cyan-400' },
                  { key: 'middle', label: 'Центр', cls: 'bg-amber-400' },
                  { key: 'setter', label: 'Связ', cls: 'bg-emerald-400' },
                  { key: 'libero', label: 'Либеро', cls: 'bg-rose-400' },
                ].map(({ key, label, cls }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPositionFilter(key)}
                    className={`flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[9px] font-bold transition-all ${
                      positionFilter === key ? 'bg-white/[0.10] text-white' : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {cls && <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />}
                    {label}
                  </button>
                ))}
              </div>
            )}
            {leftTab === 'players' && filteredPlayers.map(p => (
              <div
                key={p.id}
                className={`sidebar-player-row group mb-1.5 flex w-full items-center gap-3 rounded-2xl border px-2.5 py-2 text-left transition-all duration-200 ${
                  playerId === p.id
                    ? 'border-cyan-300/25 bg-gradient-to-r from-cyan-300/[0.13] to-emerald-300/[0.07] text-white shadow-[0_12px_30px_-18px_rgba(34,211,238,0.85)]'
                    : 'border-white/[0.045] bg-white/[0.018] text-slate-400 hover:border-cyan-300/15 hover:bg-gradient-to-r hover:from-cyan-300/[0.06] hover:to-violet-300/[0.035] hover:text-slate-100'
                }`}
              >
                <button type="button" onClick={() => selectPlayer(p)} aria-pressed={playerId === p.id} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <div className="relative h-9 w-9 shrink-0">
                  {p.photo ? (
                    <img src={p.photo} alt="" className="h-9 w-9 rounded-xl object-cover object-top ring-1 ring-white/[0.14]" />
                  ) : (
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-[10px] font-black transition-colors ${
                      playerId === p.id
                        ? 'bg-accent text-[#060a0e]'
                        : 'bg-white/[0.07] text-slate-400 group-hover:bg-white/[0.10]'
                    }`}>
                      {initials(p.name)}
                    </div>
                  )}
                  <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-[#060c15] ${positionDot(p.position)}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                  <div className="truncate text-[13px] font-bold leading-tight text-slate-100">{p.name}</div>
                    {p.lastSessionDate === date && (
                      <span title="Тренировка сохранена на эту дату" className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]" />
                    )}
                    {playerFeedbacks[p.id] && (
                      <span title={playerFeedbacks[p.id].primerFeedback ? `RPE ${playerFeedbacks[p.id].rpe}/10 · скорость ${playerFeedbacks[p.id].primerFeedback.speed}/5 · ноги ${playerFeedbacks[p.id].primerFeedback.legs}/5 · плечо ${playerFeedbacks[p.id].primerFeedback.shoulder}/5` : `RPE ${playerFeedbacks[p.id].rpe}/10 · общая усталость ${playerFeedbacks[p.id].fatigue ?? '—'}/5`} className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black leading-none ${
                        playerFeedbacks[p.id].rpe >= 9 ? 'bg-red-500/20 text-red-400' :
                        playerFeedbacks[p.id].rpe >= 7 ? 'bg-amber-500/20 text-amber-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        RPE {playerFeedbacks[p.id].rpe}{playerFeedbacks[p.id].primerFeedback ? ` · ⚡${playerFeedbacks[p.id].primerFeedback.speed} · Н${playerFeedbacks[p.id].primerFeedback.legs} · П${playerFeedbacks[p.id].primerFeedback.shoulder}` : playerFeedbacks[p.id].fatigue != null ? ` · уст. ${playerFeedbacks[p.id].fatigue}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-600 truncate leading-tight">
                    {p.position || '—'}
                    {p.lastSessionDate && (
                      <span className="ml-1.5 opacity-50">
                        {coachDate(p.lastSessionDate)}
                      </span>
                    )}
                  </div>
                </div>
                </button>
                <button
                  type="button"
                  onClick={async e => {
                    e.stopPropagation();
                    try {
                      const r = await fetch('/api/players/share-token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                        body: JSON.stringify({ playerId: p.id, workspace }),
                      });
                      const d = await r.json();
                      if (!d.token) return;
                      await navigator.clipboard.writeText(`${window.location.origin}/player/${d.token}`);
                      setLinkCopied(p.id);
                      setTimeout(() => setLinkCopied(null), 2500);
                    } catch (_) {}
                  }}
                  className="shrink-0 rounded-lg p-1 transition opacity-0 group-hover:opacity-100 hover:text-accent"
                  title="Скопировать ссылку игрока"
                >
                  {linkCopied === p.id
                    ? <Check size={11} className="text-emerald-400 opacity-100" />
                    : <Link2 size={11} className="text-slate-500" />}
                </button>
              </div>
            ))}
          </div>
          )} {/* end workouts player list */}

          {/* NK Performance sync button */}
          {workspace === 'nkperf' && keyConnected && (
            <div className="sidebar-sync border-t border-white/[0.05] px-3 py-2">
              <button
                type="button"
                disabled={nkSyncing}
                onClick={async () => {
                  setNkSyncing(true);
                  await loadNKPlayers(true);
                  setNkSyncing(false);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-[10px] font-semibold text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/[0.07] transition-all disabled:opacity-40"
              >
                <RefreshCw size={10} className={nkSyncing ? 'animate-spin' : ''} />
                {nkSyncing ? 'Синхронизация...' : 'Обновить состав ReadySix'}
              </button>
            </div>
          )}

        </aside>

        {/* ══════════════════════════════════════
            MOBILE: full-screen player picker
        ══════════════════════════════════════ */}
        {mobileView === 'players' && (
          <div className="flex sm:hidden flex-col w-full min-h-screen">
            {/* Mobile header */}
            <div className="mobile-command-header border-b border-white/[0.07] px-4 py-4">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/nk-logo.jpg" alt="NK" className="h-10 w-10 shrink-0 rounded-[14px] object-cover ring-1 ring-emerald-300/35 shadow-[0_0_20px_-9px_rgba(52,211,153,0.9)]" />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-black leading-tight tracking-tight text-white">Nikolay Korenchuk</div>
                  <div className="mt-0.5 bg-gradient-to-r from-emerald-300 via-cyan-300 to-violet-300 bg-clip-text text-[8px] font-black uppercase tracking-[0.18em] text-transparent">Performance System</div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  title="Выйти из системы"
                  className={`ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[9px] font-black uppercase tracking-wider transition-all ${focusRing} ${
                  keyConnected
                    ? 'border-emerald-300/25 bg-emerald-300/[0.10] text-emerald-200'
                    : 'border-white/[0.07] bg-white/[0.03] text-slate-500'
                }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${keyConnected ? 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]' : 'bg-slate-600'}`} />
                  Выйти
                </button>
              </div>
            </div>
            {/* Mobile workspace switcher */}
            {keyConnected && (
              <div className="border-b border-white/[0.06] px-4 py-2.5">
                <div className="flex gap-1 rounded-2xl border border-white/[0.07] bg-black/20 p-1">
                  {[
                    { id: 'zarechie', label: 'Заречье', icon: '🏐' },
                    { id: 'nkperf', label: 'NK Pro', icon: '✦' },
                  ].map(w => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => switchWorkspace(w.id)}
                    aria-pressed={workspace === w.id}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-black transition-all ${
                        workspace === w.id
                          ? w.id === 'zarechie'
                            ? 'border-cyan-300/25 bg-cyan-300/[0.12] text-cyan-200'
                            : 'border-emerald-300/25 bg-emerald-300/[0.12] text-emerald-200'
                          : 'border-transparent text-slate-500'
                      }`}
                    >
                      <span>{w.icon}</span>{w.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {keyConnected && <div className="coach-mobile-navigation"><CoachNavigation current={mainSection} onSelect={section=>{setMainSection(section);setMobileView('workspace');if(section==='warmup')loadWarmupHistory();}} /></div>}

            {/* Mobile player grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-1 mb-3 -mt-1">
                {[
                  { key: 'all', label: 'Все' },
                  { key: 'diagonal', label: 'Диаг', cls: 'bg-violet-400' },
                  { key: 'outside', label: 'Доигр', cls: 'bg-cyan-400' },
                  { key: 'middle', label: 'Центр', cls: 'bg-amber-400' },
                  { key: 'setter', label: 'Связ', cls: 'bg-emerald-400' },
                  { key: 'libero', label: 'Либеро', cls: 'bg-rose-400' },
                ].map(({ key, label, cls }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPositionFilter(key)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      positionFilter === key ? 'bg-white/[0.10] text-white' : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {cls && <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />}
                    {label}
                  </button>
                ))}
              </div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Состав команды</p>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-black text-slate-400">{filteredPlayers.length}/{players.length}</span>
              </div>
              <div className="relative mb-3">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={playerSearch}
                  onChange={e => setPlayerSearch(e.target.value)}
                  placeholder="Найти спортсмена..."
                  className="w-full rounded-2xl border border-white/[0.09] bg-black/20 py-2.5 pl-9 pr-9 text-[12px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/35 focus:bg-cyan-300/[0.035]"
                />
                {playerSearch && (
                  <button type="button" onClick={() => setPlayerSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {filteredPlayers.map(p => (
                  <div key={p.id} className="relative">
                    <button
                      type="button"
                      onClick={() => selectPlayer(p)}
                      className="w-full flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-center transition active:scale-95"
                    >
                      <div className="relative h-12 w-12">
                        {p.photo ? (
                          <img src={p.photo} alt="" className="h-12 w-12 rounded-2xl object-cover object-top" />
                        ) : (
                          <div className={`h-12 w-12 flex items-center justify-center rounded-2xl text-sm font-black ${
                            playerId === p.id ? 'bg-accent text-[#060a0e]' : 'bg-white/[0.07] text-slate-300'
                          }`}>
                            {initials(p.name)}
                          </div>
                        )}
                        <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#060c15] ${positionDot(p.position)}`} />
                      </div>
                      <div>
                        <div className="text-[12px] font-bold text-slate-200 leading-tight">{p.name}</div>
                        <div className="text-[10px] text-slate-600 mt-0.5">{p.position || '—'}</div>
                      </div>
                    </button>
                    {/* Share link — bottom-right corner */}
                    <button
                      type="button"
                      onClick={async e => {
                        e.stopPropagation();
                        try {
                          const r = await fetch('/api/players/share-token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                            body: JSON.stringify({ playerId: p.id, workspace }),
                          });
                          const d = await r.json();
                          if (!d.token) return;
                          await navigator.clipboard.writeText(`${window.location.origin}/player/${d.token}`);
                          setLinkCopied(p.id);
                          setTimeout(() => setLinkCopied(null), 2500);
                        } catch (_) {}
                      }}
                      className="absolute bottom-2.5 right-2.5 rounded-lg p-1 text-slate-600 transition hover:text-accent"
                      title="Скопировать ссылку"
                    >
                      {linkCopied === p.id
                        ? <Check size={12} className="text-emerald-400" />
                        : <Link2 size={12} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            WORKSPACE
        ══════════════════════════════════════ */}
        <div className={`workspace-main h-screen min-w-0 flex-1 overflow-y-auto flex-col${mobileView === 'players' ? ' hidden sm:flex' : ' flex'}`}>
          <div className="coach-top-rule print:hidden" />
          <div className="coach-mobile-toolbar sm:hidden print:hidden"><button type="button" onClick={()=>setMobileView('players')}><Menu size={17}/>Меню и состав</button><span>{workspace==='nkperf'?'NK Performance':'Заречье'}</span></div>

          {/* ── Warmup workspace ── */}
          {mainSection === 'warmup' && (
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
              {warmupLoading && (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="h-8 w-8 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
                  <p className="text-[13px] text-slate-500">Генерирую разминку...</p>
                </div>
              )}
              {!warmupLoading && !warmupPlan && (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <div className="text-4xl opacity-20">🏃</div>
                  <h2 className="text-[18px] font-black text-slate-600">Командная разминка</h2>
                  <p className="text-[13px] text-slate-700">Выберите дату и нажмите «Сгенерировать» в панели слева. Фаза определяется автоматически по календарю.</p>
                </div>
              )}
              {!warmupLoading && warmupPlan && (
                <div>
                  <div className="mb-7">
                    <h1 className="text-[24px] font-black tracking-tight text-white leading-tight">Командная разминка</h1>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="text-[12px] text-slate-500">{warmupPlan.date}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-700" />
                      <span className="text-[12px] text-cyan-400/80">{WARMUP_PHASE_MAP[warmupPlan.phase]}</span>
                      {warmupPlan.morningFocus && warmupPlan.morningFocus !== 'general' && WARMUP_FOCUS_MAP[warmupPlan.morningFocus] && (
                        <>
                          <span className="h-1 w-1 rounded-full bg-slate-700" />
                          <span className="text-[12px] text-slate-500">{WARMUP_FOCUS_MAP[warmupPlan.morningFocus]}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <WarmupConduct key={workspace+warmupPlan.date} plan={warmupPlan} onModeChange={setWarmupConduct}/>
                  <div className={warmupConduct?'hidden':'grid gap-4 sm:grid-cols-2'}>
                    {(warmupPlan.sections || []).map((section, si) => {
                      const st = WARMUP_SECTION_STYLES[section.id] || WARMUP_SECTION_STYLES.speed;
                      return (
                        <div key={si} className="rounded-2xl border border-white/[0.06] bg-[#0d1520] p-5">
                          <div className="mb-4 flex items-center gap-3">
                            <span className={`h-7 w-1 rounded-full ${st.bar}`} />
                            <span className={`text-base ${st.text}`}>{st.icon}</span>
                            <h3 className={`text-[14px] font-bold ${st.text}`}>{section.label}</h3>
                          </div>
                          <ul className="space-y-2.5">
                            {(section.exercises || []).map((ex, i) => (
                              <li key={i} className={`rounded-xl border p-3 ${st.chip}`}>
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                                  <div className="min-w-0">
                                    <span className="text-[13px] font-semibold text-white">{ex.name}</span>
                                    {ex.nameEn && (
                                      <span className="ml-1.5 text-[11px] font-normal text-white/35">{ex.nameEn}</span>
                                    )}
                                  </div>
                                  <span className="text-[12px] font-bold text-white/70">{ex.reps}</span>
                                </div>
                                {ex.note && <p className="mt-1 text-[11px] leading-snug text-white/40">{ex.note}</p>}
                                {/* The warmup uses the same video panel as a gym session.
                                    Russian `name` is the library key; `nameEn` is only a coaching subtitle. */}
                                <ExerciseVideoPanel name={ex.name} apiKey={apiKey} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Team readiness (Feature 1) ── */}
          {mainSection === 'readiness' && (
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-white">
                    <Activity size={20} className="text-emerald-400" /> Готовность команды
                  </h2>
                  <p className="mt-0.5 text-[12px] text-slate-600">
                    {readinessDate}{readinessData?.revalidating ? ' · данные обновляются в фоне' : ''}
                  </p>
                </div>
                {readinessLoading && <Loader2 size={16} className="animate-spin text-slate-600" />}
              </div>

              {readinessLoading && (
                <div className="flex items-center justify-center py-20 text-[13px] text-slate-600">
                  <Loader2 size={18} className="mr-2 animate-spin" /> Загрузка...
                </div>
              )}

              {!readinessLoading && readinessData?.cache === 'stale' && (
                <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-[12px] font-semibold text-amber-200">
                  Показаны последние надёжные данные: источник временно недоступен. Обновление будет повторено автоматически.
                </div>
              )}

              {!readinessLoading && (!readinessData?.players || readinessData.players.length === 0) && (
                <div className="rounded-2xl border border-white/[0.07] bg-[#0d1520] p-10 text-center text-[13px] text-slate-600">
                  Нет данных по составу. Проверьте ключ <code className="text-slate-500">coach:roster</code>.
                </div>
              )}

              {!readinessLoading && readinessData?.players?.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[...readinessData.players]
                    .sort((a, b) => {
                      const order = { red: 0, yellow: 1, green: 2 };
                      const statusDiff = (order[a.status] ?? 3) - (order[b.status] ?? 3);
                      return statusDiff !== 0 ? statusDiff : (b.attentionScore ?? 0) - (a.attentionScore ?? 0);
                    })
                    .map(p => {
                      const ring = p.status === 'red' ? 'border-rose-500/40' : p.status === 'yellow' ? 'border-amber-500/40' : 'border-emerald-500/30';
                      const circleBg = p.status === 'red' ? 'bg-rose-500/15 text-rose-400 ring-rose-500/40' : p.status === 'yellow' ? 'bg-amber-500/15 text-amber-400 ring-amber-500/40' : 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30';
                      const dot = p.status === 'red' ? '🔴' : p.status === 'yellow' ? '🟡' : '🟢';
                      const attentionColor = p.attentionScore == null ? 'text-slate-500' : p.attentionScore >= 60 ? 'text-rose-400' : p.attentionScore >= 30 ? 'text-amber-400' : 'text-emerald-400';
                      const domainDot = (v) => v === 'red' ? 'bg-rose-500' : v === 'yellow' ? 'bg-amber-500' : v === 'unknown' ? 'bg-slate-600' : 'bg-emerald-500/50';
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setPlayerId(p.id); setDate(readinessDate); setMainSection('workouts'); }}
                          className={`group flex flex-col rounded-2xl border ${ring} bg-gradient-to-b from-white/[0.04] to-white/[0.015] p-4 text-left transition hover:from-white/[0.06] hover:to-white/[0.025]`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ring-1 ring-inset ${circleBg}`}>
                              <span className="text-[15px] font-black leading-none tabular-nums">{p.recovery != null ? p.recovery : '—'}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[13px]">{dot}</span>
                                    <span className="truncate text-[14px] font-bold text-white">{p.name}</span>
                                  </div>
                                  {p.domains && (
                                    <div className="mt-1 flex items-center gap-1">
                                      <span title="Автономный" className={`h-[3px] w-[3px] rounded-full ${domainDot(p.domains.autonomic)}`} />
                                      <span title="Нейромышечный" className={`h-[3px] w-[3px] rounded-full ${domainDot(p.domains.neuromuscular)}`} />
                                      <span title="Субъективный" className={`h-[3px] w-[3px] rounded-full ${domainDot(p.domains.subjective)}`} />
                                    </div>
                                  )}
                                  {p.position && <div className="text-[11px] text-slate-600">{p.position}</div>}
                                  <div className="mt-0.5 text-[10px] text-slate-700">Recovery {p.recovery != null ? `${p.recovery}%` : '—'}</div>
                                  <div className={`mt-0.5 text-[9px] font-semibold ${p.dataCompleteness < 50 ? 'text-amber-500/70' : 'text-slate-600'}`}>
                                    Данные: {p.dataCompleteness ?? 0}%
                                  </div>
                                  {p.dataProvenance && <div className="mt-0.5 text-[8px] text-slate-700">{p.dataProvenance.source}{p.dataProvenance.generatedAt ? ` · ${compactTime(p.dataProvenance.generatedAt)}` : ''}{p.dataProvenance.missingSources?.length ? ` · нет: ${p.dataProvenance.missingSources.join(', ')}` : ''}</div>}
                                </div>
                                {p.attentionScore != null && (
                                  <div className="flex shrink-0 items-baseline gap-1 leading-none">
                                    <span className={`text-[16px] font-black tabular-nums ${attentionColor}`}>{p.attentionScore}</span>
                                    <span className="text-[9px] text-slate-600">внимание</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
                            {/* CMJ + delta */}
                            <span className="flex items-center gap-1 text-slate-400">
                              <span className="text-slate-600">CMJ</span>
                              <span className="font-bold text-slate-200 tabular-nums">{p.cmj != null ? `${p.cmj}` : '—'}</span>
                              {p.cmjDrop != null && (
                                <span className={`font-semibold ${p.cmjDrop < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                  {p.cmjDrop < 0 ? '↓' : '↑'}{p.cmjDrop > 0 ? '+' : ''}{p.cmjDrop}%
                                </span>
                              )}
                              {p.kpiFreshness?.cmj?.stale && <span className="text-[8px] text-amber-500/70">устар.</span>}
                            </span>
                            {p.rsi != null && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <span className="text-slate-600">RSI</span>
                                <span className="font-bold text-slate-200 tabular-nums">{p.rsi}</span>
                                {p.kpiFreshness?.rsi?.stale && <span className="text-[8px] text-amber-500/70">устар.</span>}
                              </span>
                            )}
                            {p.sprint10m != null && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <span className="text-slate-600">10 м</span>
                                <span className="font-bold text-slate-200 tabular-nums">{p.sprint10m}с</span>
                                {p.kpiFreshness?.sprint10m?.stale && <span className="text-[8px] text-amber-500/70">устар.</span>}
                              </span>
                            )}
                            {/* LSI symmetry */}
                            {p.lsi != null && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <span className="text-slate-600">LSI</span>
                                <span className={`font-bold tabular-nums ${p.lsi < 85 ? 'text-rose-400' : 'text-slate-200'}`}>{p.lsi}%</span>
                              </span>
                            )}
                            {/* Sleep */}
                            <span className="flex items-center gap-1 text-slate-400">
                              <span className="text-slate-600">🌙</span>
                              <span className="font-semibold text-slate-300 tabular-nums">{p.sleep_hours != null ? `${p.sleep_hours}ч` : '—'}</span>
                            </span>
                            {/* DOMS */}
                            <span className="flex items-center gap-1 text-slate-400">
                              <span className="text-slate-600">DOMS</span>
                              <span className={`font-semibold tabular-nums ${p.doms != null && p.doms >= 5 ? 'text-rose-400' : 'text-slate-300'}`}>{p.doms != null ? `${p.doms}/5` : '—'}</span>
                            </span>
                            {/* Readiness */}
                            {p.readiness != null && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <span className="text-slate-600">Гот.</span>
                                <span className={`font-semibold tabular-nums ${p.readiness <= 2 ? 'text-rose-400' : p.readiness === 3 ? 'text-amber-400' : 'text-slate-300'}`}>{p.readiness}/5</span>
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── Team calendar ── */}
          {mainSection === 'calendar' && (
            <div className="coach-week-overview mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
              <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200/45">План → факт → решение</div>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Неделя команды</h2>
                  <p className="mt-1 text-[12px] text-slate-500">
                    {calWeekStart && `${coachDate(calWeekStart)} — ${coachDate(addDaysToStr(calWeekStart, 6))}`}
                    {' · '}план, выполнение и точки внимания по каждому игроку
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {calLoading && <Loader2 size={14} className="animate-spin text-slate-600" />}
                  <button
                    type="button"
                    onClick={() => setCalWeekStart(addDaysToStr(calWeekStart, -7))}
                    aria-label="Предыдущая неделя" className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.07] text-slate-500 hover:bg-white/[0.05] hover:text-white transition"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalWeekStart(getMondayOf(todayISO()))}
                    className="rounded-xl border border-white/[0.07] px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-white/[0.05] hover:text-white transition"
                  >
                    Сегодня
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalWeekStart(addDaysToStr(calWeekStart, 7))}
                    aria-label="Следующая неделя" className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.07] text-slate-500 hover:bg-white/[0.05] hover:text-white transition"
                  >
                    <ChevronRight size={15} />
                  </button>
                  <button type="button" onClick={() => loadCalendarWeek(false)} disabled={calLoading} className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] text-slate-500 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40" title="Обновить неделю">
                    <RefreshCw size={14} className={calLoading ? 'animate-spin' : ''} />
                  </button>
                  {calData?.latestBatch?.rollbackAvailable && (
                    <button type="button" onClick={() => setWeekRollbackBatch(calData.latestBatch)} className="min-h-9 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 text-[10px] font-black text-amber-100 transition hover:bg-amber-300/[0.1]">
                      <span className="inline-flex items-center gap-1.5"><RotateCcw size={12} /> Откатить последний пакет</span>
                    </button>
                  )}
                  <button type="button" onClick={createWeekAdaptationBatch} disabled={!weekBatchSelected.size || weekBatchSaving || calLoading || !!calendarError || readinessData?.cache==='stale' || readinessData?.revalidating} className="min-h-9 rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-4 text-[11px] font-black text-[#071013] shadow-[0_10px_30px_rgba(94,234,212,0.12)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35">
                    {weekBatchSaving ? <Loader2 size={13} className="inline animate-spin" /> : <SlidersHorizontal size={13} className="inline" />} {weekBatchSelected.size ? `Адаптировать пакет · ${weekBatchSelected.size}` : 'Выберите программы сегодня'}
                  </button>
                </div>
              </div>

              <OverviewFreshness updatedAt={calendarUpdatedAt} error={calendarError} loading={calLoading} label="Неделя"/>
              <div className="coach-overview-shortcuts"><button type="button" onClick={()=>setMainSection('today')}>Сегодня →</button><button type="button" onClick={()=>setMainSection('tonnage')}>Нагрузка и факт →</button><button type="button" onClick={()=>openOverviewSection('drafts')}>Командные черновики →</button></div>
              {calData?.summary && (
                <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    { label: 'Сессии', value: calData.summary.sessions || 0, sub: `${calData.summary.completed || 0} завершено`, tone: 'text-white' },
                    { label: 'Плановый объём', value: compactLoad(calData.summary.plannedTonnage), sub: `${calData.summary.plannedSets || 0} подходов`, tone: 'text-cyan-100' },
                    { label: 'План / бюджет команды', value: calData.summary.budgetTonnage>0?`${calData.summary.utilizationPercent || 0}%`:'Нет базы', sub: compactLoad(calData.summary.budgetTonnage), tone: calData.summary.utilizationPercent > 103 ? 'text-rose-300' : calData.summary.utilizationPercent >= 90 ? 'text-amber-200' : 'text-emerald-200' },
                    { label: 'Конфликты', value: calData.summary.conflicts || 0, sub: calData.summary.overBudget ? `${calData.summary.overBudget} выше бюджета` : `${calData.summary.calibrating || 0} калибруются`, tone: calData.summary.conflicts ? 'text-amber-200' : 'text-emerald-200' },
                  ].map(card => (
                    <div key={card.label} className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.035] to-transparent p-4">
                      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-600">{card.label}</div>
                      <div className={`mt-2 text-2xl font-black tabular-nums ${card.tone}`}>{card.value}</div>
                      <div className="mt-1 text-[10px] text-slate-600">{card.sub}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="coach-overview-filters"><button type="button" aria-pressed={weekConflictsOnly} onClick={()=>setWeekConflictsOnly(v=>!v)}>Только конфликты</button><span>Показано {(calData?.athletes || []).filter(athlete=>!weekConflictsOnly || athlete.conflicts?.length).length} из {calData?.athletes?.length || 0} игроков</span>{weekConflictsOnly && <button type="button" onClick={()=>setWeekConflictsOnly(false)}>Сбросить фильтр</button>}</div><p className="coach-overview-caption">Бюджет — ориентир относительно предыдущих недель: учитываются подходы и тоннаж, источником базы может быть план или факт. Процент отражает плановый объём, не медицинский допуск. Пропуски факта показаны отдельно.</p>
              {calData && calData.players.length > 0 ? (
                <>
                <div className="coach-week-scroll overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#091116]/80 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
                  <table className="coach-week-table w-full min-w-[960px] border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="w-64 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-600">Игрок · бюджет</th>
                        {(calData.dates || []).map(d => {
                          const dow = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][new Date(d + 'T12:00:00Z').getUTCDay()];
                          const isToday = d === todayISO();
                          return (
                            <th key={d} className={`min-w-[128px] px-2 py-3 text-left ${isToday ? 'bg-cyan-300/[0.035] text-cyan-200' : 'text-slate-600'}`}>
                              <div className="text-[10px] font-black uppercase tracking-wide">{dow}</div>
                              <div className={`mt-0.5 text-[9px] font-semibold ${isToday ? 'text-cyan-200/50' : 'text-slate-700'}`}>
                                {coachDate(d)}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {(calData.athletes || []).filter(athlete=>!weekConflictsOnly || athlete.conflicts?.length).map((athlete, pi) => {
                        const p = athlete.player;
                        const budgetTone = athlete.budget.status === 'over' ? 'bg-rose-300' : athlete.budget.status === 'near' ? 'bg-amber-300' : athlete.budget.status === 'calibrating' ? 'bg-slate-500' : 'bg-emerald-300';
                        return (
                        <tr key={p.id} className={`border-b border-white/[0.035] align-top transition hover:bg-white/[0.018] ${pi % 2 !== 0 ? 'bg-white/[0.008]' : ''}`}>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => openOverviewPlayer(p,calWeekStart)}
                              className="flex w-full items-center gap-2.5 text-left transition hover:opacity-80"
                            >
                              <div className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-xl text-[10px] font-black ${
                                playerId === p.id ? 'bg-accent text-[#060a0e]' : 'bg-white/[0.07] text-slate-500'
                              }`}>{initials(p.name)}</div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-semibold text-slate-300 truncate">{p.name}</div>
                                <div className="text-[9px] text-slate-700 truncate">{p.position || 'Игрок'}</div>
                              </div>
                            </button>
                            <OverviewSignals issues={readinessIssues(readinessData?.players?.find(item=>String(item.id)===String(p.id)),readinessData,workspace)}/>
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[9px]"><span className="font-bold text-slate-600">Бюджет</span><span className={`font-black tabular-nums ${athlete.budget.status === 'over' ? 'text-rose-300' : athlete.budget.status === 'near' ? 'text-amber-200' : 'text-slate-400'}`}>{budgetLabel(athlete.budget)}</span></div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className={`h-full rounded-full ${budgetTone}`} style={{ width: `${athlete.budget.status==='calibrating' || !(athlete.budget.sets>0 || athlete.budget.tonnage>0)?0:Math.min(100, athlete.budget.utilizationPercent)}%` }} /></div>
                              <div className="mt-1.5 flex items-center justify-between text-[8px] text-slate-700"><span>{athlete.budget.source}</span><span>{compactLoad(athlete.budget.tonnage)}</span></div>
                              <details className="coach-week-budget"><summary>Основание бюджета</summary><p className="mt-1 text-xs text-slate-300">База: {athlete.budget.referenceSets ?? '—'} подходов · {athlete.budget.referenceTonnage!=null?compactLoad(athlete.budget.referenceTonnage):'нет тоннажа'}. Факт недели: {compactLoad(athlete.totals?.actualTonnage)}; полноту проверяйте в занятиях.</p>{(athlete.budget.sourceWeeks || []).map(week=><section key={week.from}><strong>{week.from} → {week.to}</strong><p>{week.sessions} занятий · {week.referenceSets} подходов · {compactLoad(week.referenceTonnage)}{!week.sessions?' · нет занятий, в медиану не входит':''}</p>{week.entries.map(entry=><p key={entry.date}>{entry.date} · {entry.label} · {entry.sets} подходов ({entry.setsBasis==='fact'?'факт':'план'}) · {compactLoad(entry.tonnage)} ({entry.tonnageBasis==='fact'?'факт':'план'})</p>)}</section>)}</details>{athlete.budget.rtp && <div className="mt-1 text-[8px] font-bold text-violet-300/60">RTP {athlete.budget.rtp.phase} · лимит {athlete.budget.rtp.volumeCap}%</div>}
                            </div>
                          </td>
                          {(athlete.days || []).map(day => {
                            const d = day.date;
                            const readyDraft=overviewDraft(p.id,d);
                            const isToday = d === todayISO();
                            const dayConflicts = (athlete.conflicts || []).filter(conflict => conflict.date === d);
                            const generalConflict = (athlete.conflicts || []).some(conflict => !conflict.date);
                            const recommendation = teamStatus[p.id]?.adaptation;
                            const selectable = !calLoading && !calendarError && readinessData?.cache!=='stale' && !readinessData?.revalidating && isToday && day.hasSession && !day.started && !day.completed && Boolean(recommendation);
                            const selectionKey = `${p.id}:${d}`;
                            const selected = weekBatchSelected.has(selectionKey);
                            return (
                              <td key={d} className={`border-l border-white/[0.025] px-2 py-3 ${isToday ? 'bg-cyan-300/[0.025]' : ''}`}>
                                {day.hasSession ? <div className={`min-h-[68px] rounded-xl border p-2.5 transition ${selected ? 'border-cyan-300/35 bg-cyan-300/[0.08]' : dayConflicts.length || generalConflict ? 'border-amber-300/15 bg-amber-300/[0.025]' : 'border-white/[0.055] bg-white/[0.018]'}`}>
                                  <div className="flex items-start justify-between gap-2">
                                    <button type="button" onClick={() => openOverviewPlayer(p,d)} className="min-w-0 flex-1 text-left">
                                      <div className="truncate text-[10px] font-black text-slate-300">{trainingTitle(day.label)}</div>
                                    </button>
                                    {selectable && <button type="button" onClick={() => toggleWeekBatch(String(p.id), d)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition ${selected ? 'border-cyan-200/40 bg-cyan-200 text-[#071013]' : 'border-white/[0.09] text-slate-600 hover:text-cyan-200'}`} title="Добавить в пакет адаптации">{selected ? <Check size={12} strokeWidth={3} /> : <Square size={12} />}</button>}
                                  </div>
                                  <div className="mt-2 flex items-center gap-2 text-[9px] text-slate-600"><span>{day.plannedSets} подх.</span><span>·</span><span>План {compactLoad(day.plannedTonnage)}</span></div>
                                  {day.completed ? <div className="mt-2"><div className="flex items-center justify-between text-[8px]"><span className="font-bold text-emerald-200/60">Подходы завершены</span><span className="text-slate-500">{day.completionPercent}%</span></div><div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.min(100, day.completionPercent)}%` }} /></div></div> : <div className={`mt-2 text-[8px] font-semibold ${day.started ? 'text-cyan-200/60' : 'text-slate-700'}`}>{day.started ? 'Выполняется сейчас' : 'Запланировано'}</div>}
                                  <p className="mt-1 text-xs text-slate-300">Записано: {sessionFactAmount(day.actualTonnage,day.loadEvidence,{completed:day.completed,completedSets:day.completedSets})}</p><details className="coach-week-evidence"><summary>Полнота факта</summary><OverviewSignals issues={day.date>todayISO() && day.loadEvidence?.source==='missing'?[]:loadEvidenceLabel(day.loadEvidence)?[loadEvidenceLabel(day.loadEvidence)]:[]}/></details>
                                  {(dayConflicts.length > 0 || generalConflict) && <div className="mt-2 flex items-center gap-1 text-[8px] font-bold text-amber-200/70"><AlertTriangle size={9} /> {dayConflicts[0]?.title || 'Проверьте бюджет недели'}</div>}
                                </div> : (
                                <button
                                  type="button"
                                  onClick={() => readyDraft?openBatchDraft(readyDraft):openOverviewPlayer(p,d)}
                                  title={`${p.name} · ${d} · ${readyDraft?'Открыть черновик':'Открыть игрока'}`}
                                  className="flex min-h-[68px] w-full items-center justify-center rounded-xl border border-dashed border-white/[0.035] text-slate-800 transition hover:border-white/[0.08] hover:bg-white/[0.02] hover:text-slate-600"
                                >
                                  {readyDraft?<span className="text-xs text-emerald-200">Черновик →</span>:<Plus size={13} />}
                                </button>)}
                              </td>
                            );
                          })}
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              {apiKey && <TeamFactOverview key={'week:'+workspace} workspace={workspace} apiKey={apiKey} refreshToken={factsRefresh} fixedPeriod={weekFactPeriod(calWeekStart)} compact label="Факты недели · кг, повторы и RPE" onFacts={openHistoryFacts} onProgram={openOverviewPlayer}/>}
                {(calData.summary?.conflicts || 0) > 0 && (
                  <div className="mt-5 rounded-2xl border border-amber-300/10 bg-amber-300/[0.025] p-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100/70"><AlertTriangle size={13} /> Контрольные точки недели</div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {(calData.athletes || []).flatMap(athlete => (athlete.conflicts || []).map(conflict => ({ ...conflict, player: athlete.player }))).map((conflict, index) => (
                        <div key={`${conflict.player.id}-${conflict.code}-${conflict.date || index}`} className="rounded-xl border border-white/[0.055] bg-black/10 px-3 py-2.5">
                          <button type="button" onClick={()=>openOverviewPlayer(conflict.player,conflict.date || calWeekStart)} className="coach-player-link">{conflict.player.name} · {conflict.title} ↗</button>
                          <div className="mt-1 text-[9px] leading-relaxed text-slate-600">{conflict.date ? `${coachDate(conflict.date)} · ` : ''}{trainingTitle(conflict.detail)}</div>{conflict.code==='dense_loading' && <div className="coach-overview-actions">{[addDaysToStr(conflict.date,-1),conflict.date].map(d=><button type="button" key={d} onClick={()=>openOverviewPlayer(conflict.player,d)}>{coachDate(d)} · программа ↗</button>)}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </>
              ) : !calLoading && !calendarError ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
                  <CalendarDays size={40} className="text-slate-800" />
                  <p className="text-[14px] font-semibold text-slate-600">Нет данных о тренировках</p>
                  <p className="text-[12px] text-slate-700">Сначала добавь игроков и сохрани тренировки</p>
                </div>
              ) : null}

              {weekBatchDraft && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020609]/85 p-4 backdrop-blur-md">
                  <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-cyan-300/15 bg-[#0a141a] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.6)]">
                    <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/55">Атомарный пакет · {weekBatchDraft.members.length} программ</div><h3 className="mt-1 text-xl font-black text-white">Проверка командной адаптации</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">Все изменения применятся одной транзакцией. Если хотя бы одна программа изменилась, пакет целиком будет остановлен.</p></div><button type="button" onClick={() => setWeekBatchDraft(null)} disabled={weekBatchSaving} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] text-slate-500"><X size={16} /></button></div>
                    <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/[0.07] bg-black/15 p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-600">До</div><div className="mt-2 text-xl font-black text-white">{weekBatchDraft.members.reduce((sum, member) => sum + (member.before?.sets || 0), 0)} подходов</div><div className="mt-1 text-[10px] text-slate-600">{weekBatchDraft.members.reduce((sum, member) => sum + (member.before?.loadKgSets || 0), 0)} кг·подх.</div></div><div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4"><div className="text-[9px] font-black uppercase tracking-wider text-cyan-200/50">После</div><div className="mt-2 text-xl font-black text-cyan-100">{weekBatchDraft.members.reduce((sum, member) => sum + (member.after?.sets || 0), 0)} подходов</div><div className="mt-1 text-[10px] text-cyan-200/45">{weekBatchDraft.members.reduce((sum, member) => sum + (member.after?.loadKgSets || 0), 0)} кг·подх.</div></div></div>
                    <div className="mt-4 space-y-2">{weekBatchDraft.members.map(member => <div key={`${member.playerId}:${member.date}`} className="flex items-center gap-3 rounded-2xl border border-white/[0.065] bg-white/[0.02] p-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-[10px] font-black text-slate-400">{initials(member.playerName)}</div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-black text-slate-200">{member.playerName}</div><div className="mt-0.5 text-[9px] text-slate-600">{member.recommendation?.label} · {member.recommendation?.volumePercent}% объёма</div></div><div className="shrink-0 text-right text-[9px] text-slate-600"><div>{member.before?.sets || 0} → <span className="font-black text-cyan-200">{member.after?.sets || 0}</span></div><div className="mt-0.5">подходов</div></div></div>)}</div>
                    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setWeekBatchDraft(null)} disabled={weekBatchSaving} className="min-h-11 rounded-xl border border-white/[0.08] px-5 text-[11px] font-black text-slate-400">Отменить</button><button type="button" onClick={confirmWeekAdaptationBatch} disabled={weekBatchSaving} className="min-h-11 rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-6 text-[11px] font-black text-[#071013] disabled:opacity-50">{weekBatchSaving ? <Loader2 size={14} className="inline animate-spin" /> : <Shield size={14} className="inline" />} Подтвердить весь пакет</button></div>
                  </div>
                </div>, document.body
              )}

              {weekRollbackBatch && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020609]/85 p-4 backdrop-blur-md"><div className="w-full max-w-md rounded-[26px] border border-amber-300/15 bg-[#0a141a] p-6 shadow-2xl"><div className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] text-amber-200"><RotateCcw size={19} /></div><h3 className="mt-4 text-xl font-black text-white">Откатить пакет?</h3><p className="mt-2 text-[11px] leading-relaxed text-slate-500">Будут восстановлены {weekRollbackBatch.members?.length || 0} исходных программ. Откат выполнится целиком и только если после применения ни одна программа не менялась.</p><div className="mt-5 flex gap-2"><button type="button" onClick={() => setWeekRollbackBatch(null)} disabled={weekBatchSaving} className="min-h-11 flex-1 rounded-xl border border-white/[0.08] text-[11px] font-black text-slate-400">Оставить</button><button type="button" onClick={rollbackWeekAdaptationBatch} disabled={weekBatchSaving} className="min-h-11 flex-1 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] text-[11px] font-black text-amber-100 disabled:opacity-50">{weekBatchSaving ? <Loader2 size={14} className="inline animate-spin" /> : 'Откатить пакет'}</button></div></div></div>, document.body
              )}
            </div>
          )}

          {/* ── Monthly planner workspace ── */}
          {mainSection === 'planner' && usesSeasonCalendar(workspace) && (
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-white">План месяца</h2>
                  <p className="mt-0.5 text-[12px] text-slate-600">{monthLabel(plannerMonth)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {plannerLoading && <Loader2 size={14} className="animate-spin text-slate-600" />}
                  <button type="button" onClick={() => setPlannerMonth(shiftMonth(plannerMonth, -1))} className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.07] text-slate-500 hover:bg-white/[0.05] hover:text-white transition">
                    <ChevronLeft size={15} />
                  </button>
                  <button type="button" onClick={() => setPlannerMonth(todayISO().slice(0, 7))} className="rounded-xl border border-white/[0.07] px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-white/[0.05] hover:text-white transition">
                    Сегодня
                  </button>
                  <button type="button" onClick={() => setPlannerMonth(shiftMonth(plannerMonth, 1))} className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.07] text-slate-500 hover:bg-white/[0.05] hover:text-white transition">
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => (
                  <div key={d} className="pb-1 text-center text-[10px] font-black uppercase tracking-wide text-slate-700">{d}</div>
                ))}
                {getMonthGrid(plannerMonth).map((dateStr, i) => {
                  if (!dateStr) return <div key={`e${i}`} />;
                  const day = plannerDayFor(dateStr);
                  const isToday = dateStr === todayISO();
                  const dnum = parseInt(dateStr.slice(8), 10);
                  return (
                    <div key={dateStr} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (day && day.type === 'training') { setDate(dateStr); setMainSection('workouts'); }
                          else setPlannerEditDate(plannerEditDate === dateStr ? null : dateStr);
                        }}
                        className={`flex min-h-[68px] w-full flex-col rounded-xl border p-1.5 text-left transition hover:brightness-125 ${plannerCellClass(day)} ${isToday ? 'ring-1 ring-cyan-400/60' : ''}`}
                      >
                        <span className="text-[11px] font-black opacity-80">{dnum}</span>
                        <span className="mt-auto flex items-center gap-1 text-[10px] font-bold leading-tight">
                          {day?.type === 'game' && <><Swords size={10} /> Игра</>}
                          {day?.type === 'travel' && <><Plane size={10} /> Перелёт</>}
                          {day?.type === 'rest' && <>—</>}
                          {day?.type === 'training' && <span className="truncate">{PLANNER_FOCUS_SHORT[day.focus] || 'Трен.'}</span>}
                        </span>
                        {day?.note && <span className="mt-0.5 truncate text-[9px] font-medium opacity-60">{day.note}</span>}
                      </button>

                      {plannerEditDate === dateStr && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setPlannerEditDate(null)} />
                          <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-xl border border-white/[0.1] bg-[#0b1320] p-2 shadow-2xl">
                            <p className="mb-1 px-1 text-[9px] font-black uppercase tracking-wider text-slate-600">{dateStr.slice(5)}</p>
                            <div className="space-y-0.5">
                              {PLANNER_TYPES.map(t => (
                                <button
                                  key={t.value}
                                  type="button"
                                  onClick={() => { savePlannerDay(dateStr, { type: t.value }); setPlannerEditDate(null); }}
                                  className={`block w-full rounded-lg px-2 py-1 text-left text-[11px] font-semibold transition ${
                                    day?.type === t.value ? 'bg-cyan-500/[0.15] text-cyan-300' : 'text-slate-400 hover:bg-white/[0.05]'
                                  }`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              defaultValue={day?.note || ''}
                              placeholder="Заметка..."
                              onBlur={e => savePlannerDay(dateStr, { note: e.target.value })}
                              className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-cyan-400/50"
                            />
                            {day && (
                              <button
                                type="button"
                                onClick={() => { savePlannerDay(dateStr, null); setPlannerEditDate(null); }}
                                className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg py-1 text-[10px] font-semibold text-rose-400 hover:bg-rose-500/[0.1]"
                              >
                                <X size={10} /> Очистить
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="mt-4 text-center text-[11px] text-slate-700">
                Клик по дню — выбор типа · клик по тренировочному дню — открыть сессию
              </p>
            </div>
          )}

          {keyConnected && mainSection==='team' && <TeamPreparation key={workspace+date} workspace={workspace} date={date} players={players} statuses={teamStatus} initialRequest={{period:'inseason',focus:'inseason_strength',trainingType:'full_body',strengthMode:'maintenance',powerMode:'development',dayGoal:'',notes:'',days:7,coachRecovery:'green'}} periods={PERIODS} phasesFor={value=>phasesForWorkspace(value,workspace).map(phase=>({...phase,label:phaseLabelForWorkspace(phase,workspace)}))} defaultTypeFor={defaultTrainingTypeForFocus} typesFor={value=>value==='inseason_strength'?STRENGTH_TRAINING_TYPES:TRAINING_TYPES} busy={teamQueue.recovering} running={batchRunning} queue={teamQueue.queue} queuePanel={teamQueuePanel} previousQueue={teamQueue.previousQueue} onPrevious={()=>changeTrainingDate(teamQueue.previousQueue.date)} onGenerate={executeTeamGeneration} calendar={<DatePicker navigate quickDays timeZone="Europe/Moscow" value={date} onChange={changeTrainingDate} disabled={saving || teamDraftOpening || !!batchId} maxDate={addDaysToStr(todayISO(),1)} size="sm"/>}/>}
          {teamModalOpen && <TeamProgramDialog open name={selectedPlayer?.name || 'Программа игрока'} date={date} opening={teamDraftOpening} saving={saving || teamQueue.recovering} error={error || teamQueue.error} saved={!!batchResults.find(row=>String(row.playerId)===String(playerId))?.saved} onClose={closeTeamProgram} onSave={()=>handleSave()} onSaveNext={()=>handleSave(true)} validationBlocked={plannedIssues.length>0} saveBlocked={executionConfirmed || session?.kind==='restricted_day_plan'} draftSaved={justSaved && !!pendingSaved?.draft} onSaveDraft={meta?.teamDraft && pendingSaved?.draft?saveTeamCorrection:null} onPrevious={(()=>{const list=batchResults.filter(row=>row.status==='done' && !row.saved),index=list.findIndex(row=>String(row.playerId)===String(playerId));return index>0?()=>openBatchDraft(list[index-1]):null;})()} onNext={(()=>{const list=batchResults.filter(row=>row.status==='done' && !row.saved),index=list.findIndex(row=>String(row.playerId)===String(playerId));return index>=0 && index<list.length-1?()=>openBatchDraft(list[index+1]):null;})()}>{savedProgram}</TeamProgramDialog>}
          {keyConnected && mainSection==='workouts' && workspaceTab==='program' && !playerId && batchSelectedIds.size===0 && <CoachHome workspace={workspace} players={players} date={date} onSelectPlayer={selectPlayer} onNavigate={setMainSection} calendar={<DatePicker navigate timeZone={activePlayerTimeZone} value={date} onChange={changeTrainingDate} disabled={loading || !!batchId || saving || batchRunning || weekPlanLoading} maxDate={addDaysToStr(playerToday,1)} size="sm" />} />}
          {keyConnected && mainSection==='workouts' && <TeamFactOverview key={workspace} workspace={workspace} apiKey={apiKey} refreshToken={factsRefresh} onFacts={openHistoryFacts} onProgram={openOverviewPlayer}/>}
          {keyConnected && mainSection==='workouts' && <div className="mx-auto w-full max-w-[1480px] px-4 pt-4 sm:px-8 lg:px-10"><details className="coach-aux-panels"><summary>Инвентарь и подготовка следующего цикла</summary><StrengthEquipmentPanel key={workspace} workspace={workspace} apiKey={apiKey} /><StrengthTeamNextReview key={`next:${workspace}`} workspace={workspace} players={players} apiKey={apiKey} date={date} onSelectPlayer={player=>{selectPlayer(player);setMainSection('workouts');}} /></details></div>}

          {/* ── Today · smart decision centre ── */}
          {mainSection==='library' && apiKey && <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-8 lg:px-10"><header className="coach-overview-header"><div><p className="coach-overview-eyebrow">Общая библиотека обоих пространств</p><h2>Библиотека упражнений</h2><p>Просматривайте технику, сохраняя программу в редакторе.</p></div><button type="button" onClick={()=>setMainSection('workouts')}>Вернуться к программе ↗</button><a href="/library" target="_blank" rel="noopener noreferrer">Управление каталогом ↗</a></header><ExerciseLibraryPicker key={workspace} apiKey={apiKey}/></div>}
          {mainSection === 'today' && (
            <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
              <header className="coach-overview-header"><div><p className="coach-overview-eyebrow">Команда · {todayISO().split('-').reverse().join('.')}</p><h2>Сегодня</h2><p>Решения, программы и качество исходных данных — в одном обзоре.</p></div><button type="button" disabled={readinessLoading} onClick={()=>loadTodayOverview(false,true)}><RefreshCw size={15} className={readinessLoading?'animate-spin':''}/> Обновить данные</button></header>
              <TodayOverview workspace={workspace} key={workspace} center={todayCenter} readinessData={todaySnapshot?.workspace===workspace?todaySnapshot.readiness:readinessData} loading={readinessLoading || teamStatusLoading} error={todayError || teamStatusError} updatedAt={todayUpdatedAt} onPlayer={openOverviewPlayer} onHistory={player=>openOverviewPlayer(player,todayISO(),'history')} onDraft={openBatchDraft} getDraft={overviewDraft} onVersions={openSessionVersions} onRtp={openReturnToPlay} onAdapt={applyTodayRecommendation} adaptationSaving={adaptationSaving} onNavigate={openOverviewSection}/>
              {apiKey && <TeamFactOverview key={'today:'+workspace} workspace={workspace} apiKey={apiKey} refreshToken={factsRefresh} compact label="Заполнить факты · последние занятия команды" onFacts={openHistoryFacts} onProgram={openOverviewPlayer}/>}
          {keyConnected && mainSection==='today' && <div className="mx-auto w-full max-w-[1480px] px-4 pt-4 sm:px-8 lg:px-10"><details className="coach-aux-panels"><summary>Инвентарь и подготовка следующего цикла</summary><StrengthEquipmentPanel key={workspace} workspace={workspace} apiKey={apiKey} /><StrengthTeamNextReview key={`next:${workspace}`} workspace={workspace} players={players} apiKey={apiKey} date={date} onSelectPlayer={player=>{selectPlayer(player);setMainSection('workouts');}} /></details></div>}

              {rtpPlayer && <ReturnToPlayModal player={rtpPlayer} plan={rtpDraft} saving={rtpSaving} onChange={setRtpDraft} onSave={saveReturnToPlay} onClose={() => { setRtpPlayer(null); setRtpDraft(null); }} />}
              {adaptationDraft && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#02060d]/85 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Подтверждение адаптации">
                  <div className="w-full max-w-xl rounded-3xl border border-cyan-300/15 bg-[#0b1421] p-5 shadow-2xl sm:p-6">
                    <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/60">Безопасный черновик</div><h3 className="mt-1 text-xl font-black text-white">{adaptationDraft.player?.name}</h3><p className="mt-1 text-[11px] text-slate-500">Исходная программа не изменена. Применение требует явного решения тренера.</p></div><button type="button" onClick={closeAdaptationDraft} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] text-slate-500"><X size={16} /></button></div>
                    <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/[0.07] bg-black/15 p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-600">До</div><div className="mt-2 text-lg font-black text-white">{adaptationDraft.before?.sets || 0} подходов</div><div className="mt-1 text-[10px] text-slate-600">Нагрузка {adaptationDraft.before?.loadKgSets || 0} кг·подх.</div></div><div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4"><div className="text-[9px] font-black uppercase tracking-wider text-cyan-200/50">После</div><div className="mt-2 text-lg font-black text-cyan-100">{adaptationDraft.after?.sets || 0} подходов</div><div className="mt-1 text-[10px] text-cyan-200/45">Нагрузка {adaptationDraft.after?.loadKgSets || 0} кг·подх.</div></div></div>
                    <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[12px] font-black text-white">{adaptationDraft.recommendation?.label}</div><div className="mt-1 text-[10px] text-slate-500">Объём {adaptationDraft.recommendation?.volumePercent}% · Интенсивность {adaptationDraft.recommendation?.intensityPercent}% · RPE ≤ {adaptationDraft.recommendation?.rpeCap}</div><div className="mt-3 text-[10px] leading-relaxed text-slate-500">{adaptationDraft.recommendation?.reasons?.join(' · ')}</div>{adaptationDraft.recommendation?.safeguards?.length > 0 && <div className="mt-2 text-[10px] font-semibold leading-relaxed text-emerald-200/65">{adaptationDraft.recommendation.safeguards.join(' · ')}</div>}</div>
                    <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" disabled={adaptationSaving} onClick={closeAdaptationDraft} className="min-h-12 rounded-xl border border-white/[0.09] bg-white/[0.03] text-[11px] font-bold text-slate-400">Отменить</button><button type="button" disabled={adaptationSaving} onClick={confirmAdaptationDraft} className="min-h-12 rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 text-[11px] font-black text-[#06121a] disabled:opacity-50">{adaptationSaving ? 'Применяю…' : 'Подтвердить и применить'}</button></div>
                  </div>
                </div>, document.body
              )}
              {versionPlayer && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#02060d]/85 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Версии программы">
                  <div className="w-full max-w-lg rounded-3xl border border-white/[0.1] bg-[#0b1421] p-5 shadow-2xl"><div className="flex items-start justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">Откат программы</div><h3 className="mt-1 text-lg font-black text-white">{versionPlayer.name}</h3></div><button type="button" onClick={() => setVersionPlayer(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] text-slate-500"><X size={16} /></button></div>
                    <div className="mt-5 space-y-2">{versionLoading ? <div className="py-10 text-center text-[11px] text-slate-500"><Loader2 size={17} className="mx-auto mb-2 animate-spin" />Загружаю версии…</div> : sessionVersions.length === 0 ? <div className="rounded-2xl border border-white/[0.07] py-9 text-center text-[11px] text-slate-600">Предыдущих версий пока нет</div> : sessionVersions.map(version => <div key={version.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3"><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-black text-slate-200">{version.adaptation?.label || version.label}</div><div className="mt-1 text-[9px] text-slate-600">{version.savedAt ? new Date(version.savedAt).toLocaleString('ru') : 'Без даты'} · {version.stats?.sets || 0} подходов</div></div><button type="button" onClick={() => restoreSessionVersion(version.savedAt)} className="min-h-10 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] px-3 text-[10px] font-black text-cyan-200">Восстановить</button></div>)}</div>
                  </div>
                </div>, document.body
              )}
            </div>
          )}

          {/* ── Team floor command centre ── */}
          {mainSection === 'live' && (
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> Floor command centre
                  </div>
                  <h2 className="text-2xl font-black tracking-tight text-white">{liveDebrief?'Разбор завершённых тренировок':'Тренировка команды LIVE'}</h2>
                  <p className="mt-1 text-[12px] text-slate-500">Сегодня · обновление каждые 8 секунд · последнее {compactTime(liveUpdatedAt)}</p>
                </div>
                <button type="button" onClick={() => loadTeamStatus(todayISO())} className="min-h-11 rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-[12px] font-bold text-slate-300 transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50">
                  {teamStatusLoading ? 'Обновление…' : 'Обновить сейчас'}
                </button>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ['Программы', liveSummary.planned, 'text-cyan-200'],
                  ['В работе', liveSummary.started - liveSummary.completed, 'text-amber-200'],
                  ['Завершили', liveSummary.completed, 'text-emerald-200'],
                  ['Требуют внимания', liveSummary.alerts, liveSummary.alerts ? 'text-rose-200' : 'text-slate-300'],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-2xl border border-white/[0.075] bg-white/[0.028] p-4 backdrop-blur-xl">
                    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-600">{label}</div>
                    <div className={`mt-2 text-3xl font-black ${color}`}>{!liveUpdatedAt?'…':Math.max(0, value)}</div>
                  </div>
                ))}
              </div>

              <div className="coach-overview-filters"><button type="button" aria-pressed={!liveDebrief} onClick={()=>setLiveDebrief(false)}>Активные занятия</button><button type="button" aria-pressed={liveDebrief} onClick={()=>setLiveDebrief(true)}>Разбор завершённых · {liveSummary.completed}</button><button type="button" aria-pressed={liveAttentionOnly} onClick={()=>setLiveAttentionOnly(v=>!v)}>Требуют внимания</button><button type="button" onClick={()=>openOverviewSection('drafts')}>Подготовить программы →</button></div>{!liveDebrief && liveSummary.planned>0 && liveSummary.completed===liveSummary.planned && <p className="coach-overview-empty">Все назначенные занятия завершены. Откройте разбор завершённых.</p>}{!liveSummary.planned && <p className="coach-overview-empty">На сегодня программы не назначены. Откройте командные черновики для подготовки.</p>}<details className="coach-overview-secondary"><summary>Без программы · {liveRows.filter(row=>!row.status.hasSession).length}</summary><div className="coach-overview-actions">{liveRows.filter(row=>!row.status.hasSession).map(({player})=><button type="button" key={player.id} onClick={()=>openOverviewPlayer(player,todayISO())}>{player.name} →</button>)}</div></details>
              {!liveDebrief && stationRotation.length > 0 && (
                <div className="mb-6 rounded-3xl border border-cyan-300/10 bg-gradient-to-br from-cyan-300/[0.055] to-violet-300/[0.025] p-4 backdrop-blur-xl">
                  <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200/60">Автоматическая разводка</div><div className="mt-1 text-[14px] font-black text-white">Станции и ротация групп</div></div><span className="rounded-full border border-cyan-300/15 px-2.5 py-1 text-[9px] font-bold text-cyan-200">до 3 игроков</span></div>
                  <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {stationRotation.map(group => <div key={group.id} className="rounded-2xl border border-white/[0.07] bg-black/15 p-3"><div className="text-[11px] font-black text-white">{group.label}</div><div className="mt-1 truncate text-[10px] text-slate-500">{group.members.map(member => member.name.split(' ')[0]).join(' · ')}</div><div className="mt-3 flex gap-1.5 overflow-x-auto">{group.rotation.map(item => <div key={item.round} className="min-w-[96px] rounded-xl border border-white/[0.06] bg-white/[0.025] px-2.5 py-2"><div className="text-[9px] font-black text-cyan-200">{item.round}. Блок {item.block}</div><div className="mt-0.5 text-[9px] leading-tight text-slate-600">{item.station}</div></div>)}</div></div>)}
                  </div>
                </div>
              )}

              {teamStatusLoading && !liveUpdatedAt ? (
                <div className="flex items-center justify-center py-24 text-sm text-slate-500"><Loader2 size={18} className="mr-2 animate-spin" /> Загружаю команду…</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {liveRows.filter(row=>row.status.hasSession && (!!(row.status.live?.completed || row.status.live?.endedEarly)===liveDebrief) && (!liveAttentionOnly || row.status.live?.alerts?.length || row.status.pendingCommands?.length)).map(({ player, status }) => {
                    const live = status.live;
                    const tone = !status.hasSession ? 'border-white/[0.07]' : live?.completed ? 'border-emerald-300/20' : live?.started ? 'border-cyan-300/20' : 'border-amber-300/15';
                    return (
                      <article key={player.id} className={`rounded-2xl border ${tone} bg-gradient-to-br from-white/[0.04] to-white/[0.018] p-4 backdrop-blur-xl`}>
                        <div className="flex items-start gap-3">
                          {player.photo ? <img src={player.photo} alt="" className="h-11 w-11 rounded-xl object-cover object-top ring-1 ring-white/10" /> : <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.07] text-xs font-black text-slate-300">{initials(player.name)}</div>}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-bold text-white">{player.name}</div>
                            <div className="mt-0.5 truncate text-[10px] text-slate-600">{status.trainingLabel || player.position || 'Нет программы'}</div>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                            !status.hasSession ? 'bg-white/[0.05] text-slate-600' : live?.completed ? 'bg-emerald-300/10 text-emerald-200' : live?.started ? 'bg-cyan-300/10 text-cyan-200' : 'bg-amber-300/10 text-amber-200'
                          }`}>{!status.hasSession ? 'Нет плана' : live?.endedEarly ? (live.finishReason ? 'Завершена раньше' : 'С пропусками') : live?.completed ? 'Готово' : live?.started ? `Блок ${live.activeBlock || '—'}` : 'Ожидает'}</span>
                        </div>

                        {status.hasSession && live && (
                          <>
                            {live.finishReason && <p className="mt-3 text-xs text-amber-200">Причина: {live.finishReason}</p>}
                            {(live.skippedExercises || []).map((item, index) => <p key={index} className="mt-2 text-xs text-amber-200">Пропуск · {item.name}: {item.reason}</p>)}
                            <div className="mt-4 flex items-end justify-between text-[11px]">
                              <span className="text-slate-500">{live.completedSets}/{live.totalSets} подходов</span>
                              <span className="font-black text-slate-200">{live.progress}%</span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all" style={{ width: `${live.progress}%` }} /></div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {(live.blockStats || []).map(block => <span key={block.label} className={`grid h-8 min-w-8 place-items-center rounded-lg border px-2 text-[10px] font-black ${block.complete ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' : block.label === live.activeBlock ? 'border-cyan-300/25 bg-cyan-300/12 text-cyan-100' : 'border-white/[0.06] text-slate-600'}`}>{block.label}{block.complete ? '✓' : ''}</span>)}
                            </div>
                            <div className="mt-3 flex items-center justify-between text-[10px] text-slate-600"><span>Синхр. {compactTime(live.lastSyncAt)}</span><span>{live.deviceCount || 0} устр.</span></div>
                            {status.planFact && (status.planFact.completedSets > 0 || status.planFact.actualTonnage > 0) && <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl border border-white/[0.05] bg-black/10 p-2"><div><div className="text-[8px] uppercase text-slate-700">План-факт</div><div className="text-[11px] font-black text-slate-300">{status.planFact.completionPercent}%</div></div><div><div className="text-[8px] uppercase text-slate-700">Тоннаж</div><div className="text-[11px] font-black text-slate-300">{status.planFact.tonnagePercent == null ? '—' : `${status.planFact.tonnagePercent}%`}</div></div><div><div className="text-[8px] uppercase text-slate-700">RPE</div><div className="text-[11px] font-black text-slate-300">{status.planFact.sessionRpe || '—'}</div></div></div>}
                          </>
                        )}

                        {liveDebrief && <p className="coach-fact-caption">Итоги занятия · оценки ниже сохранены для разбора.</p>}{(live?.alerts || []).length > 0 && <div className="mt-3 space-y-1 rounded-xl border border-rose-300/15 bg-rose-300/[0.055] p-2.5">{live.alerts.map(alert => <div key={alert} className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-200"><AlertTriangle size={11} />{alert}</div>)}</div>}
                        {(status.pendingCommands || []).length > 0 && <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.055] px-3 py-2 text-[10px] font-bold text-amber-200">Ожидает подтверждения: {status.pendingCommands[0].message}</div>}
                        <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => liveDebrief?openOverviewPlayer(player,todayISO(),'history'):setLiveCommandPlayer(player)} disabled={!status.hasSession} className="min-h-11 rounded-xl border border-amber-300/15 bg-amber-300/[0.055] text-[11px] font-bold text-amber-200 transition hover:bg-amber-300/[0.1] disabled:opacity-30">{liveDebrief?'История и факты':'Команда LIVE'}</button><button type="button" onClick={() => { selectPlayer(player); setDate(todayISO()); setMainSection('workouts'); }} className="min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[11px] font-bold text-slate-300 transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50">Программа</button></div>
                      </article>
                    );
                  })}
                </div>
              )}

              {liveCommandPlayer && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#03070d]/80 px-4 backdrop-blur-xl" onMouseDown={event => event.target === event.currentTarget && setLiveCommandPlayer(null)}>
                  <div className="w-full max-w-lg rounded-[28px] border border-white/[0.1] bg-gradient-to-br from-[#121d22] via-[#0b141d] to-[#101326] p-5 shadow-2xl">
                    <div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/65">LIVE-вмешательство</div><div className="mt-1 text-xl font-black text-white">{liveCommandPlayer.name}</div></div><button type="button" onClick={() => setLiveCommandPlayer(null)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] text-slate-500"><X size={15} /></button></div>
                    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">{[
                      ['message', 'Сообщение'], ['pause', 'Пауза'], ['rest', 'Отдых 90 с'], ['adjust_load', 'Вес −10%'], ['stop_exercise', 'Стоп упражнения'], ['replace_exercise', 'Замена'],
                    ].map(([type, label]) => <button key={type} type="button" onClick={() => setLiveCommandType(type)} className={`min-h-11 rounded-xl border px-2 text-[10px] font-bold ${liveCommandType === type ? 'border-amber-300/30 bg-amber-300/[0.12] text-amber-100' : 'border-white/[0.07] bg-white/[0.025] text-slate-500'}`}>{label}</button>)}</div>
                    {liveCommandType === 'replace_exercise' && <input value={liveReplacement} onChange={event => setLiveReplacement(event.target.value)} placeholder="Название нового упражнения" className="mt-3 min-h-12 w-full rounded-xl border border-cyan-300/15 bg-black/20 px-3 text-[12px] text-white outline-none focus:border-cyan-300/40" />}
                    <textarea value={liveCommandText} onChange={event => setLiveCommandText(event.target.value)} placeholder="Комментарий игроку — необязательно" className="mt-3 min-h-[92px] w-full resize-none rounded-xl border border-white/[0.08] bg-black/20 p-3 text-[12px] text-white outline-none focus:border-amber-300/30" />
                    <button type="button" disabled={liveCommandSending || (liveCommandType === 'replace_exercise' && !liveReplacement.trim())} onClick={sendLiveCommand} className="mt-4 min-h-12 w-full rounded-2xl bg-gradient-to-r from-amber-300 to-emerald-300 text-[12px] font-black text-[#10150b] disabled:opacity-40">{liveCommandSending ? 'Отправляю…' : 'Отправить игроку'}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Coach attention centre ── */}
          {mainSection === 'attention' && (
            <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
              <div className="mb-6 flex items-end justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/60">Priority inbox</div><h2 className="mt-1 text-2xl font-black tracking-tight text-white">Центр внимания тренера</h2><p className="mt-1 text-[12px] text-slate-500">Готовность, боль, качество данных, LIVE и итоговые оценки — в одной очереди.</p></div><div className="rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-3 py-1.5 text-[11px] font-black text-amber-200">{attentionQueue.length}</div></div>
              {readinessLoading || (teamStatusLoading && !liveUpdatedAt) ? <div className="py-24 text-center text-sm text-slate-500"><Loader2 size={18} className="mx-auto mb-2 animate-spin" />Собираю сигналы…</div> : attentionQueue.length === 0 ? <div className="rounded-3xl border border-emerald-300/15 bg-emerald-300/[0.045] p-10 text-center"><CheckCircle2 size={26} className="mx-auto text-emerald-300" /><div className="mt-3 text-lg font-black text-white">Критических сигналов нет</div><div className="mt-1 text-[12px] text-slate-500">Команда готова к плановой работе.</div></div> : <div className="space-y-2.5">{attentionQueue.map((item, index) => {
                const player = players.find(candidate => String(candidate.id) === String(item.playerId));
                const tone = item.priority >= 85 ? 'border-rose-300/20 bg-rose-300/[0.055]' : item.priority >= 60 ? 'border-amber-300/18 bg-amber-300/[0.045]' : 'border-cyan-300/12 bg-cyan-300/[0.035]';
                return <button key={`${item.playerId}-${item.code}-${index}`} type="button" onClick={() => { if (player) { selectPlayer(player); setMainSection('workouts'); } }} className={`flex min-h-[74px] w-full items-center gap-3 rounded-2xl border ${tone} p-3.5 text-left transition hover:bg-white/[0.06]`}><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[12px] font-black ${item.priority >= 85 ? 'bg-rose-300/12 text-rose-200' : item.priority >= 60 ? 'bg-amber-300/12 text-amber-200' : 'bg-cyan-300/10 text-cyan-200'}`}>{item.priority}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2"><span className="text-[13px] font-black text-white">{item.playerName}</span><span className="text-[10px] font-bold text-slate-500">{item.title}</span></div><div className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.detail}</div></div><ChevronRight size={15} className="text-slate-700" /></button>;
              })}</div>}
            </div>
          )}

          {/* ── Platform health ── */}
          {mainSection === 'health' && (
            <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
              <div className="mb-6 flex items-end justify-between gap-3">
                <div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300/60">Operations</div><h2 className="mt-1 text-2xl font-black tracking-tight text-white">Здоровье платформы</h2></div>
                <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={createOperationsSnapshot} disabled={snapshotLoading || recoveryDrillLoading} className="min-h-11 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.055] px-4 text-[11px] font-bold text-emerald-200 disabled:opacity-50">{snapshotLoading ? 'Шифрую…' : 'Создать копию'}</button><button type="button" onClick={startRecoveryDrill} disabled={snapshotLoading || recoveryDrillLoading} className="min-h-11 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.055] px-4 text-[11px] font-bold text-cyan-200 disabled:opacity-50">{recoveryDrillLoading ? 'Проверяю DR…' : 'Проверить восстановление'}</button><button type="button" onClick={loadPlatformHealth} className="min-h-11 rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-[12px] font-bold text-slate-300">{healthLoading ? 'Проверка…' : 'Обновить'}</button></div>
              </div>
              {healthLoading && !healthData ? <div className="py-24 text-center text-sm text-slate-500">Проверяю сервисы…</div> : healthData && (
                <>
                  <div className={`mb-5 rounded-2xl border p-5 ${healthData.status === 'healthy' ? 'border-emerald-300/20 bg-emerald-300/[0.055]' : healthData.status === 'warning' ? 'border-amber-300/20 bg-amber-300/[0.055]' : 'border-rose-300/20 bg-rose-300/[0.055]'}`}>
                    <div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Общий статус</div><div className="mt-1 text-xl font-black text-white">{healthData.status === 'healthy' ? 'Все системы работают' : healthData.status === 'warning' ? 'Есть предупреждения' : 'Требуется внимание'}</div></div><div className="text-right text-[10px] text-slate-500">{healthData.latencyMs} мс<br />{compactTime(healthData.checkedAt)}</div></div><ul className="coach-health-reasons">{(healthData.activeReasons || []).map(reason=><li key={reason}>{reason}</li>)}</ul>
                  </div>
                  <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Production release</div><div className="mt-2 font-mono text-[12px] font-bold text-blue-200">{healthData.release?.commit?String(healthData.release.commit).slice(0,12):'Ревизия не передана'}</div><div className="mt-1 text-[10px] text-slate-600">{healthData.release?.environment || 'unknown'}<p>Сборка: {healthData.release?.builtAt?new Date(healthData.release.builtAt).toLocaleString('ru-RU'):'дата не передана'}</p><p>Публикация: {healthData.release?.publishedAt?new Date(healthData.release.publishedAt).toLocaleString('ru-RU'):'дата не передана'}</p></div></div><div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Readiness p95 · тёплый / холодный</div><div className={`mt-2 font-mono text-[12px] font-bold ${healthData.readinessPerformance?.healthy ? 'text-emerald-200' : 'text-amber-200'}`}>{healthData.readinessPerformance?.warm?.p95Ms ?? healthData.readinessPerformance?.p95Ms ?? '—'} мс <span className="text-slate-700">/</span> {healthData.readinessPerformance?.cold?.p95Ms ?? '—'} мс</div><div className="mt-1 text-[10px] text-slate-600">Цели ≤ {healthData.readinessPerformance?.warm?.targetP95Ms || 750} / {healthData.readinessPerformance?.cold?.targetP95Ms || 5000} мс · кеш {healthData.readinessPerformance?.cacheHitRate ?? '—'}% · {healthData.alerting?.channel === 'in-app' ? 'встроенный канал' : healthData.alerting?.channel || 'канал неизвестен'}</div></div><div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Последняя резервная копия</div><div className="mt-2 truncate font-mono text-[12px] font-bold text-emerald-200">{latestSnapshot?.createdAt || healthData.backup?.createdAt?new Date(latestSnapshot?.createdAt || healthData.backup.createdAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}):'Ещё не создана'}</div><div className="mt-1 text-[10px] text-slate-600">{latestSnapshot ? `${latestSnapshot.keyCount} ключей · зашифровано` : healthData.backup ? `${healthData.backup.keyCount} ключей · ${healthData.backup.ageHours} ч назад` : 'Ежедневное защищённое копирование'}</div></div><div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Контроль восстановления</div><div className="mt-2 truncate font-mono text-[12px] font-bold text-cyan-200">{latestRecoveryDrill?.checkedAt || healthData.recovery?.checkedAt?new Date(latestRecoveryDrill?.checkedAt || healthData.recovery.checkedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}):'Дата не передана'}</div><div className="mt-1 text-[10px] text-slate-600">{latestRecoveryDrill ? `${latestRecoveryDrill.sampledKeyCount} ключей · очищено` : healthData.recovery ? `${healthData.recovery.sampledKeyCount} ключей · ${healthData.recovery.ageHours} ч назад` : 'Еженедельная DR-проверка'}</div></div></div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{Object.entries(healthData.services || {}).map(([name, ok]) => <div key={name} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-300' : 'bg-rose-300'}`} /><div className="mt-3 text-[12px] font-bold text-slate-200">{name === 'redis' ? 'Хранилище' : name === 'readySix' ? 'ReadySix' : name === 'ai' ? 'AI генерация' : name === 'backup' ? 'Резервные копии' : name === 'recovery' ? 'DR-проверка' : 'Доступ тренера'}</div><div className="mt-1 text-[10px] text-slate-600">{ok ? 'Работает' : name === 'backup' ? 'Нет свежей копии' : name === 'recovery' ? 'Нет свежей проверки' : 'Не настроено'}</div></div>)}</div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-600">Ошибки за 24 часа</div><div className="mt-2 text-3xl font-black text-rose-200">{healthData.errors24h}</div></div><div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-600">События-предупреждения за 24 часа</div><div className="mt-2 text-3xl font-black text-amber-200">{healthData.warnings24h}</div></div></div>
                  <section className="coach-active-problems" aria-label="Активные проблемы"><h3>Активные проблемы сервисов · {activeServiceProblems(healthData.services).length}</h3>{activeServiceProblems(healthData.services).map(problem=><p key={problem}>{problem}</p>)}<p>Счётчики ниже относятся к событиям за 24 часа и могут быть нулевыми при сохраняющейся проблеме.</p></section><GenerationMonitor workspace={workspace} apiKey={apiKey} />
                  <OperationalIncidents notifications={healthData.notifications || []}/>
                  <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"><div className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">Последние события</div><div className="space-y-2">{(healthData.events || []).length ? healthData.events.slice(0, 12).map((event, index) => <div key={`${event.at}-${index}`} className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-black/10 px-3 py-2.5"><span className={`mt-1 h-2 w-2 rounded-full ${event.status === 'error' ? 'bg-rose-300' : event.status === 'warning' ? 'bg-amber-300' : 'bg-emerald-300'}`} /><div className="min-w-0 flex-1"><div className="text-[11px] font-bold text-slate-300">{event.area}</div>{event.message && <div className="mt-0.5 truncate text-[10px] text-slate-600">{event.message}</div>}</div><span className="text-[9px] text-slate-700">{compactTime(event.at)}</span></div>) : <div className="py-6 text-center text-[11px] text-slate-600">Событий пока нет</div>}</div></div>
                </>
              )}
            </div>
          )}

          {/* ── Tonnage dashboard ── */}
          {mainSection === 'tonnage' && (
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
              <header className="coach-overview-header"><div><p className="coach-overview-eyebrow">Команда · последние 7 дней</p><h2>Нагрузка</h2><p>Выполненная работа, план и пробелы в записи результатов.</p></div><button type="button" disabled={tonnageLoading || teamStatusLoading} onClick={()=>tonnageTab==='tonnage'?setTonnageRefresh(value=>value+1):loadTeamStatus(todayISO())}><RefreshCw size={15}/> Обновить данные</button></header>
              {/* Sub-tab toggle */}
              <div className="mb-6 flex rounded-xl bg-white/[0.03] p-0.5 border border-white/[0.06]">
                {[
                  { id: 'tonnage', label: 'Тоннаж 7 дн.' },
                  { id: 'status', label: 'Статус сегодня' },
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTonnageTab(t.id)}
                    className={`flex-1 rounded-[9px] py-2 text-[12px] font-semibold transition-all ${
                      tonnageTab === t.id ? 'bg-white/[0.09] text-white shadow-sm' : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tonnageTab==='tonnage' && <><OverviewFreshness updatedAt={tonnageUpdatedAt} loading={tonnageLoading} error={tonnageData?.error} label="Нагрузка"/>{tonnageData && !tonnageData.error && !tonnageLoading && <TeamLoadOverview key={workspace} data={tonnageData} filter={loadFilter} setFilter={setLoadFilter} onFacts={openHistoryFacts} onPlayer={openOverviewPlayer} onDraft={openBatchDraft} getDraft={overviewDraft}/>}</>}

              {/* ── Status today ── */}
              {tonnageTab === 'status' && (
                <div className="space-y-2"><OverviewFreshness updatedAt={liveUpdatedAt} error={teamStatusError} loading={teamStatusLoading} label="Программы сегодня"/>
                  {teamStatusLoading && (
                    <div className="flex items-center justify-center py-16 text-[13px] text-slate-600">
                      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
                      Загрузка...
                    </div>
                  )}
                  {!teamStatusLoading && players.length === 0 && (
                    <div className="py-16 text-center text-[13px] text-slate-600">Нет игроков</div>
                  )}
                  {!teamStatusLoading && (!teamStatusError || liveUpdatedAt) && players.length > 0 && players.map(p => {
                    const st = teamStatus[p.id];
                    const hasSess = st?.hasSession;
                    const fb = st?.feedback;
                    return (
                      <div
                        key={p.id}
                        role="button" tabIndex={0} onKeyDown={event=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();openOverviewPlayer(p);}}}
                        onClick={() => openOverviewPlayer(p)}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition-all hover:border-white/[0.14] ${
                          hasSess ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-white/[0.07] bg-white/[0.02]'
                        }`}
                      >
                        {p.photo ? (
                          <img src={p.photo} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover object-top" />
                        ) : (
                          <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-white/[0.07] text-[10px] font-black text-slate-400">
                            {(p.name || '').split(' ').map(w => w[0]).join('').slice(0, 2)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-slate-200 truncate">{p.name}</p>
                          {p.position && <p className="text-[10px] text-slate-600">{p.position}</p>}
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {fb?.feel && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              fb.feel <= 3 ? 'bg-rose-500/20 text-rose-400' : fb.feel <= 6 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                            }`}>
                              {fb.feel}/10
                            </span>
                          )}
                          <span className={`text-[11px] font-semibold ${hasSess ? 'text-emerald-400' : 'text-slate-700'}`}>
                            {hasSess ? 'Сохранено' : 'Нет тр.'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {mainSection === 'workouts' && (<>
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
          {(playerId || batchSelectedIds.size>0) && <section className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-2 print:hidden" aria-label="Календарь тренера">
            <p className="hidden text-xs font-semibold text-slate-400 sm:block">Дата тренировки{leftTab === 'day' && Object.values(teamStatus).some(status => status.hasDraft) && <span className="ml-3 text-cyan-300">Черновики: {Object.values(teamStatus).filter(status => status.hasDraft).length}</span>}</p>
            <DatePicker navigate timeZone={activePlayerTimeZone} value={date} onChange={changeTrainingDate} disabled={loading || !!batchId || saving || batchRunning || weekPlanLoading} maxDate={addDaysToStr(playerToday, 1)} size="sm" className="w-full sm:w-[310px]" />
          </section>}

          {/* ── Workspace header (player selected) ── */}
          {playerId && selectedPlayer ? (
            <div className="premium-player-header mb-6 flex items-center gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.025] px-4 py-4 print:hidden sm:px-5">
              <button
                type="button"
                onClick={() => setMobileView('players')}
                className="sm:hidden shrink-0 -ml-1 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 transition hover:text-slate-300"
              >
                ← Состав
              </button>
              {/* Prev/Next player navigation */}
              <div className="hidden sm:flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => prevPlayer && selectPlayer(prevPlayer)}
                  disabled={!prevPlayer}
                  title={prevPlayer ? `← ${prevPlayer.name} (Alt ←)` : undefined}
                  className="h-8 w-8 grid place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-slate-500 transition hover:border-white/[0.14] hover:text-slate-200 disabled:opacity-25 disabled:cursor-default"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => nextPlayer && selectPlayer(nextPlayer)}
                  disabled={!nextPlayer}
                  title={nextPlayer ? `${nextPlayer.name} → (Alt →)` : undefined}
                  className="h-8 w-8 grid place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-slate-500 transition hover:border-white/[0.14] hover:text-slate-200 disabled:opacity-25 disabled:cursor-default"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              <div
                className="relative group/avatar shrink-0 cursor-pointer h-14 w-14"
                onClick={() => { setEditPhotoFor(selectedPlayer.id); setPhotoInput(/^(?:data:|https:\/\/)/.test(selectedPlayer.photo || '') ? selectedPlayer.photo : ''); }}
                title="Изменить фото"
              >
                {/* Gradient ring */}
                <div className="absolute -inset-[2px] rounded-[18px] bg-gradient-to-br from-accent/70 via-accent/30 to-transparent" />
                {selectedPlayer.photo ? (
                  <img src={selectedPlayer.photo} alt="" className="relative h-14 w-14 rounded-2xl object-cover object-top" />
                ) : (
                  <div className="relative h-14 w-14 flex items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-cyan-600 text-[15px] font-black text-[#060a0e]">
                    {initials(selectedPlayer.name)}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity text-[14px]">📷</div>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-[24px] font-black tracking-tight text-white leading-tight truncate">{selectedPlayer.name}</h1>
                <div className="mt-1 flex items-center gap-2">
                  {selectedPlayer.position && (
                    <span className="inline-flex items-center rounded-md border border-white/[0.10] bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                      {selectedPlayer.position}
                    </span>
                  )}
                </div>
              </div>
              {selectedPlayer.lastSessionDate && (
                <div className="hidden sm:block shrink-0 text-right">
                  <p className="text-[9px] uppercase tracking-wider text-slate-700">Последняя тр.</p>
                  <p className="text-[11px] font-semibold text-slate-500">{selectedPlayer.lastSessionDate}</p>
                </div>
              )}
            </div>
          ) : !playerId && (
            <></>
          )}

          {workspaceTab==='program' && playerId && selectedPlayer && <StrengthCycleReviewPanel key={`${workspace}:${playerId}`} workspace={workspace} playerId={playerId} apiKey={apiKey} date={date} refreshToken={factsRefresh} />}

          {/* ── Workspace tabs: Программа / История ── */}
          {playerId && selectedPlayer && (
            <div className="premium-workspace-tabs mb-5 flex rounded-2xl border border-white/[0.08] bg-black/15 p-1 print:hidden">
              {[
                { id: 'program', label: 'Программа', icon: <Dumbbell size={12} /> },
                { id: 'history', label: 'История', icon: <History size={12} /> },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setWorkspaceTab(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-2 text-[12px] font-semibold transition-all duration-200 ${
                    workspaceTab === t.id
                      ? 'bg-white/[0.09] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          )}

          {playerId && selectedPlayer && workspaceTab === 'program' && (
            <details className="mb-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] print:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3">
                <Shield size={12} className="text-blue-300/70" />
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Доступ игрока</span>
                <span className="ml-auto text-[10px] text-slate-700">управление ссылкой и устройствами</span>
              </summary>
              <div className="flex flex-wrap gap-2 border-t border-white/[0.05] px-4 py-3">
                <button type="button" disabled={Boolean(accessAction)} onClick={() => managePlayerAccess('get')} className="min-h-11 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-3 text-[11px] font-bold text-cyan-200 disabled:opacity-40">
                  {accessAction === 'get' ? 'Подготовка…' : linkCopied === playerId ? 'Ссылка скопирована ✓' : 'Скопировать ссылку'}
                </button>
                <button type="button" disabled={Boolean(accessAction)} onClick={() => setAccessConfirm('rotate')} className="min-h-11 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 text-[11px] font-bold text-amber-200 disabled:opacity-40">
                  {accessAction === 'rotate' ? 'Обновление…' : 'Обновить и скопировать'}
                </button>
                <button type="button" disabled={Boolean(accessAction)} onClick={() => setAccessConfirm('revoke')} className="min-h-11 rounded-xl border border-rose-300/15 bg-rose-300/[0.045] px-3 text-[11px] font-bold text-rose-200 disabled:opacity-40">
                  {accessAction === 'revoke' ? 'Отключение…' : 'Отключить все устройства'}
                </button>
              </div>
              {accessConfirm && (
                <div className={`mx-4 mb-4 rounded-xl border p-3 ${accessConfirm === 'revoke' ? 'border-rose-300/15 bg-rose-300/[0.05]' : 'border-amber-300/15 bg-amber-300/[0.05]'}`}>
                  <div className="text-[11px] font-semibold leading-relaxed text-slate-300">
                    {accessConfirm === 'revoke'
                      ? 'Отключить доступ на всех устройствах? Новую ссылку можно создать в любой момент.'
                      : 'Старая ссылка перестанет работать на всех устройствах. Новая ссылка сразу скопируется.'}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => managePlayerAccess(accessConfirm)} className={`min-h-10 rounded-lg px-3 text-[10px] font-black ${accessConfirm === 'revoke' ? 'bg-rose-300 text-[#21080f]' : 'bg-amber-300 text-[#211805]'}`}>Подтвердить</button>
                    <button type="button" onClick={() => setAccessConfirm('')} className="min-h-10 rounded-lg border border-white/[0.08] px-3 text-[10px] font-bold text-slate-400">Отмена</button>
                  </div>
                </div>
              )}
            </details>
          )}

          {/* ── Player contraindications (only on program tab) ── */}
          {playerId && selectedPlayer && workspaceTab === 'program' && (
            <details className={`mb-4 rounded-2xl border print:hidden transition-colors duration-300 ${
              restrictions.length > 0
                ? 'border-rose-500/25 bg-rose-500/[0.05]'
                : 'border-white/[0.07] bg-white/[0.02]'
            }`}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
                <AlertTriangle size={12} className={restrictions.length > 0 ? 'text-rose-400' : 'text-slate-600'} />
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Запреты тренера</span>
                {restrictions.length > 0 && (
                  <span className="ml-auto rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400">{restrictions.length} активно</span>
                )}
                {restrictions.length === 0 && (
                  <span className="ml-auto text-[10px] font-semibold text-slate-700">не добавлены вручную</span>
                )}
              </summary>
              <div className="border-t border-white/[0.05] px-4 pb-4 pt-3"><p className="mb-3 text-xs text-slate-300">Здесь только дополнительные запреты тренера. Симптомы и медицинские ограничения ReadySix учитываются отдельно.</p>
              <div className="flex flex-wrap gap-1.5">
                {RESTRICTIONS.map(r => {
                  const active = restrictions.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRestriction(r.id)}
                      title={r.desc}
                      className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 active:scale-95 ${
                        active
                          ? 'border-rose-500/50 bg-rose-500/[0.18] text-rose-300 shadow-[0_0_12px_rgba(239,68,68,0.12)]'
                          : 'border-white/[0.07] bg-transparent text-slate-600 hover:border-white/[0.14] hover:text-slate-300'
                      }`}
                    >
                      {active && <span className="mr-1 text-rose-400">⚡</span>}{r.label}
                    </button>
                  );
                })}
              </div>
              </div>
            </details>
          )}

          {playerId && selectedPlayer && workspaceTab === 'program' && (
            <>
            <DevelopmentPlanPanel
              plan={developmentPlan}
              onChange={next => { setDevelopmentPlan(next); setDevelopmentPlanSaved(false); }}
              onSave={saveDevelopmentPlan}
              saving={developmentPlanSaving}
              saved={developmentPlanSaved}
            />
            </>
          )}

          {/* ── История тренировок ── */}
          {mainSection==='workouts' && overviewReturn?.workspace===workspace && <button type="button" className="coach-return-button" onClick={()=>{overviewScrollTargetRef.current={type:'restore',...overviewReturn,requestedAt:Date.now()};setMainSection(overviewReturn.section);setOverviewReturn(null);}}>← Вернуться: {({calendar:'Неделя',tonnage:'Нагрузка',today:'Сегодня',live:'LIVE'})[overviewReturn.section]}</button>}
          {workspaceTab==='history' && playerId && selectedPlayer && <PlayerHistory key={`${workspace}:${playerId}`} workspace={workspace} player={selectedPlayer} apiKey={apiKey} targetDate={date} focusTarget={historyFactTarget} onClearTarget={()=>setHistoryFactTarget(null)} factsRefresh={factsRefresh} onOpenProgram={openOverviewPlayer} cycleReview={<StrengthCycleReviewPanel workspace={workspace} playerId={playerId} apiKey={apiKey} date={date} refreshToken={factsRefresh} initialOpen title="Результаты решений по циклам"/>}/>}

          {workspaceTab==='program' && batchResults.length>0 && <button type="button" className="coach-return-button" onClick={()=>setMainSection('team')}>Командная подготовка · осталось {batchResults.filter(row=>!row.saved).length} →</button>}

          {workspaceTab === 'program' && !playerId && batchSelectedIds.size > 0 && (
            <div className="mx-auto flex min-h-[58vh] max-w-xl flex-col justify-center print:hidden">
              <div className="rounded-2xl border border-accent/20 bg-accent/[0.05] p-6 text-center shadow-[0_12px_34px_rgba(0,0,0,0.35)]">
                <Users size={22} className="mx-auto mb-3 text-accent" />
                <h2 className="text-[18px] font-black text-white">Генерация для выбранных игроков</h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  {batchSelectedIds.size} игрок(ов) · {date} · {TRAINING_TYPE_LABELS[trainingType] || getFocusLabel(period, focus)}
                </p>
                <button
                  type="button"
                  onClick={runBatchGeneration}
                  disabled={batchRunning || !apiKey}
                  className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3.5 text-sm font-black text-[#061116] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
                >
                  {batchRunning ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                  {batchRunning ? 'Генерация...' : 'Сгенерировать выбранным'}
                </button>
                <TeamGenerationResults results={batchResults} running={batchRunning} onOpen={openBatchDraft} onRetry={retryFailedBatch} />
                <p className="mt-3 text-[11px] text-slate-600">Выбранная методика имеет приоритет. Автоматические лимиты ReadySix не применяются; боли и медицинские ограничения учитываются.</p>
              </div>
            </div>
          )}

          {/* ── Schedule panel ── */}
          {workspaceTab === 'program' && keyConnected && playerId && usesSeasonCalendar(workspace) && period !== 'camp' && (
            <div className="mb-5 print:hidden">
              <button
                type="button"
                onClick={() => setShowSchedule(o => !o)}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-xs font-semibold transition-all duration-200 ${focusRing} ${
                  showSchedule
                    ? 'border-accent/30 bg-accent/[0.07] text-accent'
                    : 'border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/[0.12] hover:text-slate-200'
                }`}
              >
                <CalendarDays size={13} className={showSchedule ? 'text-accent' : 'text-slate-600'} />
                <span>Расписание команды</span>
                {scheduleEvents.filter(e => e.type === 'game' && e.date >= todayISO()).length > 0 && (
                  <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                    {scheduleEvents.filter(e => e.type === 'game' && e.date >= todayISO()).length} игр
                  </span>
                )}
                <ChevronDown
                  size={12}
                  className={`ml-auto shrink-0 transition-transform duration-200 ${showSchedule ? 'rotate-180' : ''}`}
                />
              </button>

              {showSchedule && (
                <div className="mt-2 animate-fade-in rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl">
                  <p className="mb-4 text-[11px] text-slate-600">
                    Отмечайте игровые дни и перелёты на 4 недели вперёд. Система автоматически подберёт режим тренировки.
                  </p>
                  <ScheduleCalendar
                    events={scheduleEvents}
                    onToggle={toggleScheduleDay}
                    trainingDate={date}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Form + Results (only when player is selected, program tab) ── */}
          {workspaceTab === 'program' && playerId && <div>
          {executionConfirmed && savedProgram}
          <details className="coach-program-preparation" open={!executionConfirmed || undefined}><summary>{executionConfirmed?'Подготовка следующей тренировки':'Настройки нового черновика'}</summary>

          <form
            onSubmit={handleGenerate}
            className="premium-form relative overflow-hidden rounded-3xl border border-white/[0.10] p-5 backdrop-blur-xl sm:p-6 print:hidden"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-accent/55">Настройки нового черновика</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-200">
                  <span>{date}</span>
                  <span className="text-slate-700">/</span>
                  <span>{getFocusLabel(period, focus)}</span>
                  <span className="text-slate-700">/</span>
                  <span className="text-slate-400">{TRAINING_TYPE_LABELS[trainingType] || 'Тип тренировки'}</span>
                </div>
              </div>
              <div className={`rounded-full border px-3 py-1 text-[11px] font-black ${
                recoveryStatus === 'green' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' :
                recoveryStatus === 'yellow' ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' :
                'border-rose-400/30 bg-rose-400/10 text-rose-300'
              }`}>
                {recoveryStatus === 'green' ? 'Доза по источнику' : recoveryStatus === 'yellow' ? 'Тренер снизил объём' : 'Щадящий режим тренера'}
              </div>
            </div>

            {pendingSaved && <div className="coach-saved-separation"><strong>Сохранённая программа: {meta?.focusLabel || 'Тренировка'} · {pendingSaved.date}</strong><p>Настройки ниже относятся к новому черновику. Сохранённое задание показано отдельно от настроек.</p>{executionConfirmed && <button type="button" onClick={()=>changeTrainingDate(addDaysToStr(date,1))}>Подготовить следующую тренировку →</button>}</div>}
            {workspace==='nkperf' && <PlayerTimeZoneControl key={playerId} playerId={playerId} timeZone={activePlayerTimeZone} apiKey={apiKey} disabled={saving||loading||!!batchId} onChange={changePlayerTimeZone} />}
            <div className="mb-3 grid gap-3 lg:grid-cols-[1.1fr_1fr_1.15fr]">
              <div>
                <SectionLabel icon={<Dumbbell size={11} />} text="Формат" />
                <div className="flex rounded-xl border border-white/[0.09] bg-black/20 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  {[
                    { value: 'gym', label: 'Зал', icon: <Dumbbell size={13} /> },
                    { value: 'warmup', label: 'Разминка', icon: <Zap size={13} /> },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setSessionType(opt.value); setSession(null); setMeta(null); setError(''); }}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold transition-all duration-200 ${
                        sessionType === opt.value
                          ? 'bg-emerald-400 text-[#05130e] shadow-[0_8px_22px_-10px_rgba(74,222,128,0.9)]'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <SectionLabel icon={<CalendarDays size={11} />} text="Дата" />
                <p className="min-h-11 rounded-xl border border-white/10 px-3 py-3 text-sm font-semibold text-slate-200">{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</p>
              </div>

              <div>
                <SectionLabel icon={<Activity size={11} />} text="Коррекция дозы тренером" />
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { v: 'green',  dot: 'bg-emerald-400', label: 'По источнику',  on: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' },
                    { v: 'yellow', dot: 'bg-amber-400', label: 'Снизить',   on: 'border-amber-400/50 bg-amber-400/10 text-amber-300' },
                    { v: 'red',    dot: 'bg-rose-400', label: 'Тонус',  on: 'border-rose-400/50 bg-rose-400/10 text-rose-300' },
                  ].map(b => (
                    <button
                      key={b.v}
                      type="button"
                      onClick={() => changeRecovery(b.v)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[11px] font-bold transition shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
                        recoveryStatus === b.v ? b.on : 'border-white/[0.08] bg-black/10 text-slate-500 hover:border-white/[0.16] hover:text-slate-300'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${b.dot}`} />
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {date > playerToday && (
              <p className="mb-4 rounded-xl border border-accent/15 bg-accent/[0.04] px-3 py-2 text-[11px] text-accent/75">
                Вечерние данные за сегодня будут учтены для завтрашней тренировки.
              </p>
            )}

            <DecisionDataPanel
              data={decisionData}
              loading={decisionDataLoading}
              workspace={workspace}
              coachRecovery={recoveryStatus}
              onApply={rec => {
                setPeriod('inseason');
                setFocus(rec.focus);
                setTrainingType(rec.trainingType);
                if (rec.strengthMode) setStrengthMode(rec.strengthMode);
                if (rec.powerMode) setPowerMode(rec.powerMode);
              }}
            />

            {/* Advanced data */}
            {playerId && (
              <details className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.015]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[12px] font-semibold text-slate-500 transition hover:text-slate-300">
                  <SlidersHorizontal size={13} className="text-slate-600" />
                  Дополнительные данные
                  <span className="ml-auto text-[10px] text-slate-700">{(meta?.focus || focus)==='inseason_strength'?(workspace==='zarechie'?'нагрузка · LSI':'нагрузка'):(workspace==='zarechie'?'1ПМ · нагрузка · LSI':'1ПМ · нагрузка')}</span>
                </summary>
              <div className="border-t border-white/[0.05] p-3">
                {(meta?.focus || focus)!=='inseason_strength' && <button
                  type="button"
                  onClick={() => setOneRMPanelOpen(o => !o)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-xs font-semibold transition-all duration-200 ${focusRing} ${
                    oneRMPanelOpen
                      ? 'border-accent/30 bg-accent/[0.07] text-accent'
                      : 'border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/[0.12] hover:text-slate-200'
                  }`}
                >
                  <Dumbbell size={12} className={oneRMPanelOpen ? 'text-accent' : 'text-slate-600'} />
                  <span>Максимумы (1ПМ)</span>
                  {Object.keys(oneRM).length > 0 && (
                    <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent/80">
                      {Object.keys(oneRM).length}/{ONE_RM_FIELDS.length}
                    </span>
                  )}
                  <ChevronDown size={12} className={`ml-auto shrink-0 transition-transform duration-200 ${oneRMPanelOpen ? 'rotate-180' : ''}`} />
                </button>}
                {oneRMPanelOpen && (meta?.focus || focus)!=='inseason_strength' && (
                  <div className="mt-2 animate-fade-in rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 backdrop-blur-xl">
                    <p className="mb-3 text-[10px] text-slate-600">Тестовые максимумы — система рассчитает точные кг в программе</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {ONE_RM_FIELDS.map(f => {
                        const fieldHistory = rmHistory.map(h => h[f.key]).filter(Boolean);
                        return (
                          <div key={f.key}>
                            <div className="mb-1 flex items-center justify-between gap-1">
                              <label className="block text-[10px] font-semibold text-slate-500">{f.label}</label>
                              <Sparkline values={fieldHistory} />
                            </div>
                            <div className="flex items-center overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.03]">
                              <input
                                type="number"
                                min="0"
                                step="2.5"
                                value={oneRM[f.key] || ''}
                                onChange={e => handleOneRMChange(f.key, e.target.value)}
                                placeholder="—"
                                className="w-full bg-transparent px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600"
                              />
                              <span className="pr-2 text-[10px] text-slate-600">{f.unit}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <RMChart history={rmHistory} fields={ONE_RM_FIELDS} />
                  </div>
                )}

                {/* Load + neuro trends (Feature 2) */}
                <button
                  type="button"
                  onClick={() => setTrendsOpen(o => !o)}
                  className={`mt-2 flex w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-xs font-semibold transition-all duration-200 ${focusRing} ${
                    trendsOpen
                      ? 'border-accent/30 bg-accent/[0.07] text-accent'
                      : 'border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/[0.12] hover:text-slate-200'
                  }`}
                >
                  <TrendingUp size={12} className={trendsOpen ? 'text-accent' : 'text-slate-600'} />
                  <span>{workspace === 'zarechie' ? 'Нагрузка и нейро' : 'Нагрузка'}</span>
                  <ChevronDown size={12} className={`ml-auto shrink-0 transition-transform duration-200 ${trendsOpen ? 'rotate-180' : ''}`} />
                </button>
                {trendsOpen && (
                  <div className="animate-fade-in">
                    {trendsLoading ? (
                      <div className="mt-3 flex items-center justify-center py-6 text-[11px] text-slate-600">
                        <Loader2 size={14} className="mr-2 animate-spin" /> Загрузка...
                      </div>
                    ) : (
                      <TrendCharts data={trendsData} showNeuro={workspace === 'zarechie'} />
                    )}
                    {/* LSI — jump limb-symmetry index (manual entry) */}
                    {workspace === 'zarechie' && <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">LSI</span>
                      <span className="text-[10px] text-slate-600">симметрия прыжка L/R</span>
                      <input
                        type="number"
                        placeholder="—%"
                        min="50"
                        max="100"
                        className="ml-auto w-14 border-b border-white/[0.07] bg-transparent text-center text-[11px] text-slate-300 outline-none"
                        value={lsiValue}
                        onChange={e => handleLSIChange(e.target.value)}
                      />
                      {lsiValue !== '' && Number(lsiValue) < 85 && (
                        <span className="text-[9px] font-semibold text-rose-400">⚠ {lsiValue}%</span>
                      )}
                    </div>}
                  </div>
                )}
              </div>
              </details>
            )}

            {pendingSaved && !session && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/[0.05] px-4 py-3 animate-fade-in">
                <span className="flex items-center gap-2 text-xs font-medium text-accent/80">
                  <History size={13} />
                  {pendingSaved.draft ? 'Для этой даты сохранён черновик для проверки' : 'Для этой даты есть сохранённая тренировка'}
                </span>
                <button
                  type="button"
                  onClick={() => loadSavedRecord()}
                  className="rounded-lg border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
                >
                  Загрузить
                </button>
              </div>
            )}

            {/* Warmup → Gym banner */}
            {sessionType === 'gym' && todayWarmup && (
              <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3.5 py-2.5 animate-fade-in">
                <Check size={13} className="shrink-0 text-emerald-400" />
                <span className="text-xs text-emerald-300/90">Разминка готова — будет учтена при составлении программы</span>
                <button
                  type="button"
                  onClick={() => setTodayWarmup(null)}
                  className="ml-auto text-[10px] text-emerald-600 hover:text-emerald-400"
                >
                  сбросить
                </button>
              </div>
            )}

            {/* ── Plan controls ── */}
            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div>
                <SectionLabel icon={<Layers size={11} />} text="Период и фаза" />
                <div className="mb-2 flex gap-1">
                  {PERIODS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => {
                        const nextFocus = phasesForWorkspace(p.value, workspace)[0].value;
                        setPeriod(p.value);
                        setFocus(nextFocus);
                        setTrainingType(defaultTrainingTypeForFocus(nextFocus));
                      }}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition-all ${
                        period === p.value
                          ? PERIOD_COLORS[p.value].tab
                          : 'border-white/[0.08] text-slate-600 hover:border-white/[0.14] hover:text-slate-300'
                      }`}
                    >
                      {p.value === 'offseason' ? 'Межсезонье' : p.label}
                    </button>
                  ))}
                </div>
                <PremiumSelect
                  value={focus}
                  onChange={nextValue => {
                    setFocus(nextValue);
                    setTrainingType(defaultTrainingTypeForFocus(nextValue));
                  }}
                  options={phasesForWorkspace(period, workspace).map(ph => ({
                    value: ph.value,
                    label: `${phaseLabelForWorkspace(ph, workspace)}${phaseSubForWorkspace(ph, workspace) ? ` · ${phaseSubForWorkspace(ph, workspace)}` : ''}`,
                  }))}
                  className={`${inputBase} ${focusRing} [color-scheme:dark]`}
                  title="Выберите фазу подготовки"
                />
                {focus === 'inseason_strength' && (
                  <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-1.5">
                    {[
                      { value: 'development', label: 'Развивающая', sub: '40–50 мин · развитие силы' },
                      { value: 'maintenance', label: 'Поддерживающая', sub: '40–50 мин · поддержание' },
                    ].map(mode => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setStrengthMode(mode.value)}
                        className={`rounded-lg border px-3 py-2 text-left transition ${
                          strengthMode === mode.value
                            ? 'border-cyan-300/40 bg-cyan-400/20 text-cyan-100'
                            : 'border-transparent text-slate-600 hover:bg-white/[0.04] hover:text-slate-400'
                        }`}
                      >
                        <span className="block text-[11px] font-black">{mode.label}</span>
                        <span className="mt-0.5 block text-[9px] opacity-70">{mode.sub}</span>
                      </button>
                    ))}
                  </div>
                )}
                {focus === 'inseason_power' && (
                  <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-1.5">
                    {[
                      { value: 'development', label: 'Development', sub: '50–55 мин · полная работа' },
                      { value: 'microdose', label: 'Microdose', sub: '30 мин · без тяжёлой пары' },
                    ].map(mode => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setPowerMode(mode.value)}
                        className={`rounded-lg border px-3 py-2 text-left transition ${
                          powerMode === mode.value
                            ? 'border-violet-300/40 bg-violet-400/20 text-violet-100'
                            : 'border-transparent text-slate-600 hover:bg-white/[0.04] hover:text-slate-400'
                        }`}
                      >
                        <span className="block text-[11px] font-black">{mode.label}</span>
                        <span className="mt-0.5 block text-[9px] opacity-70">{mode.sub}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <SectionLabel icon={<Target size={11} />} text="Тип и акцент" />
                <PremiumSelect
                  value={trainingType}
                  onChange={setTrainingType}
                  options={focus === 'inseason_strength' ? STRENGTH_TRAINING_TYPES : TRAINING_TYPES}
                  className={`${inputBase} ${focusRing} mb-2 [color-scheme:dark]`}
                  title="Выберите тип тренировки"
                />
                {focus === 'inseason_strength' && <p className="mb-2 text-[11px] text-slate-500">Основные упражнения — цикл 4 занятия. Передняя / задняя цепь; соседние дни учитываются автоматически.</p>}
                <input
                  type="text"
                  value={dayGoal}
                  onChange={e => setDayGoal(e.target.value)}
                  placeholder="Акцент дня: прыжок, плечо, корпус, восстановление..."
                  className={`${inputBase} ${focusRing}`}
                />
              </div>
            </div>

            {meta?.prehabReaction && <section className="mt-4 rounded-xl border border-cyan-400/20 p-4 text-sm text-slate-300" aria-label="Реакция игрока на профилактику">
              <p className="font-semibold">Реакция игрока на профилактику</p>
              {Object.entries({before:'До',after:'После',nextMorning:'Следующим утром'}).map(([stage,label]) => <p key={stage} className="mt-2 text-xs">{label}: {meta.prehabReaction[stage] ? Object.entries(meta.prehabReaction[stage].pain).map(([zone,value]) => `${({ankle:'Голеностоп',achilles:'Ахилл',knee:'Колени',back:'Поясница',shoulder:'Плечи'})[zone]} ${value}/10`).join(' · ') : 'Оценка не получена'}{meta.prehabReaction[stage]?.retrospective ? ' · Внесено позже' : ''}{meta.prehabReaction[stage]?.note ? ` · ${meta.prehabReaction[stage].note}` : ''}</p>)}
            </section>}

            {focus === 'inseason_prophylaxis' && <section className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4 text-sm text-slate-300" aria-label="Методика профилактики">
              <p className="font-semibold text-cyan-200">Профилактика MD+2: восстановление и контроль движения</p>
              <p className="mt-2">50 минут основной работы через день после матча; разминка и завершение отдельно. Мобильность → лёгкая работа на всё тело → баланс и стабилизация → индивидуальный блок по амплуа. RPE 2–4, без прыжков и отказа. Доза учитывает участие в матче, состояние и региональный допуск.</p>
              <p className="mt-2 text-xs text-slate-400">Знакомые ключевые упражнения на контроль и баланс сохраняются, остальные ротируются. Жалобы ReadySix не считаются диагнозом: нагружающие болезненную область варианты исключаются, щадящие движения проверяет тренер. Игрок отмечает боль до, после и следующим утром; ухудшение ограничивает следующую программу. При частичном допуске сохраняются 10–12 станций и 50 минут занятия: сокращаются рабочие интервалы, сопротивление и подходы. Паузы, настройка и контроль техники входят во время; запрещённая нагрузка не добавляется. Лимиты ReadySix не блокируют черновик профилактики: выбор упражнений зависит от болевых зон, дозировку и сопротивление определяет реакция игрока. Медицинские предупреждения сохраняются, до выполнения нужна очная проверка.</p>
            </section>}

            <div className="mt-4">
              <SectionLabel icon={<MessageSquare size={11} />} text="Комментарии тренера" />
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Только важное: боль, утренняя скорость, COD завтра, ограничить низ..."
                className={`${inputBase} ${focusRing} resize-none`}
              />
            </div>

            <div className={`mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${sessionType === 'gym' ? 'flex gap-2' : ''}`}>
            <button
              type="submit"
              disabled={loading || weekPlanLoading || !apiKey || !playerId}
              className={`coach-primary flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-b from-[#55f08a] to-[#14b8c8] px-5 py-3.5 text-[15px] font-black text-[#031411] shadow-[0_14px_38px_-18px_rgba(34,211,238,0.95),0_0_0_1px_rgba(255,255,255,0.12)_inset] transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none ${focusRing} ${sessionType === 'gym' ? 'flex-1' : 'w-full'}`}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {sessionType === 'warmup' ? 'Генерация разминки...' : 'Генерация тренировки...'}
                </>
              ) : (
                <>
                  <Zap size={16} strokeWidth={2.5} />
                  {sessionType === 'warmup' ? 'Сгенерировать разминку' : 'Сгенерировать тренировку'}
                </>
              )}
            </button>
            {sessionType === 'gym' && period !== 'inseason' && (
              <button
                type="button"
                onClick={handleGenerateWeek}
                disabled={weekPlanLoading || loading || !apiKey || !playerId || matchDayManualReview}
                className={`flex items-center justify-center gap-2 rounded-xl border border-white/[0.11] bg-white/[0.045] px-4 py-3 text-sm font-semibold text-slate-300 transition-all hover:border-white/[0.20] hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 ${focusRing}`}
                title="Сгенерировать план на 3 дня: Силовой → Мощностной → Восстановление"
              >
                {weekPlanLoading ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} />}
                <span className="hidden sm:inline">План недели</span>
              </button>
            )}
            {sessionType === 'gym' && apiKey && players.length > 0 && (
              <button
                type="button"
                onClick={() => { setMainSection('team');setSidebarOpen(false); }}
                disabled={loading || weekPlanLoading || batchRunning || matchDayManualReview}
                className={`flex items-center justify-center gap-2 rounded-xl border ${batchOpen ? 'border-accent/40 bg-accent/10 text-accent' : 'border-white/[0.11] bg-white/[0.045] text-slate-300'} px-4 py-3 text-sm font-semibold transition-all hover:border-white/[0.20] hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 ${focusRing}`}
                title="Сгенерировать тренировки для всей команды сразу"
              >
                <Users size={15} />
                <span className="hidden sm:inline">Команда</span>
              </button>
            )}
            </div>

            {sessionType === 'gym' && apiKey && (
              <details className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.015]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2 text-[11px] font-semibold text-slate-600 transition hover:text-slate-300">
                  <Layers size={13} />
                  Шаблоны микроциклов
                  {templates.length > 0 && (
                    <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-slate-500">{templates.length}</span>
                  )}
                  <ChevronDown size={13} className="ml-auto text-slate-700" />
                </summary>
                <div className="border-t border-white/[0.05] p-1.5">
                  {templates.length === 0 ? (
                    <div className="px-3 py-3 text-center text-[11px] text-slate-600">Нет сохранённых шаблонов</div>
                  ) : (
                    templates.map(t => (
                      <div key={t.name} className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition hover:bg-white/[0.05]">
                        <button
                          type="button"
                          onClick={() => handleLoadTemplate(t.name)}
                          className="flex-1 text-left"
                        >
                          <div className="text-xs font-semibold text-slate-200">{t.name}</div>
                          <div className="text-[10px] text-slate-600">{t.exerciseCount} упр.{t.focus ? ` · ${t.focus}` : ''}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(t.name)}
                          className="rounded p-1 text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-400"
                          title="Удалить шаблон"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </details>
            )}
          </form>

          {/* ── Batch generation panel ── */}
          {batchOpen && sessionType === 'gym' && (
            <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl print:hidden">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Users size={14} className="text-accent" />
                  <span className="text-sm font-bold text-white">Генерация для команды</span>
                  {batchSelectedIds.size > 0 && (
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent">{batchSelectedIds.size}</span>
                  )}
                </div>
                <button onClick={() => { setBatchOpen(false); }} className="text-slate-600 hover:text-slate-400 transition">
                  <X size={16} />
                </button>
              </div>

              {/* Player checkboxes — hidden when running or results shown */}
              {!batchRunning && batchResults.length === 0 && (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Выбери игроков для сегодняшней тренировки</span>
                    <button
                      type="button"
                      onClick={toggleAllBatch}
                      className="text-[11px] font-semibold text-accent hover:text-accent/70 transition"
                    >
                      {batchSelectedIds.size === players.length ? 'Снять все' : 'Выбрать всех'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {players.map(p => {
                      const sel = batchSelectedIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleBatchPlayer(p.id)}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all ${
                            sel
                              ? 'border-accent/40 bg-accent/10'
                              : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                          }`}
                        >
                          {sel ? <CheckSquare size={13} className="shrink-0 text-accent" /> : <Square size={13} className="shrink-0 text-slate-600" />}
                          <div className="min-w-0">
                            <div className={`truncate text-[12px] font-semibold leading-tight ${sel ? 'text-white' : 'text-slate-400'}`}>{p.name.split(' ')[0]}</div>
                            <div className="text-[10px] text-slate-600 truncate">{p.position || '—'}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={runBatchGeneration}
                      disabled={batchSelectedIds.size === 0 || !apiKey}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl bg-accent/90 px-5 py-3 text-sm font-bold text-[#060a0e] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30 ${focusRing}`}
                    >
                      <Zap size={14} strokeWidth={2.5} />
                      Запустить для {batchSelectedIds.size} {batchSelectedIds.size === 1 ? 'игрока' : batchSelectedIds.size < 5 ? 'игроков' : 'игроков'}
                    </button>
                    <p className="mt-2 text-center text-[10px] text-slate-600">Дата: {date} · Фаза: {focus} · Допущенные сессии сохранятся; черновики нужно проверить</p>
                  </div>
                </>
              )}

              {/* Progress grid */}
              {(batchRunning || batchResults.length > 0) && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {batchResults.map(r => (
                      <div key={r.playerId} onClick={() => r.status === 'done' && (r.draft ? openBatchDraft(r) : setPlayerId(r.playerId))} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all ${r.status === 'done' ? 'cursor-pointer hover:border-emerald-500/50' : ''} ${
                        r.status === 'done'       ? 'border-emerald-500/30 bg-emerald-500/[0.07]' :
                        r.status === 'error'      ? 'border-rose-500/30 bg-rose-500/[0.07]' :
                        r.status === 'generating' ? 'border-accent/30 bg-accent/[0.06]' :
                        'border-white/[0.05] bg-white/[0.015]'
                      }`}>
                        <div className="shrink-0">
                          {r.status === 'done'       && <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400"><Check size={10} strokeWidth={3} /></div>}
                          {r.status === 'error'      && <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/20 text-rose-400"><X size={10} strokeWidth={3} /></div>}
                          {r.status === 'generating' && <Loader2 size={14} className="animate-spin text-accent" />}
                          {r.status === 'queued'     && <div className="h-5 w-5 rounded-full border border-white/[0.08]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold leading-tight text-slate-200">{r.name.split(' ')[0]}</div>
                          <div className={`text-[10px] truncate ${
                            r.status === 'done'       ? 'text-emerald-400' :
                            r.status === 'error'      ? 'text-rose-400' :
                            r.status === 'generating' ? 'text-accent' :
                            'text-slate-600'
                          }`}>
                            {r.status === 'done'       ? (r.draft ? 'Черновик · открыть' : 'Сохранено') :
                             r.status === 'error'      ? (r.error || 'Ошибка') :
                             r.status === 'generating' ? 'Генерирую...' : 'В очереди'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!batchRunning && (
                    <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-[11px] text-slate-500">
                        {batchResults.filter(r => r.status === 'done').length} из {batchResults.length} готово
                        {batchResults.some(r => r.status === 'error') && ` · ${batchResults.filter(r => r.status === 'error').length} ошибок`}
                      </span>
                      <div className="flex items-center gap-3">
                        {batchResults.some(r => r.status === 'error') && (
                          <button
                            type="button"
                            onClick={retryFailedBatch}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition"
                          >
                            <RefreshCw size={11} />
                            Повторить ошибки ({batchResults.filter(r => r.status === 'error').length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {  setBatchSelectedIds(new Set()); }}
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:text-accent/70 transition"
                        >
                          <RefreshCw size={11} />
                          Новый запуск
                        </button>
                      </div>
                    </div>
                  )}
                  {batchRunning && (
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                      <Loader2 size={11} className="animate-spin" />
                      Генерирую последовательно — упражнения не пересекаются между игроками
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          </details>
          {/* ── Error ── */}
          {error && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.07] p-4 text-sm animate-fade-in backdrop-blur-xl print:hidden">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-400" />
              <div>
                <div className="mb-0.5 text-xs font-bold uppercase tracking-wider text-rose-400/70">Ошибка</div>
                <div className="text-sm text-rose-300/80">{error}</div>
              </div>
            </div>
          )}

          {/* ── Generation progress ── */}
          {loading && !session && (
            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 backdrop-blur-xl print:hidden">
              {/* Stage + progress bar */}
              <div className="mb-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Loader2 size={14} className="animate-spin text-accent shrink-0" />
                    <span className="text-[13px] font-semibold text-slate-300 transition-all duration-500">
                      {resuming ? 'Продолжаю генерацию...' : (genStage || 'Запускаю генерацию...')}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-600 tabular-nums">
                    {genProgress}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-1.5 rounded-full bg-accent transition-all duration-700 ease-out"
                    style={{ width: `${genProgress}%` }}
                  />
                </div>
              </div>

              {/* Skeleton blocks */}
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 animate-pulse rounded-lg bg-accent/10" />
                  <div className="h-3.5 w-28 animate-pulse rounded-lg bg-white/[0.06]" />
                  <div className="h-px flex-1 bg-white/[0.04]" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" style={{ animationDelay: `${i * 80}ms` }} />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 animate-pulse rounded-lg bg-accent/10" style={{ animationDelay: '240ms' }} />
                  <div className="h-3.5 w-24 animate-pulse rounded-lg bg-white/[0.06]" style={{ animationDelay: '240ms' }} />
                  <div className="h-px flex-1 bg-white/[0.04]" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[1,2].map(i => (
                    <div key={i} className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" style={{ animationDelay: `${(i+3)*80}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Session result ── */}
          {!executionConfirmed && savedProgram}

          {/* ── Week Plan ── */}
          {weekPlan && weekPlan.length > 0 && (
            <div className="mt-6 animate-fade-in space-y-3 print:hidden">
              <div className="flex items-center gap-3">
                <Calendar size={14} className="text-accent" />
                <h2 className="text-sm font-black tracking-tight text-white">План недели</h2>
                <div className="h-px flex-1 bg-gradient-to-r from-white/[0.07] to-transparent" />
                <span className="text-[10px] text-slate-600">Сессий: {weekPlan.length} · {weekPlan[0]?.date} → {weekPlan[weekPlan.length - 1]?.date}</span>
              </div>
              {weekPlan.map((item, idx) => (
                <div key={idx} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl">
                  {/* Accordion header */}
                  <button
                    type="button"
                    onClick={() => setWeekPlanOpen(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-[10px] font-black text-[#060a0e]">
                      {idx + 1}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-100">{item.label}</span>
                      <span className="text-[10px] text-slate-500">{item.date} · {item.player?.name}</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {item.saved ? (
                        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                          Сохранено ✓
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleSaveWeekSession(idx); }}
                          disabled={item.saving || item.session?.kind === 'restricted_day_plan'}
                          className="rounded-lg bg-accent px-3 py-1.5 text-[10px] font-bold text-[#060a0e] shadow-[0_2px_10px_rgba(34,211,238,0.25)] transition hover:brightness-110 disabled:opacity-50"
                        >
                          {item.saving ? <Loader2 size={11} className="animate-spin" /> : 'Сохранить'}
                        </button>
                      )}
                      <ChevronDown size={13} className={`text-slate-600 transition-transform ${weekPlanOpen.includes(idx) ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {/* Accordion body */}
                  {weekPlanOpen.includes(idx) && item.session && (
                    <div className="border-t border-white/[0.05] px-5 pb-5 pt-4">
                      {item.session.assessment && (
                        <p className="mb-4 text-xs leading-relaxed text-slate-400">{item.session.assessment}</p>
                      )}
                      <div className="space-y-5">
                        {(item.session.blocks || []).map((block, bi) => (
                          <div key={bi}>
                            <div className="mb-2 flex items-center gap-2.5">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/20 text-[10px] font-black text-accent">
                                {block.label}
                              </span>
                              {block.rest_note && (
                                <span className="text-[10px] text-slate-600">⏱ {block.rest_note}</span>
                              )}
                            </div>
                            <div className="space-y-1.5 pl-8">
                              {(block.exercises || []).map((ex, ei) => (
                                <div key={ei} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
                                  <div className="flex flex-wrap items-baseline gap-2">
                                    <span className="rounded bg-accent/10 px-1 text-[10px] font-bold text-accent">{ex.code}</span>
                                    <span className="text-xs font-semibold text-slate-200">{ex.name}</span>
                                    <span className="text-[10px] text-slate-500">{(ex.targetSets || []).length}×{ex.targetSets?.[0]}</span>
                                    {ex.weightNote && <span className="text-[10px] text-slate-500">{ex.weightNote}</span>}
                                    {ex.autoReg && <span className="text-[10px] text-amber-400/70">⚡ {ex.autoReg}</span>}
                                  </div>
                                  <p className="mt-1 text-[10px] leading-snug text-slate-500">{exerciseDescription(ex)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          </div>}{/* /playerId && */}

          {/* ── Footer ── */}
          {playerId && (
            <footer className="mt-14 flex items-center justify-center gap-3 print:hidden">
              <span className="text-[11px] font-semibold tracking-[0.18em] text-white/[0.18] uppercase">
                Korenchuk Performance System
              </span>
              <span className="h-px w-5 bg-accent/[0.16]" />
              <span className="text-[11px] font-medium text-white/[0.12]">Strength & Conditioning Platform</span>
            </footer>
          )}

          </div>
          </>)} {/* end workouts section */}
        </div>{/* /workspace */}
      </div>{/* /flex */}

      {/* ── Copy program modal ── */}
      {copyModalOpen && (
        <div
          className="premium-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !copying && setCopyModalOpen(false)}
        >
          <div
            className="premium-modal-card w-full max-w-xs rounded-3xl border border-white/[0.12] p-5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-bold text-white">Скопировать программу игроку</h3>
            <p className="mb-4 text-[11px] text-slate-400">{meta?.player?.name} · {date}. Копия появится у получателя как черновик для проверки. Индивидуальные веса не переносятся.</p>
            <label className="mb-3 block text-xs text-slate-300">Команда получателя
              <PremiumSelect title="Команда получателя" value={copyWorkspace} disabled={copying} onChange={setCopyWorkspace} options={[{value:'zarechie',label:'Заречье'},{value:'nkperf',label:'NK Pro'}]} className="mt-1 min-h-11 w-full rounded-xl bg-slate-900 p-2 text-white" />
            </label>
            <label className="mb-3 block text-xs text-slate-300">Дата программы получателя
              <input aria-label="Дата программы получателя" type="date" value={copyDate} disabled={copying} onChange={e=>setCopyDate(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl bg-slate-900 p-2 text-white" />
            </label>
            <label className="mb-3 flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={copyKeepExact} disabled={copying} onChange={e=>setCopyKeepExact(e.target.checked)} />Сохранить состав точно: разово разрешить повторы для этой программы. Запреты тренера сохраняются.</label>
            {copyError && <p role="alert" className="mb-3 text-xs text-rose-300">{copyError}</p>}
            {copyPlayersLoading && <p className="py-3 text-xs text-slate-400">Загрузка игроков…</p>}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {copyPlayers.filter(p => copyWorkspace !== workspace || String(p.id) !== String(playerId) || copyDate !== date).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => copyTo(p.id)}
                  disabled={copying || !copyDate}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06] disabled:opacity-50"
                >
                  {p.photo ? (
                    <img src={p.photo} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover object-top" />
                  ) : (
                    <div className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg bg-white/[0.07] text-[10px] font-black text-slate-400">
                      {initials(p.name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-slate-200 truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-600">{p.position || '—'}</div>
                  </div>
                  <span className={`h-2 w-2 rounded-full ${positionDot(p.position)}`} />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => !copying && setCopyModalOpen(false)}
              className="mt-3 w-full rounded-xl border border-white/[0.07] py-2 text-xs text-slate-500 hover:text-slate-300 transition"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* ── Copy done toast ── */}
      {copyDone && (
        <div className="premium-toast fixed bottom-5 right-5 z-50 rounded-2xl border border-emerald-300/20 px-4 py-3 text-sm font-semibold text-emerald-200 animate-fade-in">
          <div>✓ Черновик скопирован → {copyDone.name}</div>
          <a className="mt-2 block underline" target="_blank" rel="noopener noreferrer" href={`/?assignedWorkspace=${copyDone.workspace}&assignedPlayer=${encodeURIComponent(copyDone.playerId)}&assignedDate=${copyDone.date}`}>Открыть, проверить и сохранить</a>
          <button type="button" aria-label="Закрыть уведомление копирования" className="ml-3 text-xs" onClick={()=>setCopyDone(null)}>Закрыть</button>
        </div>
      )}

      {/* ── Photo edit modal ── */}
      {editPhotoFor && (
        <div
          className="premium-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => { if (!photoUploading) setEditPhotoFor(null); }}
        >
          <div
            className="premium-modal-card w-full max-w-xs rounded-3xl border border-white/[0.12] p-5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-4 text-sm font-bold text-white">Фото профиля</h3>

            {/* File upload — primary */}
            <button
              type="button"
              onClick={() => photoFileRef.current?.click()}
              disabled={photoUploading}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent/30 bg-accent/[0.05] py-4 text-[13px] font-semibold text-accent transition hover:border-accent/60 hover:bg-accent/[0.10] disabled:opacity-50"
            >
              {photoUploading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                  Загружаю…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Выбрать фото с компьютера
                </>
              )}
            </button>
            <input
              ref={photoFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadPlayerPhoto(f); e.target.value = ''; }}
            />

            {/* URL fallback */}
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">или ссылка</div>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://..."
                value={photoInput}
                onChange={e => setPhotoInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && savePhoto()}
                className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-accent/40"
              />
              <button
                type="button"
                onClick={() => savePhoto()}
                disabled={!photoInput.trim() || photoUploading}
                className="rounded-xl bg-accent/20 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/30 disabled:opacity-40"
              >
                ОК
              </button>
            </div>

            <div className="mt-3 flex justify-between gap-2">
              {players.find(p => p.id === editPhotoFor)?.photo && (
                <button
                  type="button"
                  onClick={() => savePhoto('')}
                  disabled={photoUploading}
                  className="rounded-xl border border-white/[0.07] px-3 py-2 text-xs text-slate-500 hover:text-rose-400 transition disabled:opacity-40"
                >
                  Удалить фото
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditPhotoFor(null)}
                disabled={photoUploading}
                className="ml-auto rounded-xl border border-white/[0.07] px-3 py-2 text-xs text-slate-500 hover:text-slate-300 transition disabled:opacity-40"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
