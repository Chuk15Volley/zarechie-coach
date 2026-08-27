// pages/player/[id].js
// Individual player training page — shared link, mobile-first workout tracking.
// SSR: fetches today's saved session from Redis server-side (no client secrets exposed).

import { useState, useEffect, useRef, useMemo, Component } from 'react';
import Head from 'next/head';
import { createPortal } from 'react-dom';
import { redis, redisPipeline } from '../../lib/redis';
import { findExerciseUrl } from '../../lib/exerciseBank';
import { getPlayerInfo } from '../../lib/playerData';
import { resolveShareToken } from '../../lib/shareToken';
import { parseSavedSession, sessionDayGoal, sessionTrainingLabel } from '../../lib/sessionLabel';
import { pfx, playerPhotoKey, sessionKey, sessionsKey } from '../../lib/workspacePrefix';
import { loadUnitsForExercise } from '../../lib/tonnage';
import { exerciseDescription } from '../../lib/tempoDescription.mjs';
import { analyzeSessionDose } from '../../lib/sessionDose.mjs';
import {
  completedTonnage,
  exerciseIsComplete,
  firstIncompleteExercise,
  formatWorkoutDuration,
  nextExercise,
  restSecondsFor,
  workoutExercises,
} from '../../lib/playerWorkout.mjs';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

function parsePlayerLog(raw) {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#07101a] text-slate-100 flex flex-col items-center justify-center px-6 py-24 text-center">
          <div className="mb-4 text-5xl">⚠️</div>
          <h2 className="mb-2 text-lg font-bold text-slate-200">Ошибка загрузки страницы</h2>
          <p className="text-sm leading-relaxed text-slate-500 mb-6">
            Попробуй обновить страницу или запроси новую ссылку у тренера.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-[#4ade80]/20 border border-[#4ade80]/30 px-5 py-2.5 text-sm font-semibold text-[#4ade80]"
          >
            Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export async function getServerSideProps({ params }) {
  const token = params.id;
  const date = todayISO();

  // Resolve token → playerId + workspace (never expose playerId to the client)
  const resolved = await resolveShareToken(token);
  if (!resolved?.playerId) {
    return { props: { token, session: null, sessionLabel: '', player: null, sessionDate: null, dayGoal: '', isToday: false, notFound: true, sessionDates: [], sessionHistory: [], playerPhoto: null, serverLog: null } };
  }
  const { playerId, workspace } = resolved;

  const [allDates, storedPhoto, legacyPhoto, playerInfo] = await Promise.all([
    redis('zrange', sessionsKey(workspace, playerId), 0, -1).catch(() => []),
    redis('get', playerPhotoKey(workspace, playerId)).catch(() => null),
    workspace === 'zarechie' ? redis('get', `player:photo:${playerId}`).catch(() => null) : Promise.resolve(null),
    getPlayerInfo(playerId, workspace).catch(() => null),
  ]);
  // The public page must know who owns the link even before the coach saves
  // that player's first session. Previously identity came only from
  // record.player, which rendered new players as anonymous "Игрок".
  const playerProfile = playerInfo ? {
    name: playerInfo.name || '',
    position: playerInfo.position || '',
  } : null;
  let playerPhoto = storedPhoto || legacyPhoto || playerInfo?.photo || null;
  const sessionDates = [...(allDates || [])].reverse();

  // One Redis round-trip provides labels for the whole history. Old records use
  // their saved day goal; new records also carry the exact phase/training type.
  const historyRaws = sessionDates.length
    ? await redisPipeline(sessionDates.map(sessionDate => ['get', sessionKey(workspace, playerId, sessionDate)])).catch(() => [])
    : [];
  const historyRecords = new Map();
  const sessionHistory = sessionDates.map((sessionDate, index) => {
    const parsed = parseSavedSession(historyRaws[index]);
    if (parsed.record) historyRecords.set(sessionDate, parsed.record);
    return {
      date: sessionDate,
      label: sessionTrainingLabel(parsed.record),
      dayGoal: sessionDayGoal(parsed.record),
    };
  });

  let record = null;
  const rawToday = await redis('get', sessionKey(workspace, playerId, date)).catch(() => null);

  if (rawToday) {
    record = parseSavedSession(rawToday).record;
  }

  if (!record) {
    record = sessionDates.map(sessionDate => historyRecords.get(sessionDate)).find(Boolean) || null;
  }

  if (!record) {
    return { props: { token, session: null, sessionLabel: '', player: playerProfile, sessionDate: null, dayGoal: '', isToday: false, notFound: false, sessionDates, sessionHistory, playerPhoto: playerPhoto || null, serverLog: null } };
  }

  const activeSession = parseSavedSession(record).session;
  playerPhoto = playerPhoto || record.player?.photo || null;
  const recordPlayer = record.player || null;
  const player = playerProfile || (recordPlayer ? {
    name: recordPlayer.name || '',
    position: recordPlayer.position || '',
  } : null);

  const resolvedDate = record.date || date;
  const logRaw = await redis('get', `${pfx(workspace)}:log:${playerId}:${resolvedDate}`).catch(() => null);
  const serverLog = parsePlayerLog(logRaw);

  return {
    props: {
      token,
      session: activeSession,
      sessionLabel: sessionTrainingLabel(record),
      player,
      sessionDate: resolvedDate,
      dayGoal: record.dayGoal || '',
      isToday: (record.date || '') === date,
      notFound: false,
      sessionDates,
      sessionHistory,
      playerPhoto: playerPhoto || null,
      serverLog: serverLog || null,
      isMatchDayPrimer: record.quality?.seasonDecision?.key === 'match_day',
    },
  };
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatKgValue(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function parseKgFromNote(note) {
  const m = String(note || '').match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)\b/i);
  return m ? m[1].replace(',', '.') : '';
}

function plannedWeightLabel(ex) {
  const kg = formatKgValue(ex?.weightKg) || formatKgValue(parseKgFromNote(ex?.weightNote));
  if (kg) return `${kg} кг${loadUnitsForExercise(ex) === 2 ? ' на снаряд × 2' : ''}`;
  return String(ex?.weightNote || '').trim();
}

function plannedWeightValue(ex) {
  return formatKgValue(ex?.weightKg) || formatKgValue(parseKgFromNote(ex?.weightNote));
}

// ── Set button — tappable, turns green when done, shows weight input ──────────
function SetBtn({ label, value, done, onToggle, weight, onWeightChange, plannedWeight, plannedWeightValue, requiresWeight }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`player-set-button flex h-[72px] w-full min-w-0 flex-col items-center justify-center rounded-xl border px-1.5 py-2 transition-all duration-200 active:scale-[0.97] ${
        done
          ? 'border-emerald-400/55 bg-emerald-500/[0.16] shadow-[0_0_16px_rgba(52,211,153,0.14)]'
          : 'border-white/[0.10] bg-white/[0.035]'
      }`}
    >
      <span className={`mb-0.5 text-[10px] font-bold ${done ? 'text-emerald-300' : 'text-slate-600'}`}>
        {done ? '✓' : label}
      </span>
      <span className={`text-[15px] font-black leading-none ${done ? 'text-emerald-200' : 'text-slate-100'}`}>
        {value}
      </span>
      {done && requiresWeight && (
        <input
          type="text"
          inputMode="decimal"
          value={weight || ''}
          onChange={e => onWeightChange(e.target.value)}
          onClick={e => e.stopPropagation()}
          placeholder={plannedWeightValue || 'кг'}
          aria-label={`Фактический вес, подход ${label}`}
          className="player-weight-input mt-1.5 w-full rounded-md border border-emerald-400/20 bg-black/25 px-1 py-0.5 text-center text-[10px] text-emerald-100 placeholder-emerald-800 outline-none focus:border-emerald-400/50"
          maxLength={6}
        />
      )}
    </button>
  );
}

// ── Exercise video link — from the exercise bank ─────────────────────────────
const YT_ICON_SMALL = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
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

function PlayerVideoModal({ name, videoId, watchUrl, onClose }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const host = typeof document !== 'undefined'
    ? document.querySelector('.player-page-shell') || document.body
    : null;
  if (!host) return null;

  return createPortal(
    <div className="player-video-modal" role="dialog" aria-modal="true" aria-label={`Техника упражнения: ${name}`}>
      <button type="button" className="player-video-modal-backdrop" onClick={onClose} aria-label="Закрыть видео" />
      <div className="player-video-modal-card">
        <div className="player-video-modal-head">
          <div className="min-w-0">
            <div className="player-kicker">Техника упражнения</div>
            <div className="mt-1 truncate text-[15px] font-bold text-white">{name}</div>
          </div>
          <button type="button" onClick={onClose} className="player-video-close" aria-label="Закрыть">×</button>
        </div>
        <div className="player-video-frame">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`}
            title={`Техника: ${name}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <div className="player-video-modal-actions">
          <span>После просмотра вернись к текущему подходу.</span>
          <a href={watchUrl} target="_blank" rel="noopener noreferrer">Открыть в YouTube ↗</a>
        </div>
      </div>
    </div>,
    host
  );
}

function ExerciseMedia({ name, token }) {
  const bankUrl = findExerciseUrl(name);
  const [media, setMedia] = useState(null); // { video }
  const [open, setOpen] = useState(false);

  // Fetch media meta (manual video URL)
  useEffect(() => {
    if (!name?.trim() || !token) return;
    let cancelled = false;
    fetch(`/api/exercises/player-media?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setMedia(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [name, token]);

  const videoUrl = media?.video || bankUrl;
  const videoId = youtubeVideoId(videoUrl);
  const watchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : videoUrl;

  return (
    <>
      {videoId ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="player-exercise-media relative block aspect-video w-full overflow-hidden rounded-[18px] border border-white/[0.09] bg-black text-left shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
          aria-label={`Смотреть технику: ${name}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover opacity-80"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="player-video-button grid h-12 w-12 place-items-center rounded-full bg-red-600 text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
          <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
            Смотреть технику
          </span>
        </button>
      ) : videoUrl ? (
        <>
          <div className="mt-1 flex items-center gap-2">
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2 py-1.5 text-[11px] font-semibold text-red-300"
            >
              {YT_ICON_SMALL}
              Видео упражнения
            </a>
          </div>
        </>
      ) : (
        <div className="mt-2 flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 text-slate-600">
          {YT_ICON_SMALL}
          <span className="text-[11px] font-semibold">Видео не добавлено</span>
        </div>
      )}
      {open && videoId && (
        <PlayerVideoModal name={name} videoId={videoId} watchUrl={watchUrl} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// ── Single exercise card ──────────────────────────────────────────────────────
function ExCard({ bi, ei, ex, block, done, onToggle, weights, onWeightChange, token, collapsed = false, onFocus }) {
  const plannedWeight = plannedWeightLabel(ex);
  const plannedSetWeight = plannedWeightValue(ex);
  const weightNote = String(ex.weightNote || '').trim();
  const showWeightNote = weightNote && weightNote !== plannedWeight && !weightNote.includes(plannedWeight);
  const setCount = (ex.targetSets || []).length;
  const setGrid = setCount >= 4 ? 'grid-cols-4' : setCount === 3 ? 'grid-cols-3' : setCount === 2 ? 'grid-cols-2' : 'grid-cols-1';
  const complete = setCount > 0 && (ex.targetSets || []).every((_, si) => done[`${bi}-${ei}-${si}`]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onFocus}
        className={`player-exercise-compact ${complete ? 'is-complete' : ''}`}
        aria-label={`${complete ? 'Выполнено' : 'Открыть'}: ${ex.name}`}
      >
        <span className="player-exercise-code">{ex.code}</span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[14px] font-bold text-slate-200">{ex.name}</span>
          <span className="mt-0.5 block text-[10px] font-semibold text-slate-600">
            {complete ? 'Все подходы выполнены' : `${setCount} подхода · нажми, чтобы открыть`}
          </span>
        </span>
        <span className={complete ? 'text-emerald-300' : 'text-slate-600'}>{complete ? '✓' : '›'}</span>
      </button>
    );
  }

  return (
    <article className="player-exercise-card overflow-hidden rounded-[20px] border border-white/[0.1] bg-[#0d1921] shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
      {/* Header */}
      <div className="player-exercise-heading flex items-start gap-2.5 bg-gradient-to-r from-[#4ade80]/[0.15] to-transparent px-3.5 py-3">
        <span className="player-exercise-code shrink-0 rounded-lg bg-[#4ade80]/20 px-2 py-1 text-[11px] font-black text-[#4ade80]">
          {ex.code}
        </span>
        <span className="player-exercise-name min-w-0 pt-0.5 text-[17px] font-bold leading-snug text-white">{ex.name}</span>
      </div>

      {plannedWeight && (
        <div className="player-weight-strip flex items-baseline justify-between gap-3 border-b border-white/[0.06] bg-[#4ade80]/[0.065] px-3.5 py-2.5">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#4ade80]/60">Рабочий вес</div>
          <div className="text-right text-[18px] font-black leading-none text-[#4ade80]">{plannedWeight}</div>
        </div>
      )}

      {/* Image + video */}
      <div className="px-3.5 pt-3">
        <ExerciseMedia name={ex.name} token={token} />
      </div>

      {/* Sets row */}
      <div className={`grid ${setGrid} gap-2 px-3.5 pt-3`}>
        {(ex.targetSets || []).map((s, si) => {
          const key = `${bi}-${ei}-${si}`;
          return (
            <SetBtn
              key={si}
              label={`${si + 1}`}
              value={s}
              done={!!done[key]}
              onToggle={() => onToggle(key, { bi, ei, si, block, ex })}
              weight={weights?.[key] || ''}
              onWeightChange={val => onWeightChange(key, val)}
              plannedWeight={plannedSetWeight ? plannedWeight : ''}
              plannedWeightValue={plannedSetWeight}
              requiresWeight={!!plannedSetWeight}
            />
          );
        })}
      </div>

      {/* Details */}
      <div className="space-y-2.5 px-3.5 pb-3.5 pt-3">
        {showWeightNote && (
          <div className="text-[14px] font-semibold text-slate-200">{weightNote}</div>
        )}
        {ex.autoReg && (
          <div className="player-autoreg flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5">
            <span className="text-base leading-none text-amber-400">⚡</span>
            <span className="text-[13px] leading-snug text-amber-300/90">{ex.autoReg}</span>
          </div>
        )}
        {(typeof ex.descriptionOverride === 'string' || ex.cue || ex.tempo) && (
          <p className="text-[14px] leading-relaxed text-slate-400">{exerciseDescription(ex)}</p>
        )}
      </div>
    </article>
  );
}

// ── Workout feedback form ─────────────────────────────────────────────────────
const FEEL_OPTIONS = [
  { value: 'easy',      emoji: '💪', label: 'Легко' },
  { value: 'good',      emoji: '😊', label: 'Хорошо' },
  { value: 'hard',      emoji: '😓', label: 'Тяжело' },
  { value: 'very_hard', emoji: '🤕', label: 'Очень тяжело' },
];

function FeedbackForm({ token, sessionDate, session, done, weights, isMatchDayPrimer = false, onRpeChange, onSubmitted }) {
  const [rpe, setRpe] = useState(null);
  const [fatigue, setFatigue] = useState(null);
  const [feel, setFeel] = useState(null);
  const [note, setNote] = useState('');
  const [speedFeel, setSpeedFeel] = useState(null);
  const [legFeel, setLegFeel] = useState(null);
  const [shoulderFeel, setShoulderFeel] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const missingWeightCount = (session?.blocks || []).reduce((missing, block, bi) =>
    missing + (block.exercises || []).reduce((exerciseMissing, ex, ei) => {
      if (!plannedWeightValue(ex)) return exerciseMissing;
      return exerciseMissing + (ex.targetSets || []).filter((_, si) => {
        const key = `${bi}-${ei}-${si}`;
        return done[key] && !formatKgValue(String(weights[key] || '').replace(',', '.'));
      }).length;
    }, 0), 0);

  async function submit() {
    const primerComplete = speedFeel && legFeel && shoulderFeel;
    if (!rpe || (!isMatchDayPrimer && !fatigue) || (isMatchDayPrimer && !primerComplete) || sending || missingWeightCount > 0) return;
    setSending(true);
    try {
      const response = await fetch('/api/player/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, date: sessionDate, rpe, fatigue, feel, note, done, weights,
          primerFeedback: isMatchDayPrimer ? { speed: speedFeel, legs: legFeel, shoulder: shoulderFeel } : null,
        }),
      });
      if (!response.ok) throw new Error('Feedback failed');
      setSubmitted(true);
      onSubmitted?.({ rpe, fatigue, feel });
    } catch (_) {}
    setSending(false);
  }

  if (submitted) {
    return (
      <div className="player-feedback-success rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.09] px-4 py-8 text-center">
        <div className="mb-2 text-3xl">💪</div>
        <div className="text-base font-black text-emerald-300">Тренировка завершена!</div>
        <div className="mt-2 text-sm text-emerald-600">Оценка отправлена тренеру</div>
      </div>
    );
  }

  return (
    <div className="player-feedback space-y-4">
      <div className="player-feedback-success rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.09] px-4 py-5 text-center">
        <div className="mb-1 text-3xl">💪</div>
        <div className="text-base font-black text-emerald-300">Тренировка завершена!</div>
        <div className="mt-0.5 text-xs text-emerald-600">Оцени нагрузку для тренера</div>
      </div>

      <div className="player-feedback-card rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4 space-y-4">
        {/* RPE */}
        <div>
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            RPE — насколько тяжело (1–10)
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => { setRpe(n); onRpeChange?.(n); }}
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-[13px] font-black transition-all active:scale-95 ${
                  rpe === n
                    ? 'bg-[#4ade80] text-[#060a0e]'
                    : 'border border-white/[0.10] bg-white/[0.04] text-slate-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {isMatchDayPrimer && (
          <>
            {[
              ['Ощущение скорости', speedFeel, setSpeedFeel, 'Медленно', 'Очень быстро'],
              ['Состояние ног', legFeel, setLegFeel, 'Тяжёлые', 'Лёгкие'],
              ['Состояние плеча', shoulderFeel, setShoulderFeel, 'Дискомфорт', 'Свободно'],
            ].map(([label, value, setter, low, high]) => (
              <div key={label}>
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label} (1–5)</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1,2,3,4,5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setter(n)}
                      aria-label={`${label}: ${n}`}
                      className={`rounded-xl border py-2.5 text-[13px] font-black transition-all active:scale-95 ${
                        value === n
                          ? 'border-[#4ade80]/50 bg-[#4ade80]/[0.12] text-[#4ade80]'
                          : 'border-white/[0.10] bg-white/[0.04] text-slate-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-slate-600"><span>{low}</span><span>{high}</span></div>
              </div>
            ))}
          </>
        )}

        {/* Overall fatigue */}
        {!isMatchDayPrimer && (
        <div>
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Общая усталость после тренировки (1–5)
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {[1,2,3,4,5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setFatigue(n)}
                className={`rounded-xl border py-2.5 text-[13px] font-black transition-all active:scale-95 ${
                  fatigue === n
                    ? n >= 4 ? 'border-amber-400/60 bg-amber-400/15 text-amber-300' : 'border-[#4ade80]/50 bg-[#4ade80]/[0.12] text-[#4ade80]'
                    : 'border-white/[0.10] bg-white/[0.04] text-slate-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Feel */}
        {!isMatchDayPrimer && <div>
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Общее ощущение
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {FEEL_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => setFeel(o.value)}
                className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-center transition-all active:scale-95 ${
                  feel === o.value
                    ? 'border-[#4ade80]/50 bg-[#4ade80]/[0.12] text-[#4ade80]'
                    : 'border-white/[0.08] bg-white/[0.03] text-slate-400'
                }`}
              >
                <span className="text-xl leading-none">{o.emoji}</span>
                <span className="text-[9px] font-semibold leading-tight">{o.label}</span>
              </button>
            ))}
          </div>
        </div>}

        {/* Note */}
        {!isMatchDayPrimer && <div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Комментарий тренеру (необязательно)..."
            maxLength={300}
            rows={2}
            className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-200 placeholder-slate-600 outline-none focus:border-[#4ade80]/30"
          />
        </div>}

        {missingWeightCount > 0 && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2.5 text-[12px] font-semibold text-amber-300">
            Укажи фактический вес во всех выполненных подходах с отягощением: осталось {missingWeightCount}.
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!rpe || (!isMatchDayPrimer && !fatigue) || (isMatchDayPrimer && (!speedFeel || !legFeel || !shoulderFeel)) || sending || missingWeightCount > 0}
          className="w-full rounded-xl bg-[#4ade80] py-3 text-[13px] font-black text-[#060a0e] transition disabled:opacity-40 active:scale-[0.98]"
        >
          {sending ? 'Отправка...' : 'Отправить тренеру'}
        </button>
      </div>
    </div>
  );
}

// ── Install hint banner ───────────────────────────────────────────────────────
function InstallHint() {
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) return;
    if (localStorage.getItem('pwa-hint-dismissed')) return;
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 12000);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem('pwa-hint-dismissed', '1');
  }

  if (!visible) return null;

  return (
    <div className="player-install-hint fixed bottom-5 inset-x-4 z-50 animate-fade-in">
      <div className="flex items-start gap-3 rounded-2xl border border-white/[0.12] bg-[#0d1e30]/95 px-4 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="mt-0.5 text-xl leading-none">📲</div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white">Добавь на экран домой</p>
          {isIOS ? (
            <p className="mt-0.5 text-[12px] leading-snug text-slate-400">
              Нажми <span className="font-bold text-slate-300">⬆ Поделиться</span> → <span className="font-bold text-slate-300">«На экран Домой»</span>
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] leading-snug text-slate-400">
              Нажми <span className="font-bold text-slate-300">⋮ Меню</span> → <span className="font-bold text-slate-300">«Добавить на главный экран»</span>
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-600">Откроется как приложение без браузера</p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:text-slate-300"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function SyncBadge({ status }) {
  const meta = {
    saved: ['Сохранено', 'is-saved'],
    syncing: ['Синхронизация', 'is-syncing'],
    offline: ['Без сети · сохранено здесь', 'is-offline'],
    error: ['Повторим синхронизацию', 'is-offline'],
    local: ['Сохранено на устройстве', 'is-local'],
  }[status] || ['Сохранено', 'is-saved'];
  return (
    <span className={`player-sync-badge ${meta[1]}`} role="status" aria-live="polite">
      <span className="player-sync-dot" />
      {meta[0]}
    </span>
  );
}

function WorkoutIntro({ sessionLabel, dayGoal, session, sessionDate, isToday, dose, onStart }) {
  const warnings = String(session?.warnings || '').trim();
  return (
    <section className="player-start-card">
      {!isToday && (
        <div className="player-old-session-alert">
          <span>!</span>
          <div>
            <strong>Это не сегодняшняя программа</strong>
            <p>Последняя сохранённая тренировка — {formatDate(sessionDate)}. Выполняй её только по согласованию с тренером.</p>
          </div>
        </div>
      )}
      <div className="player-kicker">Персональная сессия</div>
      <h2>{sessionLabel || 'Тренировка в зале'}</h2>
      {dayGoal && <p className="player-start-goal">{dayGoal}</p>}
      <div className="player-start-metrics">
        <div><strong>{dose.exerciseCount}</strong><span>упражнений</span></div>
        <div><strong>{dose.totalSets}</strong><span>подходов</span></div>
        <div><strong>≈ {dose.estimatedMinutes}</strong><span>минут</span></div>
        <div><strong>{session?.blocks?.length || 0}</strong><span>блоков</span></div>
      </div>
      {warnings && (
        <div className="player-start-warning">
          <div className="player-kicker">Важно от тренера</div>
          <p>{warnings}</p>
        </div>
      )}
      <button type="button" className="player-start-button" onClick={onStart}>
        <span className="player-start-icon">▶</span>
        Начать тренировку
      </button>
      <p className="player-start-note">Прогресс автоматически сохранится и будет доступен тренеру.</p>
    </section>
  );
}

function RestTimer({ timer, onToggle, onAdd, onSkip }) {
  if (!timer) return null;
  const progress = timer.total > 0 ? Math.max(0, Math.min(1, timer.remaining / timer.total)) : 0;
  return (
    <div className={`player-rest-timer ${timer.remaining === 0 ? 'is-complete' : ''}`} role="timer" aria-live="polite">
      <div className="player-rest-ring" style={{ '--rest-progress': `${progress * 360}deg` }}>
        <div><strong>{timer.remaining}</strong><span>сек</span></div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="player-kicker">{timer.remaining === 0 ? 'Можно продолжать' : 'Отдых между подходами'}</div>
        <div className="mt-1 truncate text-[13px] font-bold text-slate-100">{timer.label}</div>
        <div className="player-rest-actions">
          {timer.remaining > 0 && <button type="button" onClick={onToggle}>{timer.running ? 'Пауза' : 'Продолжить'}</button>}
          {timer.remaining > 0 && <button type="button" onClick={onAdd}>+15 сек</button>}
          <button type="button" onClick={onSkip}>{timer.remaining > 0 ? 'Пропустить' : 'Закрыть'}</button>
        </div>
      </div>
    </div>
  );
}

function UndoSetToast({ undo, onUndo, onDismiss }) {
  if (!undo) return null;
  return (
    <div className="player-undo-toast" role="status">
      <span className="player-undo-check">✓</span>
      <span className="min-w-0 flex-1 truncate">Подход {undo.setNumber} выполнен</span>
      <button type="button" onClick={onUndo}>Отменить</button>
      <button type="button" onClick={onDismiss} aria-label="Закрыть">×</button>
    </div>
  );
}

function CompletionSummary({ totalSets, elapsedSeconds, tonnage, rpe }) {
  return (
    <section className="player-completion-summary">
      <div className="player-completion-mark">✓</div>
      <div className="player-kicker">Сессия выполнена</div>
      <h2>Отличная работа</h2>
      <p>Все запланированные подходы отмечены. Оцени нагрузку — тренер получит итог вместе с фактическими весами.</p>
      <div className="player-completion-metrics">
        <div><strong>{totalSets}</strong><span>подходов</span></div>
        <div><strong>{formatWorkoutDuration(elapsedSeconds)}</strong><span>время</span></div>
        <div><strong>{tonnage > 0 ? `${(tonnage / 1000).toFixed(tonnage >= 10000 ? 1 : 2)} т` : '—'}</strong><span>тоннаж</span></div>
        <div><strong>{rpe || '—'}</strong><span>session RPE</span></div>
      </div>
    </section>
  );
}

function PlayerSplash({ visible }) {
  if (!visible) return null;
  return (
    <div className="player-splash" aria-hidden="true">
      <img src="/nk-logo.jpg" alt="" />
      <div>NK Performance</div>
      <span>Athlete application</span>
      <i />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PlayerPage({ token, session, sessionLabel, player, sessionDate, dayGoal, isToday, notFound, sessionDates, sessionHistory = [], playerPhoto, serverLog, isMatchDayPrimer = false }) {
  const initialDone = serverLog?.done || {};
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const flatExercises = useMemo(() => workoutExercises(session), [session]);
  const dose = useMemo(() => analyzeSessionDose(session || {}), [session]);
  const totalSets = flatExercises.reduce((sum, item) => sum + (item.exercise.targetSets?.length || 0), 0);
  const initialDoneCount = Object.values(initialDone).filter(Boolean).length;
  const initialAllDone = totalSets > 0 && initialDoneCount === totalSets;

  // Cross-device state is seeded from Redis, with a local offline fallback.
  const [done, setDone] = useState(initialDone);
  const [weights, setWeights] = useState(serverLog?.weights || {});
  const [activeBlock, setActiveBlock] = useState(0);
  const initialExercise = firstIncompleteExercise(session, initialDone) || flatExercises[0] || null;
  const [activeExercise, setActiveExercise] = useState(initialExercise ? { bi: initialExercise.bi, ei: initialExercise.ei } : { bi: 0, ei: 0 });
  const [focusMode, setFocusMode] = useState(true);
  const [workoutStarted, setWorkoutStarted] = useState(Boolean(serverLog?.startedAt || Object.values(initialDone).some(Boolean)));
  const [startedAt, setStartedAt] = useState(serverLog?.startedAt || null);
  const [completedAt, setCompletedAt] = useState(serverLog?.completedAt || (initialAllDone ? serverLog?.savedAt || null : null));
  const [elapsedSeconds, setElapsedSeconds] = useState(Number(serverLog?.elapsedSeconds) || (initialAllDone ? dose.estimatedMinutes * 60 : 0));
  const [sessionRpe, setSessionRpe] = useState(null);
  const [syncStatus, setSyncStatus] = useState(serverLog?.savedAt ? 'saved' : 'local');
  const [progressRevision, setProgressRevision] = useState(0);
  const [restTimer, setRestTimer] = useState(null);
  const [undoSet, setUndoSet] = useState(null);
  const [splashVisible, setSplashVisible] = useState(true);
  const blockRefs = useRef([]);
  const saveTimer = useRef(null);
  const undoTimer = useRef(null);

  // Load progress on mount: prefer server log, fall back to localStorage.
  useEffect(() => {
    if (!token || !sessionDate) return;
    if (serverLog && (serverLog.done || serverLog.weights)) return; // already seeded from server
    try {
      const saved = localStorage.getItem(`gym:${token}:${sessionDate}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.done) setDone(parsed.done);
        if (parsed.weights) setWeights(parsed.weights);
        if (parsed.startedAt) { setStartedAt(parsed.startedAt); setWorkoutStarted(true); }
        if (parsed.completedAt) setCompletedAt(parsed.completedAt);
        if (parsed.elapsedSeconds) setElapsedSeconds(Number(parsed.elapsedSeconds) || 0);
        const next = firstIncompleteExercise(session, parsed.done || {});
        if (next) setActiveExercise({ bi: next.bi, ei: next.ei });
        setProgressRevision(value => value + 1);
      }
    } catch (_) {}
  }, [token, sessionDate, serverLog, session]);

  // Persist the complete in-progress workout locally, including offline metadata.
  useEffect(() => {
    if (!token || !sessionDate) return;
    try {
      localStorage.setItem(`gym:${token}:${sessionDate}`, JSON.stringify({ done, weights, startedAt, completedAt, elapsedSeconds }));
    } catch (_) {}
  }, [done, weights, startedAt, completedAt, elapsedSeconds, token, sessionDate]);

  // Auto-sync with an offline queue. The latest payload is retried when connectivity returns.
  useEffect(() => {
    if (!token || !sessionDate || !session || progressRevision === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const payload = { token, date: sessionDate, done, weights, startedAt, completedAt, elapsedSeconds };
    const pendingKey = `gym:pending:${token}:${sessionDate}`;
    try { localStorage.setItem(pendingKey, JSON.stringify(payload)); } catch (_) {}
    if (!navigator.onLine) { setSyncStatus('offline'); return; }
    setSyncStatus('syncing');
    saveTimer.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/player/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('sync failed');
        try { localStorage.removeItem(pendingKey); } catch (_) {}
        setSyncStatus('saved');
      } catch (_) {
        setSyncStatus(navigator.onLine ? 'error' : 'offline');
      }
    }, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [progressRevision, token, sessionDate, session]);

  useEffect(() => {
    if (!token || !sessionDate) return undefined;
    const pendingKey = `gym:pending:${token}:${sessionDate}`;
    const flushPending = async () => {
      setSyncStatus('syncing');
      try {
        const raw = localStorage.getItem(pendingKey);
        if (!raw) { setSyncStatus('saved'); return; }
        const response = await fetch('/api/player/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: raw,
        });
        if (!response.ok) throw new Error('sync failed');
        localStorage.removeItem(pendingKey);
        setSyncStatus('saved');
      } catch (_) { setSyncStatus(navigator.onLine ? 'error' : 'offline'); }
    };
    const goOffline = () => setSyncStatus('offline');
    window.addEventListener('online', flushPending);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', flushPending);
      window.removeEventListener('offline', goOffline);
    };
  }, [token, sessionDate]);

  const [activeTab, setActiveTab] = useState('workout');
  const [selectedHistDate, setSelectedHistDate] = useState(null);
  const [histSession, setHistSession] = useState(null);
  const [histMeta, setHistMeta] = useState(null);
  const [histLoading, setHistLoading] = useState(false);

  const doneCount = Object.values(done).filter(Boolean).length;
  const pct = totalSets > 0 ? Math.round((doneCount / totalSets) * 100) : 0;
  const tonnage = useMemo(() => completedTonnage(session, done, weights), [session, done, weights]);

  useEffect(() => {
    let timer;
    try {
      if (sessionStorage.getItem('nk-player-splash-seen')) setSplashVisible(false);
      else {
        sessionStorage.setItem('nk-player-splash-seen', '1');
        timer = setTimeout(() => setSplashVisible(false), 720);
      }
    } catch (_) { timer = setTimeout(() => setSplashVisible(false), 500); }
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  useEffect(() => {
    if (!restTimer?.running || restTimer.remaining <= 0) return undefined;
    const timer = setInterval(() => {
      setRestTimer(current => current ? { ...current, remaining: Math.max(0, current.remaining - 1) } : null);
    }, 1000);
    return () => clearInterval(timer);
  }, [restTimer?.running, restTimer?.remaining]);

  useEffect(() => {
    if (restTimer?.remaining !== 0 || restTimer?.notified) return;
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    setRestTimer(current => current ? { ...current, running: false, notified: true } : null);
  }, [restTimer?.remaining, restTimer?.notified]);

  useEffect(() => {
    if (!workoutStarted || totalSets === 0 || doneCount !== totalSets || completedAt) return;
    const now = new Date();
    const start = startedAt ? new Date(startedAt) : now;
    const seconds = Math.max(1, Math.round((now.getTime() - start.getTime()) / 1000));
    setCompletedAt(now.toISOString());
    setElapsedSeconds(seconds);
    setProgressRevision(value => value + 1);
    setRestTimer(null);
    if (navigator.vibrate) navigator.vibrate([35, 60, 35, 60, 80]);
  }, [workoutStarted, totalSets, doneCount, completedAt, startedAt]);

  useEffect(() => {
    if (window.location.hash === '#history') setActiveTab('history');
  }, []);

  async function loadHistSession(date) {
    setHistLoading(true);
    setSelectedHistDate(date);
    try {
      const r = await fetch(`/api/player/session-detail?token=${encodeURIComponent(token)}&date=${date}`);
      if (r.ok) {
        const d = await r.json();
        setHistSession(d.session || null);
        setHistMeta({ label: d.label || 'Тренировка в зале', dayGoal: d.dayGoal || '' });
      }
    } catch (_) {}
    setHistLoading(false);
  }

  function startWorkout() {
    const now = new Date().toISOString();
    const first = firstIncompleteExercise(session, done) || flatExercises[0];
    setWorkoutStarted(true);
    setStartedAt(current => current || now);
    setCompletedAt(null);
    setProgressRevision(value => value + 1);
    if (first) {
      setActiveExercise({ bi: first.bi, ei: first.ei });
      setActiveBlock(first.bi);
    }
    if (navigator.vibrate) navigator.vibrate(20);
  }

  function toggleSet(key, context) {
    const wasDone = Boolean(done[key]);
    setDone(prev => ({ ...prev, [key]: !prev[key] }));
    setProgressRevision(value => value + 1);
    if (wasDone) {
      setRestTimer(null);
      setUndoSet(null);
      return;
    }

    if (navigator.vibrate) navigator.vibrate(16);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoSet({ key, setNumber: context.si + 1 });
    undoTimer.current = setTimeout(() => setUndoSet(null), 5200);

    const newDone = { ...done, [key]: true };
    const allFinished = totalSets > 0 && Object.values(newDone).filter(Boolean).length === totalSets;
    if (!allFinished) {
      const seconds = restSecondsFor(context.block, context.ex);
      setRestTimer({
        total: seconds,
        remaining: seconds,
        running: true,
        notified: false,
        label: context.block?.rest_note || `После ${context.ex?.code || 'подхода'}`,
      });
    }

    const item = { bi: context.bi, ei: context.ei, exercise: context.ex };
    if (exerciseIsComplete(item, newDone)) {
      const next = nextExercise(session, context.bi, context.ei);
      if (next) {
        setTimeout(() => {
          setActiveExercise({ bi: next.bi, ei: next.ei });
          setActiveBlock(next.bi);
          blockRefs.current[next.bi]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 320);
      }
    }
  }

  function undoLastSet() {
    if (!undoSet?.key) return;
    setDone(prev => ({ ...prev, [undoSet.key]: false }));
    setProgressRevision(value => value + 1);
    setUndoSet(null);
    setRestTimer(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function changeWeight(key, value) {
    setWeights(prev => ({ ...prev, [key]: value }));
    setProgressRevision(current => current + 1);
  }

  function scrollToBlock(idx) {
    setActiveBlock(idx);
    const target = flatExercises.find(item => item.bi === idx && !exerciseIsComplete(item, done))
      || flatExercises.find(item => item.bi === idx);
    if (target) setActiveExercise({ bi: target.bi, ei: target.ei });
    blockRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function focusExercise(bi, ei) {
    setFocusMode(true);
    setActiveExercise({ bi, ei });
    setActiveBlock(bi);
    blockRefs.current[bi]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/player/' })
        .then(registration => registration.update())
        .catch(() => {});
    }
  }, []);

  // Track active block on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = blockRefs.current.indexOf(e.target);
            if (idx !== -1) setActiveBlock(idx);
          }
        }
      },
      { threshold: 0.4 }
    );
    blockRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [blocks.length]);

  return (
    <ErrorBoundary>
    <>
      <Head>
        <title>{player?.name ? `${player.name} · NK Coach` : 'NK Coach'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#050b12" />
        {/* PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={player?.name || 'Тренировка'} />
        <link rel="manifest" href={`/api/player-manifest/${token}`} />
        <link rel="apple-touch-icon" href="/nk-logo.jpg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/nk-logo.jpg" />
      </Head>

      {/* Branded ambient background */}
      <div className="player-ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="player-ambient-emerald absolute -top-20 -left-20 h-[380px] w-[380px] rounded-full bg-[#4ade80]/[0.09] blur-[100px]" />
        <div className="player-ambient-cyan absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-blue-600/[0.07] blur-[100px]" />
      </div>

      <div className="app-shell player-page-shell min-h-screen bg-[#07101a] text-slate-100">
        {/* ── Athlete identity hero ── */}
        <header className="player-hero px-4 pb-4 pt-4">
          <div className="player-brand-row mb-5 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src="/nk-logo.jpg" alt="NK" className="player-brand-logo h-9 w-9 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <div className="player-brand-name truncate text-[10px] font-extrabold uppercase tracking-[0.18em] text-white">NK Performance</div>
                <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-emerald-300/60">Athlete application</div>
              </div>
            </div>
            <div className="player-session-state shrink-0 text-right">
              {activeTab === 'workout' && session ? (
                <>
                  <div className={`player-status-pill ${isToday ? 'is-today' : 'is-latest'}`}>
                    <span />{isToday ? 'Сегодня' : 'Последняя'}
                  </div>
                  <div className="player-session-date" suppressHydrationWarning>{formatDate(sessionDate)}</div>
                </>
              ) : activeTab === 'workout' ? (
                <div className="player-status-pill is-latest"><span />Ожидает программу</div>
              ) : selectedHistDate ? (
                <div className="player-session-date">{selectedHistDate}</div>
              ) : (
                <div className="player-status-pill is-muted"><span />История</div>
              )}
            </div>
          </div>

          <div className="player-identity flex items-center gap-3.5">
            {playerPhoto ? (
              <img src={playerPhoto} alt="" className="player-avatar h-14 w-14 shrink-0 rounded-[18px] border border-white/[0.1] object-cover" />
            ) : (
              <div className="player-avatar flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-[#4ade80]/20 text-[14px] font-black text-[#4ade80]">
                {initials(player?.name)}
              </div>
            )}
            <div className="min-w-0">
              <div className="mb-1 text-[8px] font-black uppercase tracking-[0.2em] text-[#4ade80]/60">
                Personal performance plan
              </div>
              <h1 className="player-page-title text-white">{player?.name || 'Игрок'}</h1>
              {player?.position && (
                <div className="player-position mt-1.5 text-[11px] text-slate-500">{player.position}</div>
              )}
            </div>
          </div>
        </header>

        {/* ── Compact sticky workout control ── */}
        {activeTab === 'workout' && session && workoutStarted && (
          <div className="player-progress-dock sticky top-0 z-30 border-y border-white/[0.07] bg-[#07101a]/95 px-4 pb-3 pt-3 backdrop-blur-xl">
            {totalSets > 0 && (
              <div className="player-progress-panel">
                <div className="mb-2 flex items-end justify-between">
                  <div>
                    <div className="player-kicker">Прогресс тренировки</div>
                    <div className="mt-0.5 text-[12px] font-semibold text-slate-300">{doneCount} из {totalSets} подходов</div>
                  </div>
                  <div className="player-progress-value">{pct}<span>%</span></div>
                </div>
                <div className="player-progress-track h-[4px] w-full rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-[#4ade80] transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}

            <div className="player-workout-tools">
              <SyncBadge status={syncStatus} />
              <button className="player-focus-toggle" type="button" onClick={() => setFocusMode(value => !value)} aria-pressed={focusMode}>
                {focusMode ? 'Фокус' : 'Все упражнения'}
              </button>
            </div>

            {blocks.length > 0 && (
            <div className="player-block-nav mt-3 flex gap-2 overflow-x-auto no-scrollbar">
              {blocks.map((block, bi) => {
                const blockTotal = (block.exercises || []).reduce((s, ex) => s + (ex.targetSets?.length || 0), 0);
                const blockDone = (block.exercises || []).reduce((s, ex, ei) =>
                  s + (ex.targetSets || []).filter((_, si) => done[`${bi}-${ei}-${si}`]).length, 0);
                const blockComplete = blockTotal > 0 && blockDone === blockTotal;
                return (
                  <button
                    key={bi}
                    type="button"
                    onClick={() => scrollToBlock(bi)}
                    className={`player-block-chip grid h-10 min-w-[48px] shrink-0 place-items-center rounded-xl px-3 text-xs font-bold transition-all ${
                      blockComplete
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : activeBlock === bi
                        ? 'bg-[#4ade80] text-[#060a0e] shadow-[0_2px_10px_rgba(74,222,128,0.35)]'
                        : 'border border-white/[0.08] bg-white/[0.03] text-slate-500'
                    }`}
                  >
                    {blockComplete ? `${block.label} ✓` : block.label}
                  </button>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* ── Tab bar ── */}
        {!notFound && sessionDates.length > 0 && (
          <nav className="player-tabs flex gap-1.5 border-b border-white/[0.05] px-4 py-2">
            {[['workout', 'Тренировка'], ['history', `История (${sessionDates.length})`]].map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === 'history') { setSelectedHistDate(null); setHistSession(null); setHistMeta(null); }
                }}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                  activeTab === tab
                    ? 'bg-[#4ade80]/20 text-[#4ade80]'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        {/* ── Invalid token ── */}
        {notFound && (
          <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h2 className="mb-2 text-lg font-bold text-slate-200">Ссылка недействительна</h2>
            <p className="text-sm leading-relaxed text-slate-500">
              Запроси актуальную ссылку у тренера.
            </p>
          </div>
        )}

        {/* ── No session ── */}
        {!notFound && !session && activeTab === 'workout' && (
          <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
            <div className="mb-4 text-5xl">🏋️</div>
            <h2 className="mb-2 text-lg font-bold text-slate-200">Тренировка не готова</h2>
            <p className="text-sm leading-relaxed text-slate-500">
              Тренер ещё не загрузил программу на сегодня.<br />
              Загляни позже или уточни у тренера.
            </p>
          </div>
        )}

        {/* ── Session content ── */}
        {!notFound && session && activeTab === 'workout' && (
          <main className="player-workout-content space-y-6 px-3.5 pb-24 pt-4">
            {!workoutStarted ? (
              <WorkoutIntro
                sessionLabel={sessionLabel}
                dayGoal={dayGoal}
                session={session}
                sessionDate={sessionDate}
                isToday={isToday}
                dose={dose}
                onStart={startWorkout}
              />
            ) : (
              <>
                {!isToday && (
                  <div className="player-old-session-alert">
                    <span>!</span>
                    <div>
                      <strong>Открыта прошлая программа</strong>
                      <p>{formatDate(sessionDate)} · выполняй только по согласованию с тренером.</p>
                    </div>
                  </div>
                )}

                {dayGoal && (
                  <div className="player-goal-card rounded-xl border border-[#4ade80]/20 bg-[#4ade80]/[0.05] px-4 py-4">
                    <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4ade80]/50">Цель тренировки</div>
                    <div className="text-[14px] font-semibold text-slate-200">{dayGoal}</div>
                  </div>
                )}

                {blocks.map((block, bi) => (
                  <div
                    key={bi}
                    ref={el => (blockRefs.current[bi] = el)}
                    className="player-block-section"
                    style={{ scrollMarginTop: '190px' }}
                  >
                    <div className="player-block-heading mb-3 flex items-center gap-3">
                      <span className="player-block-badge flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4ade80] text-sm font-black text-[#060a0e] shadow-[0_4px_14px_rgba(74,222,128,0.18)]">
                        {block.label}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Блок {block.label}</div>
                        {block.rest_note && <div className="mt-0.5 truncate text-[10px] text-slate-600">Отдых: {block.rest_note}</div>}
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      {(block.exercises || []).map((ex, ei) => (
                        <ExCard
                          key={ei}
                          bi={bi}
                          ei={ei}
                          ex={ex}
                          block={block}
                          done={done}
                          onToggle={toggleSet}
                          weights={weights}
                          onWeightChange={changeWeight}
                          token={token}
                          collapsed={focusMode && (activeExercise.bi !== bi || activeExercise.ei !== ei)}
                          onFocus={() => focusExercise(bi, ei)}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {totalSets > 0 && doneCount === totalSets && (
                  <div className="space-y-4">
                    <CompletionSummary totalSets={totalSets} elapsedSeconds={elapsedSeconds || dose.estimatedMinutes * 60} tonnage={tonnage} rpe={sessionRpe} />
                    <FeedbackForm
                      token={token}
                      sessionDate={sessionDate}
                      session={session}
                      done={done}
                      weights={weights}
                      isMatchDayPrimer={isMatchDayPrimer}
                      onRpeChange={setSessionRpe}
                    />
                  </div>
                )}
              </>
            )}
          </main>
        )}

        {/* ── History tab ── */}
        {!notFound && activeTab === 'history' && (
          <main className="player-history px-4 pb-24 pt-4">
            {!selectedHistDate ? (
              <div className="space-y-2">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">Все тренировки</p>
                {sessionHistory.map(item => (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => loadHistSession(item.date)}
                    className="player-history-row w-full flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-left transition hover:bg-white/[0.05] active:scale-[0.98]"
                  >
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-slate-200">{formatDate(item.date)}</div>
                      <div className="mt-1 text-[12px] font-bold text-[#4ade80]">{item.label}</div>
                      {item.dayGoal && item.dayGoal !== item.label && (
                        <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">Цель: {item.dayGoal}</div>
                      )}
                      <div className="mt-0.5 text-[10px] text-slate-700">{item.date}</div>
                    </div>
                    <span className="text-slate-600 text-lg">›</span>
                  </button>
                ))}
              </div>
            ) : histLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-6 w-6 rounded-full border-2 border-[#4ade80]/30 border-t-[#4ade80] animate-spin" />
              </div>
            ) : histSession ? (
              <div>
                <button
                  type="button"
                  onClick={() => { setSelectedHistDate(null); setHistSession(null); setHistMeta(null); }}
                  className="mb-4 flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-300 transition"
                >
                  ← Все тренировки
                </button>
                <div className="space-y-6">
                  <div className="rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/[0.05] px-4 py-3.5">
                    <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4ade80]/50">Вид тренировки</div>
                    <div className="text-[16px] font-black text-[#4ade80]">{histMeta?.label || 'Тренировка в зале'}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{formatDate(selectedHistDate)}</div>
                  </div>
                  {(histMeta?.dayGoal || histSession.blocks?.[0]?.goal || histSession.goal || histSession.day_goal) && (
                    <div className="rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/[0.05] px-4 py-3.5">
                      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4ade80]/50">Цель тренировки</div>
                      <div className="text-[14px] font-semibold text-slate-200">{histMeta?.dayGoal || histSession.blocks?.[0]?.goal || histSession.goal || histSession.day_goal}</div>
                    </div>
                  )}
                  {(histSession.blocks || []).map((block, bi) => (
                    <div key={bi}>
                      <div className="mb-3 flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4ade80] text-sm font-black text-[#060a0e]">
                          {block.label}
                        </span>
                        <div>
                          <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Блок {block.label}</div>
                          {block.rest_note && <div className="text-[11px] text-slate-600">⏱ {block.rest_note}</div>}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {(block.exercises || []).map((ex, ei) => (
                          <div key={ei} className="player-history-exercise overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                            <div className="flex items-center gap-2.5 bg-gradient-to-r from-[#4ade80]/[0.10] to-transparent px-4 py-3">
                              <span className="shrink-0 rounded-lg bg-[#4ade80]/20 px-2 py-1 text-[11px] font-black text-[#4ade80]">{ex.code}</span>
                              <span className="text-[15px] font-bold leading-snug text-white">{ex.name}</span>
                            </div>
                            {plannedWeightLabel(ex) && (
                              <div className="border-b border-white/[0.05] bg-[#4ade80]/[0.06] px-4 py-2">
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#4ade80]/55">Рабочий вес</div>
                                <div className="mt-0.5 text-[16px] font-black leading-none text-[#4ade80]">{plannedWeightLabel(ex)}</div>
                              </div>
                            )}
                            <div className="px-4 py-3 flex flex-wrap gap-2">
                              {(ex.targetSets || []).map((s, si) => (
                                <div key={si} className="flex min-w-[58px] flex-col items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                                  <span className="text-[10px] font-bold mb-0.5 text-slate-600">{si + 1}</span>
                                  <span className="text-sm font-black leading-none text-slate-400">{s}</span>
                                  {/^\d/.test(plannedWeightLabel(ex)) && <span className="mt-1 text-[9px] font-semibold leading-none text-slate-600">план {plannedWeightLabel(ex)}</span>}
                                </div>
                              ))}
                            </div>
                            {(typeof ex.descriptionOverride === 'string' || ex.cue || ex.coaching_note || ex.tempo) && (
                              <div className="px-4 pb-3 text-[12px] leading-relaxed text-slate-500">{exerciseDescription(ex)}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {histSession.warnings && (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-4">
                      <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-400/60">Важно</div>
                      <p className="text-[13px] leading-relaxed text-amber-200/70">{histSession.warnings}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-600 text-sm">Тренировка не найдена</div>
            )}
          </main>
        )}

        {workoutStarted && activeTab === 'workout' && (
          <RestTimer
            timer={restTimer}
            onToggle={() => setRestTimer(current => current ? { ...current, running: !current.running } : null)}
            onAdd={() => setRestTimer(current => current ? { ...current, total: current.total + 15, remaining: current.remaining + 15, running: true } : null)}
            onSkip={() => setRestTimer(null)}
          />
        )}
        <UndoSetToast undo={undoSet} onUndo={undoLastSet} onDismiss={() => setUndoSet(null)} />

        {/* ── Footer ── */}
        <div className="player-footer fixed bottom-0 left-0 right-0 flex items-center justify-center border-t border-white/[0.05] bg-[#07101a]/95 py-2 backdrop-blur-xl">
          <span className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/[0.24]">
            <span className="h-1 w-1 rounded-full bg-emerald-400/70" />
            NK Performance
          </span>
          {session && <SyncBadge status={syncStatus} />}
        </div>
      </div>

      <PlayerSplash visible={splashVisible} />
      <InstallHint />
    </>
    </ErrorBoundary>
  );
}
