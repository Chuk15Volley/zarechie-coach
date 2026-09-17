import { playerExerciseName, compactWorkoutTitle, repetitionInput, validRepetitions, actualTarget, targetLabel, isCircuit, focusExerciseIndex, shortCue, needsLoadEntry, russianCount, playerLoadLabel } from '../../lib/playerGym.mjs';
// pages/player/[id].js
// Individual player training page — shared link, mobile-first workout tracking.
// SSR: fetches today's saved session from Redis server-side (no client secrets exposed).

import { useState, useEffect, useRef, useMemo, Component } from 'react';
import Head from 'next/head';
import { Dumbbell, Layers3, Timer, LayoutGrid, Play } from 'lucide-react';
import OfflineProgram from '../../components/player/OfflineProgram';
import { useHoldTimer } from '../../lib/useHoldTimer';
import { usePlayerWakeLock } from '../../lib/usePlayerWakeLock';
import { SKIP_REASONS, skippedSetCount, selectSessionDate, holdPrescription, performanceKey, previousPerformances } from '../../lib/playerExperience.mjs';
import { usePlayerFeedback } from '../../lib/usePlayerFeedback';
import { usePlayerProgressSync } from '../../lib/usePlayerProgressSync';
import { mergeWorkoutProgress } from '../../lib/workoutProgress.mjs';
import { redis, redisPipeline } from '../../lib/redis';
import { findExerciseUrl } from '../../lib/exerciseBank';
import { getPlayerInfo } from '../../lib/playerData';
import { resolveShareToken } from '../../lib/shareToken';
import { parseSavedSession, sessionDayGoal, sessionTrainingLabel } from '../../lib/sessionLabel';
import { pfx, playerPhotoKey, sessionKey, sessionsKey, feedbackKey } from '../../lib/workspacePrefix';
import { loadUnitsForExercise } from '../../lib/tonnage';
import { exerciseDescription } from '../../lib/tempoDescription.mjs';
import { analyzeSessionDose } from '../../lib/sessionDose.mjs';
import {
  FINISH_REASONS,
  nextWorkoutSet,
  restRemaining,
  completedTonnage,
  blockIsComplete,
  firstIncompleteBlock,
  formatWorkoutDuration,
  nextIncompleteBlock,
  restSecondsFor,
  workoutExercises,
} from '../../lib/playerWorkout.mjs';

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
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

export async function getServerSideProps({ params, query = {} }) {
  const token = params.id;
  const date = todayISO();
  const requestedDate = typeof query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : null;

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

  const chosenDate = selectSessionDate(sessionDates, date, requestedDate);
  let record = chosenDate ? historyRecords.get(chosenDate) || null : null;
  if (chosenDate && !record) record = parseSavedSession(await redis('get', sessionKey(workspace, playerId, chosenDate)).catch(() => null)).record;

  if (!record) {
    return { props: { token, session: null, sessionLabel: '', player: playerProfile, sessionDate: requestedDate, dayGoal: '', isToday: false, notFound: false, sessionDates, sessionHistory, playerPhoto: playerPhoto || null, serverLog: null } };
  }

  const activeSession = parseSavedSession(record).session;
  playerPhoto = playerPhoto || record.player?.photo || null;
  const recordPlayer = record.player || null;
  const player = playerProfile || (recordPlayer ? {
    name: recordPlayer.name || '',
    position: recordPlayer.position || '',
  } : null);

  const resolvedDate = record.date || chosenDate || date;
  const previousDates = sessionDates.filter(value => value < resolvedDate).slice(0, 12);
  const previousRaw = await redisPipeline(previousDates.flatMap(value => [
    ['get', `${pfx(workspace)}:log:${playerId}:${value}`],
    ['get', `${pfx(workspace)}:session:actual:${playerId}:${value}`],
    ['get', feedbackKey(workspace, playerId, value)],
  ])).catch(() => []);
  const previousResults = previousPerformances(previousDates.map((value, index) => ({
    date: value, session: parseSavedSession(historyRecords.get(value)).session,
    log: parsePlayerLog(previousRaw[index * 3]), actual: parsePlayerLog(previousRaw[index * 3 + 1]), feedback: parsePlayerLog(previousRaw[index * 3 + 2]),
  })), resolvedDate);
  const logRaw = await redis('get', `${pfx(workspace)}:log:${playerId}:${resolvedDate}`).catch(() => null);
  const serverLog = parsePlayerLog(logRaw);
  const serverFeedback = parsePlayerLog(await redis('get', feedbackKey(workspace, playerId, resolvedDate)).catch(() => null));

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
      serverFeedback: serverFeedback || null,
      previousResults,
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
  if (kg) return loadUnitsForExercise(ex) === 2 ? `${/dumbbell|\bdb\b|гантел|^Chest-Supported Reverse Fly$/i.test(ex?.name || '') ? '2 гантели' : /kettlebell|\bkb\b|гир/i.test(ex?.name || '') ? '2 гири' : '2 снаряда'} по ${kg} кг` : `${kg} кг`;
  return playerLoadLabel(ex?.weightNote);
}

function plannedWeightValue(ex) {
  return formatKgValue(ex?.weightKg) || formatKgValue(parseKgFromNote(ex?.weightNote));
}

// ── Set button — tappable, turns green when done, shows weight input ──────────
function SetBtn({ label, value, done, onToggle, weight, onWeightChange, plannedWeight, plannedWeightValue, requiresWeight, previousWeight, setKey, repetitions, onRepsChange, active }) {
  const [expanded, setExpanded] = useState(false);
  const info = repetitionInput(value);
  const open = expanded || (active && !done);
  const weightValue = weight ?? plannedWeightValue;
  const repsValue = repetitions ?? String(info?.planned ?? '');
  const adjustWeight = delta => onWeightChange(String(Math.max(0, Math.round(((Number(String(weightValue).replace(',', '.')) || 0) + delta) * 100) / 100)));
  return <div className={`gym-set ${done ? 'is-done' : ''} ${open ? 'is-open' : ''}`}>
    <button type="button" className="gym-set-heading" onClick={() => setExpanded(v => !v)} aria-expanded={open}>
      <span className="gym-set-caption">{done && <span aria-hidden="true">✓ </span>}Подход {label}</span>
      <strong>{targetLabel(actualTarget(value, done ? repetitions : undefined))}{done && weight ? ` · ${weight} кг` : ''}</strong>
      <span className="text-xs">{open ? 'Выполнение' : done ? 'Изменить' : 'Открыть'}</span>
    </button>
    {open && <div className="gym-set-editor">
      <div className="gym-set-inputs">
        {info && <label>Повторения{info.perSide ? ' / сторону' : ''}<div className="gym-stepper">
          <button type="button" aria-label={`Уменьшить повторы, подход ${label}`} onClick={() => onRepsChange(String(Math.max(0, Number(repsValue || 0) - 1)))}>−</button>
          <input aria-label={`Фактические повторы, подход ${label}`} inputMode="numeric" value={repsValue} onChange={e => { if (/^\d{0,3}$/.test(e.target.value) && Number(e.target.value) <= 200) onRepsChange(e.target.value); }} />
          <button type="button" aria-label={`Увеличить повторы, подход ${label}`} onClick={() => onRepsChange(String(Math.min(200, Number(repsValue || 0) + 1)))}>+</button>
        </div></label>}
        {requiresWeight && <label>Вес снаряда, кг<div className="gym-stepper">
          <button type="button" aria-label={`Уменьшить вес, подход ${label}`} onClick={() => adjustWeight(-0.5)}>−</button>
          <input id={`weight-${setKey}`} aria-label={`Фактический вес, подход ${label}`} inputMode="decimal" value={weightValue} onChange={e => { if (/^\d{0,3}([.,]\d{0,2})?$/.test(e.target.value)) onWeightChange(e.target.value); }} />
          <button type="button" aria-label={`Увеличить вес, подход ${label}`} onClick={() => adjustWeight(0.5)}>+</button>
        </div></label>}
      </div>
      {requiresWeight && <div className="gym-quick-values">{plannedWeightValue && <button type="button" onClick={() => onWeightChange(String(plannedWeightValue))}>План: {plannedWeightValue} кг</button>}{previousWeight != null && previousWeight !== '' && <button type="button" onClick={() => onWeightChange(previousWeight)}>Предыдущий: {previousWeight} кг</button>}</div>}
      <button type="button" className="gym-confirm-set" disabled={!done && ((info && (repsValue === '' || validRepetitions(repsValue) == null)) || (requiresWeight && (weightValue === '' || !Number.isFinite(Number(String(weightValue).replace(',', '.'))))))} onClick={() => { onToggle(); setExpanded(false); }}>{done ? 'Снять отметку выполнения' : '✓ Подход выполнен'}</button>
    </div>}
  </div>;
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

function ExerciseMedia({ name, token }) {
  const bankUrl = findExerciseUrl(name);
  const [media, setMedia] = useState(null); // { video }

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
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
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
        </a>
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
        <div className="mt-1 flex items-center gap-2 text-slate-500">
          {YT_ICON_SMALL}
          <span className="text-[11px] font-semibold">Видео не добавлено</span>
        </div>
      )}
    </>
  );
}

// ── Single exercise card ──────────────────────────────────────────────────────
function ExCard({ bi, ei, ex, block, done, onToggle, weights, onWeightChange, repetitions = {}, onRepsChange, token, readOnly = false, skipReason, onSkip, onHold, previousResult }) {
  const [skipOpen, setSkipOpen] = useState(false);
  const [reason, setReason] = useState('');
  const plannedWeight = plannedWeightLabel(ex);
  const plannedSetWeight = plannedWeightValue(ex);
  const weightNote = String(ex.weightNote || '').trim();
  const showWeightNote = weightNote && !/^\d+(?:[.,]\d+)?\s*(?:кг|kg)\.?$/i.test(weightNote) && weightNote !== plannedWeight;
  const setCount = (ex.targetSets || []).length;
  const setGrid = readOnly && setCount >= 4 ? 'grid-cols-2 sm:grid-cols-4' : readOnly && setCount === 3 ? 'grid-cols-3' : readOnly && setCount === 2 ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <article data-block-tone={bi % 6} className="player-exercise-card overflow-hidden rounded-[20px] border border-white/[0.1] bg-[#0d1921] shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
      {/* Header */}
      <div className="player-exercise-heading flex items-start gap-2.5 bg-gradient-to-r from-[#4ade80]/[0.15] to-transparent px-3.5 py-3">
        <span className="player-exercise-code shrink-0 rounded-lg bg-[#4ade80]/20 px-2 py-1 text-[11px] font-black text-[#4ade80]">
          {ex.code}
        </span>
        <span className="player-exercise-name min-w-0 pt-0.5 text-[17px] font-bold leading-snug text-white">{playerExerciseName(ex)}</span>
      </div>

      {plannedWeight && (
        <div className={`player-weight-strip ${plannedSetWeight ? 'has-weight' : 'is-prescription'} flex items-baseline justify-between gap-3 border-b border-white/[0.06] bg-[#4ade80]/[0.065] px-3.5 py-2.5`}>
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#4ade80]/60">{plannedSetWeight ? 'Рабочий вес' : 'Нагрузка'}</div>
          <div className="text-right text-[18px] font-black leading-none text-[#4ade80]">{plannedWeight}</div>
        </div>
      )}

      {shortCue(ex) && <p className="gym-technique-cue">{shortCue(ex)}</p>}
      {/* Sets row */}
      <div className={`grid ${setGrid} gap-2 px-3.5 pt-3`}>
        {(ex.targetSets || []).map((s, si) => {
          const key = `${bi}-${ei}-${si}`;
          if (readOnly || (skipReason && !done?.[key])) return (
            <div key={si} className="gym-prescribed-set rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
              <div className="text-[11px] text-slate-500">Подход {si + 1}</div>
              <div className="mt-1 text-sm font-bold text-slate-200">{targetLabel(s)}</div>
              {skipReason && <div className="mt-1 text-xs text-amber-200">Пропущен</div>}
            </div>
          );
          return (
            <div key={si}>
            <SetBtn
              setKey={key}
              previousWeight={si > 0 ? weights?.[`${bi}-${ei}-${si - 1}`] : null}
              label={`${si + 1}`}
              value={s}
              done={!!done[key]}
              onToggle={() => onToggle(key, { bi, ei, si, block, ex })}
              active={si === (ex.targetSets || []).findIndex((_, i) => !done[`${bi}-${ei}-${i}`])}
              repetitions={repetitions[key]}
              onRepsChange={val => onRepsChange(key, val)}
              weight={weights?.[key]}
              onWeightChange={val => onWeightChange(key, val)}
              plannedWeight={plannedSetWeight ? plannedWeight : ''}
              plannedWeightValue={plannedSetWeight}
              requiresWeight={needsLoadEntry(ex)}
            />
            {!done[key] && holdPrescription(s, ex) && <button type="button" onClick={() => onHold({ key, bi, ei, si, name: ex.name, ...holdPrescription(s, ex) })} className="mt-2 w-full rounded-lg border border-emerald-400/25 px-1 py-2 text-xs text-emerald-200">Начать {holdPrescription(s, ex).seconds} сек{holdPrescription(s, ex).sides === 2 ? ' × 2 стороны' : ''}<span className="gym-hold-prep-hint">5 сек на подготовку</span></button>}
            </div>
          );
        })}
      </div>

      {/* Details */}
      <div className="space-y-2.5 px-3.5 pb-3.5 pt-3">
        {previousResult && <div className="gym-previous-result rounded-xl bg-white/[0.035] p-3 text-xs text-slate-300">
          <p>В прошлый раз · {formatDate(previousResult.date)}</p>
          <p className="mt-1">{previousResult.sets.map((set, index) => `${set.kg ? `${set.kg} кг × ` : ''}${targetLabel(set.target)}`).join(' · ')}</p>
          {previousResult.rpe && <p>Оценка нагрузки: {previousResult.rpe} / 10</p>}
        </div>}
        {!readOnly && (skipReason || (ex.targetSets || []).some((_, si) => !done[`${bi}-${ei}-${si}`])) && <div className="text-xs text-slate-400">
          {skipReason ? <><p className="text-amber-200">Оставшиеся подходы пропущены: {skipReason}</p><button type="button" onClick={() => onSkip(bi, ei, null)} className="mt-1 min-h-10 underline">Вернуть упражнение</button></> : <>
            <button type="button" onClick={() => setSkipOpen(open => !open)} className="min-h-10 underline">Есть проблема?</button>
            {skipOpen && <div className="space-y-2">
              <p>Можно пропустить оставшиеся подходы и вернуться к упражнению позже. Замену согласуй с тренером.</p><label className="block">Причина пропуска<select aria-label="Причина пропуска" value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-lg bg-slate-800 p-3"><option value="">Выбери причину</option>{SKIP_REASONS.map(value => <option key={value}>{value}</option>)}</select></label>
              {reason === 'Дискомфорт' && <p className="text-amber-200">Прекрати это упражнение и сообщи тренеру о дискомфорте.</p>}
              <button type="button" disabled={!reason} onClick={() => { onSkip(bi, ei, reason); setSkipOpen(false); }} className="rounded-lg border border-white/20 px-3 py-2 text-slate-200 disabled:opacity-40">Подтвердить пропуск</button>
            </div>}
          </>}
        </div>}
        <details className="gym-technique-details"><summary className="cursor-pointer py-2 text-sm font-semibold text-slate-300">Техника и видео</summary>
          <ExerciseMedia name={ex.name} token={token} />
          {showWeightNote && <p className="gym-load-note">{weightNote}</p>}
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{exerciseDescription(ex)}</p>{playerExerciseName(ex) !== ex.name && <p className="mt-2 text-xs text-slate-400">{ex.name}</p>}
        </details>
        {ex.autoReg && !ex.autoReg.startsWith('Новая или усиливающаяся боль, онемение, слабость') && (
          <div className="player-autoreg flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5">
            <span className="text-base leading-none text-amber-400">⚡</span>
            <span className="text-[13px] leading-snug text-amber-300/90">{ex.autoReg}</span>
          </div>
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

function FeedbackForm({ token, sessionDate, session, done, weights, repetitions, finishReason, skipped, lastActionAt, initialFeedback, isMatchDayPrimer = false, onRpeChange, onSubmitted }) {
  const [rpe, setRpe] = useState(null);
  const [fatigue, setFatigue] = useState(null);
  const [feel, setFeel] = useState(null);
  const [note, setNote] = useState('');
  const [speedFeel, setSpeedFeel] = useState(null);
  const [legFeel, setLegFeel] = useState(null);
  const [shoulderFeel, setShoulderFeel] = useState(null);
  const missingWeightCount = (session?.blocks || []).reduce((missing, block, bi) =>
    missing + (block.exercises || []).reduce((exerciseMissing, ex, ei) => {
      if (!plannedWeightValue(ex)) return exerciseMissing;
      return exerciseMissing + (ex.targetSets || []).filter((_, si) => {
        const key = `${bi}-${ei}-${si}`;
        return done[key] && !formatKgValue(String(weights[key] || '').replace(',', '.'));
      }).length;
    }, 0), 0);

  const draft = { rpe, fatigue, feel, note, speedFeel, legFeel, shoulderFeel };
  const { ready, queued, sending, submitted, message, submit, edit } = usePlayerFeedback({
    token, date: sessionDate, draft,
    initialFeedback: initialFeedback?.submittedAt >= (lastActionAt || '') ? initialFeedback : null,
    restore: saved => {
      setRpe(saved.rpe || null); setFatigue(saved.fatigue || null); setFeel(saved.feel || null); setNote(saved.note || '');
      setSpeedFeel(saved.speedFeel || null); setLegFeel(saved.legFeel || null); setShoulderFeel(saved.shoulderFeel || null);
      onRpeChange?.(saved.rpe || null);
    },
    payload: { token, date: sessionDate, rpe, fatigue, feel, note, done, weights, repetitions, finishReason, skipped,
      primerFeedback: isMatchDayPrimer ? { speed: speedFeel, legs: legFeel, shoulder: shoulderFeel } : null },
    onSubmitted: () => onSubmitted?.({ rpe, fatigue, feel }),
  });

  if (submitted) {
    return (
      <div className="player-feedback-success rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.09] px-4 py-8 text-center">
        <div className="mb-2 text-3xl">💪</div>
        <div className="text-base font-black text-emerald-300">{finishReason ? 'Тренировка завершена раньше' : Object.values(skipped || {}).some(Boolean) ? 'Тренировка завершена с пропусками' : 'Тренировка завершена!'}</div>
        <div className="mt-2 text-sm text-emerald-300">Оценка получена сервером и доступна тренеру</div>
        <button type="button" onClick={edit} className="mt-3 rounded-xl border border-white/15 p-3 text-sm text-slate-300">Изменить оценку</button>
      </div>
    );
  }

  return (
    <div className="player-feedback space-y-4">
      <div className="player-feedback-success rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.09] px-4 py-5 text-center">
        <div className="mb-1 text-3xl">💪</div>
        <div className="text-base font-black text-emerald-300">{finishReason ? 'Тренировка завершена раньше' : Object.values(skipped || {}).some(Boolean) ? 'Тренировка завершена с пропусками' : 'Тренировка завершена!'}</div>
        <div className="mt-0.5 text-xs text-emerald-600">Оцени нагрузку для тренера</div>
      </div>

      <fieldset disabled={!ready || sending || queued} className="player-feedback-card rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4 space-y-4">
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
            <button type="button" className="mt-2 block underline" onClick={() => {
              for (const [bi, block] of (session.blocks || []).entries()) for (const [ei, ex] of (block.exercises || []).entries()) {
                if (!plannedWeightValue(ex)) continue;
                const si = (ex.targetSets || []).findIndex((_, index) => done[`${bi}-${ei}-${index}`] && !formatKgValue(String(weights[`${bi}-${ei}-${index}`] || '').replace(',', '.')));
                if (si >= 0) { document.getElementById(`weight-${bi}-${ei}-${si}`)?.focus(); return; }
              }
            }}>Перейти к пропущенному весу</button>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!rpe || (!isMatchDayPrimer && !fatigue) || (isMatchDayPrimer && (!speedFeel || !legFeel || !shoulderFeel)) || sending || missingWeightCount > 0}
          className="w-full rounded-xl bg-[#4ade80] py-3 text-[13px] font-black text-[#060a0e] transition disabled:opacity-40 active:scale-[0.98]"
        >
          {sending ? 'Отправка...' : queued ? 'Ожидает отправки' : 'Отправить тренеру'}
        </button>
      </fieldset>
      <p role="status" className="text-sm text-slate-300">{message || 'Черновик оценки сохраняется на устройстве.'}</p>
      {queued && !sending && <button type="button" onClick={edit} className="rounded-xl border border-white/15 p-3 text-sm text-slate-300">Изменить перед отправкой</button>}
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
    if (standalone || !/iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent)) return;
    try { if (localStorage.getItem('pwa-hint-dismissed')) return; } catch (_) {}
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 12000);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem('pwa-hint-dismissed', '1'); } catch (_) {}
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

function SyncBadge({ status, savedAt }) {
  const meta = {
    saved: ['Сохранено', 'is-saved'],
    syncing: ['Синхронизация', 'is-syncing'],
    offline: ['Без сети · ожидает отправки', 'is-offline'],
    'storage-error': ['Не закрывай страницу · нет локальной копии', 'is-offline'],
    error: ['Повторим синхронизацию', 'is-offline'],
    local: ['Сохранено на устройстве', 'is-local'],
  }[status] || ['Сохранено', 'is-saved'];
  const time = savedAt && Number.isFinite(new Date(savedAt).getTime())
    ? new Date(savedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <span className={`player-sync-badge ${meta[1]}`} role="status" aria-live="polite" title={time ? `Последняя синхронизация: ${time}` : undefined}>
      <span className="player-sync-dot" />
      {meta[0]}{status === 'saved' && time ? ` · ${time}` : ''}
    </span>
  );
}

function WorkoutIntro({ sessionLabel, dayGoal, session, sessionDate, isToday, isUpcoming, dose, onStart, token, previousResults = {} }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <section className="player-start-card">
      {!isToday && !isUpcoming && (
        <div className="player-old-session-alert">
          <span>!</span>
          <div>
            <strong>Это не сегодняшняя программа</strong>
            <p>Последняя сохранённая тренировка — {formatDate(sessionDate)}. Выполняй её только по согласованию с тренером.</p>
          </div>
        </div>
      )}
      <div className="player-kicker">{isToday ? 'Тренировка на сегодня' : isUpcoming ? 'Индивидуальная программа' : 'Сохранённая программа'}</div>
      <h2>{compactWorkoutTitle(sessionLabel)}</h2>
      {dayGoal && <p className="player-start-goal">{dayGoal}</p>}
      <div className="player-start-metrics">
        <div><Dumbbell aria-hidden="true" /><strong>{dose.exerciseCount}</strong><span>{russianCount(dose.exerciseCount, 'упражнение', 'упражнения', 'упражнений')}</span></div>
        <div><Layers3 aria-hidden="true" /><strong>{dose.totalSets}</strong><span>{russianCount(dose.totalSets, 'подход', 'подхода', 'подходов')}</span></div>
        <div><Timer aria-hidden="true" /><strong>≈ {dose.estimatedMinutes}</strong><span>{russianCount(dose.estimatedMinutes, 'минута', 'минуты', 'минут')}</span></div>
        <div><LayoutGrid aria-hidden="true" /><strong>{session?.blocks?.length || 0}</strong><span>{russianCount(session?.blocks?.length || 0, 'блок', 'блока', 'блоков')}</span></div>
      </div>
      <button type="button" className="player-start-button" onClick={onStart}>
        <span className="player-start-icon"><Play size={16} fill="currentColor" aria-hidden="true" /></span>
        Начать тренировку
      </button>
      <p className="player-start-note">Результаты сохраняются автоматически.</p>
      <button type="button" className="gym-preview-toggle mb-3 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-slate-200" aria-expanded={previewOpen} aria-controls="workout-preview" onClick={() => setPreviewOpen(open => !open)}>
        <span>{previewOpen ? 'Скрыть упражнения' : 'Посмотреть упражнения'}</span><span aria-hidden="true">{previewOpen ? '−' : '+'}</span>
      </button>
      {previewOpen && (
        <div id="workout-preview" className="mb-5 space-y-5">
          <p className="text-sm text-slate-400">Можно заранее изучить упражнения. Таймер запустится, когда начнёшь тренировку.</p>
          {(session.blocks || []).map((block, bi) => (
            <section key={bi} data-block-tone={bi % 6} className="space-y-3">
              <h3 className="gym-preview-block-title"><span>{block.label}</span><span>{block.title || `Блок ${block.label}`}</span></h3>
              {block.rest_note && <p className="gym-rest-note">Отдых: {block.rest_note}</p>}
              {(block.exercises || []).map((ex, ei) => (
                <ExCard key={ei} bi={bi} ei={ei} ex={ex} block={block} token={token} previousResult={previousResults[performanceKey(ex)]} readOnly />
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function TimerDial({ remaining, total }) {
  const progress = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return <div className="player-rest-ring" style={{ '--rest-progress': `${progress * 360}deg` }}>
    <div><strong>{remaining}</strong><span>сек</span></div>
  </div>;
}

function RestTimer({ timer, onToggle, onAdd, onSkip, undo, onUndo }) {
  if (!timer) return null;
  return (
    <div className={`player-rest-timer ${timer.remaining === 0 ? 'is-complete' : ''}`} role="timer" aria-label="Таймер отдыха" aria-live="off">
      <TimerDial remaining={timer.remaining} total={timer.total} />
      <div className="player-timer-copy">
        <div className="player-kicker">{timer.remaining === 0 ? 'Можно продолжать' : timer.running ? 'Отдых между подходами' : 'Отдых · пауза'}</div>
        <div className="player-timer-next">{timer.label}</div>
      </div>
      <div className="player-rest-actions">
        {timer.remaining > 0 && <button type="button" onClick={onToggle}>{timer.running ? 'Пауза' : 'Продолжить'}</button>}
        {timer.remaining > 0 && <button type="button" onClick={onAdd}>+15 сек</button>}
        <button type="button" onClick={onSkip}>{timer.remaining > 0 ? 'Пропустить' : 'К подходу'}</button>
      </div>
      {undo && <button type="button" className="player-timer-undo" onClick={onUndo}>Отменить отметку</button>}
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

function CompletionSummary({ totalSets, elapsedSeconds, tonnage, rpe, finishReason, skippedCount = 0 }) {
  return (
    <section className="player-completion-summary">
      <div className="player-completion-mark">✓</div>
      <div className="player-kicker">{finishReason ? 'Завершена раньше' : skippedCount ? 'Завершена с пропусками' : 'Тренировка завершена'}</div>
      <h2>Отличная работа</h2>
      <p>{finishReason ? `Причина: ${finishReason}. Учтены только отмеченные подходы.` : skippedCount ? `Пропущено подходов: ${skippedCount}. Учтено только выполненное.` : 'Все запланированные подходы отмечены.'} Оцени нагрузку — тренер получит итог вместе с фактическими весами.</p>
      <div className="player-completion-metrics">
        <div><strong>{totalSets}</strong><span>{russianCount(totalSets, 'подход', 'подхода', 'подходов')}</span></div>
        <div><strong>{formatWorkoutDuration(elapsedSeconds)}</strong><span>время</span></div>
        <div><strong>{tonnage > 0 ? `${(tonnage / 1000).toFixed(tonnage >= 10000 ? 1 : 2)} т` : '—'}</strong><span>тоннаж</span></div>
        <div><strong>{rpe || '—'}</strong><span>оценка нагрузки</span></div>
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
function PlayerPage({ token, session, sessionLabel, player, sessionDate, dayGoal, isToday, notFound, sessionDates, sessionHistory = [], playerPhoto, serverLog, serverFeedback, previousResults = {}, isMatchDayPrimer = false }) {
  const isUpcoming = !isToday && sessionDate > todayISO();
  const initialDone = serverLog?.done || {};
  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const flatExercises = useMemo(() => workoutExercises(session), [session]);
  const dose = useMemo(() => analyzeSessionDose(session || {}), [session]);
  const totalSets = flatExercises.reduce((sum, item) => sum + (item.exercise.targetSets?.length || 0), 0);
  const initialDoneCount = Object.values(initialDone).filter(Boolean).length;
  const initialAllDone = totalSets > 0 && initialDoneCount === totalSets;

  // Cross-device state is seeded from Redis, with a local offline fallback.
  const [done, setDone] = useState(initialDone);
  const [skipped, setSkipped] = useState(serverLog?.skipped || {});
  const [skipUpdatedAt, setSkipUpdatedAt] = useState(serverLog?.skipUpdatedAt || {});
  const [lastContact, setLastContact] = useState(null);
  const [weights, setWeights] = useState(serverLog?.weights || {});
  const [repetitions, setRepetitions] = useState(serverLog?.repetitions || {});
  const [repsUpdatedAt, setRepsUpdatedAt] = useState(serverLog?.repsUpdatedAt || {});
  const [setUpdatedAt, setSetUpdatedAt] = useState(serverLog?.setUpdatedAt || {});
  const [weightUpdatedAt, setWeightUpdatedAt] = useState(serverLog?.weightUpdatedAt || {});
  const [serverRevision, setServerRevision] = useState(Number(serverLog?.revision) || 0);
  const [deviceId, setDeviceId] = useState('');
  const [lastActionAt, setLastActionAt] = useState(serverLog?.lastActionAt || null);
  const [restUntil, setRestUntil] = useState(serverLog?.restUntil || null);
  const [serverSavedAt, setServerSavedAt] = useState(serverLog?.savedAt || null);
  const initialBlock = firstIncompleteBlock(session, initialDone, serverLog?.skipped);
  const [activeBlock, setActiveBlock] = useState(initialBlock?.bi ?? (initialAllDone ? -1 : 0));
  const [focusMode, setFocusMode] = useState(true);
  const [workoutStarted, setWorkoutStarted] = useState(Boolean(serverLog?.startedAt || Object.values(initialDone).some(Boolean)));
  const [startedAt, setStartedAt] = useState(serverLog?.startedAt || null);
  const [finishReason, setFinishReason] = useState(serverLog?.finishReason || null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [selectedFinishReason, setSelectedFinishReason] = useState('');
  const [progressReady, setProgressReady] = useState(false);
  const [completedAt, setCompletedAt] = useState(serverLog?.completedAt || (initialAllDone ? serverLog?.savedAt || null : null));
  const [elapsedSeconds, setElapsedSeconds] = useState(Number(serverLog?.elapsedSeconds) || (initialAllDone ? dose.estimatedMinutes * 60 : 0));
  const [sessionRpe, setSessionRpe] = useState(null);
  const [syncStatus, setSyncStatus] = useState(serverLog?.savedAt ? 'saved' : 'local');
  const [progressRevision, setProgressRevision] = useState(0);
  const [restTimer, setRestTimer] = useState(() => serverLog?.restUntil ? { total: Math.max(1, restRemaining(serverLog.restUntil)), remaining: restRemaining(serverLog.restUntil), running: true, label: 'Отдых' } : null);
  const [undoSet, setUndoSet] = useState(null);
  const [coachCommands, setCoachCommands] = useState([]);
  const [commandAcknowledging, setCommandAcknowledging] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const blockRefs = useRef([]);

  const undoTimer = useRef(null);
  const activeCoachCommand = coachCommands[0] || null;
  const holdTimer = useHoldTimer(`gym:hold:${token}:${sessionDate}`);
  const wakeLock = usePlayerWakeLock(workoutStarted && !completedAt);
  const skippedCount = skippedSetCount(session, done, skipped);

  useEffect(() => {
    if (!token || !sessionDate) return undefined;
    let active = true;
    const loadCommands = async () => {
      try {
        const response = await fetch(`/api/player/commands?token=${encodeURIComponent(token)}&date=${encodeURIComponent(sessionDate)}`, { cache: 'no-store' });
        const body = await response.json();
        if (active && response.ok) { setCoachCommands(body.commands || []); setLastContact(Date.now()); }
        else if (active) setLastContact(null);
      } catch (_) { if (active) setLastContact(null); }
    };
    loadCommands();
    const timer = setInterval(loadCommands, 6000);
    return () => { active = false; clearInterval(timer); };
  }, [token, sessionDate]);

  async function acknowledgeCoachCommand(command) {
    if (!command || commandAcknowledging) return;
    setCommandAcknowledging(true);
    if (command.type === 'rest' && Number(command.payload?.seconds) > 0) {
      const seconds = Number(command.payload.seconds);
      setRestTimer({ total: seconds, remaining: seconds, running: true, notified: false, label: 'Изменение тренера' });
      setRestUntil(new Date(Date.now() + seconds * 1000).toISOString());
      setLastActionAt(new Date().toISOString());
      setProgressRevision(value => value + 1);
    }
    try {
      const response = await fetch('/api/player/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, date: sessionDate, commandId: command.id }),
      });
      if (response.ok) setCoachCommands(current => current.filter(item => item.id !== command.id));
    } catch (_) {}
    setCommandAcknowledging(false);
  }

  useEffect(() => {
    const fallback = crypto.randomUUID();
    try {
      const stored = localStorage.getItem('nk-player-device-id');
      const id = stored || fallback;
      if (!stored) localStorage.setItem('nk-player-device-id', id);
      setDeviceId(id);
    } catch (_) { setDeviceId(fallback); }
  }, []);

  // Merge offline edits with the server using per-set timestamps before writing locally.
  useEffect(() => {
    if (!token || !sessionDate) return;
    try {
      const local = JSON.parse(localStorage.getItem(`gym:${token}:${sessionDate}`) || 'null');
      const pending = JSON.parse(localStorage.getItem(`gym:pending:${token}:${sessionDate}`) || 'null');
      const merged = mergeWorkoutProgress(serverLog || {}, pending || local || {});
      setDone(merged.done); setWeights(merged.weights);
      setRepetitions(merged.repetitions || {}); setRepsUpdatedAt(merged.repsUpdatedAt || {});
      setSkipped(merged.skipped || {}); setSkipUpdatedAt(merged.skipUpdatedAt || {});
      setSetUpdatedAt(merged.setUpdatedAt); setWeightUpdatedAt(merged.weightUpdatedAt);
      setServerRevision(merged.revision);
      setStartedAt(merged.startedAt); setCompletedAt(merged.completedAt);
      setFinishReason(merged.finishReason || null);
      setLastActionAt(merged.lastActionAt); setElapsedSeconds(merged.elapsedSeconds);
      setWorkoutStarted(Boolean(merged.startedAt || Object.values(merged.done).some(Boolean)));
      setActiveBlock(firstIncompleteBlock(session, merged.done, merged.skipped)?.bi ?? -1);
      if (merged.completedAt) setFocusMode(false);
      setRestUntil(merged.restUntil);
      if (merged.restPausedSeconds > 0) setRestTimer({ total: merged.restPausedSeconds, remaining: merged.restPausedSeconds, running: false, label: 'Отдых · пауза' });
      if (merged.restUntil) setRestTimer({ total: Math.max(1, restRemaining(merged.restUntil)), remaining: restRemaining(merged.restUntil), running: true, label: 'Отдых' });
      if (local || pending) setProgressRevision(value => value + 1);
    } catch (_) {}
    setProgressReady(true);
  }, [token, sessionDate, serverLog, session]);

  const restPausedSeconds = restTimer && !restTimer.running ? restTimer.remaining : 0;
  const progressSnapshot = { skipped, skipUpdatedAt, restPausedSeconds, done, weights, repetitions, repsUpdatedAt, setUpdatedAt, weightUpdatedAt, startedAt, completedAt, finishReason, elapsedSeconds, activeBlock, restUntil, lastActionAt, clientRevision: serverRevision, clientId: deviceId, deviceLabel: typeof navigator === 'undefined' ? 'Устройство игрока' : `${navigator.platform || 'Mobile'} · ${navigator.standalone ? 'PWA' : 'Browser'}` };
  useEffect(() => {
    if (!progressReady || !token || !sessionDate) return;
    try { localStorage.setItem(`gym:${token}:${sessionDate}`, JSON.stringify(progressSnapshot)); }
    catch (_) { setSyncStatus('storage-error'); }
  }, [progressReady, done, weights, repetitions, repsUpdatedAt, skipped, skipUpdatedAt, setUpdatedAt, weightUpdatedAt, startedAt, completedAt, finishReason, elapsedSeconds, restUntil, restPausedSeconds, lastActionAt, token, sessionDate]);

  usePlayerProgressSync({ token, sessionDate, ready: progressReady, revision: progressRevision, snapshot: progressSnapshot,
    onStatus: setSyncStatus,
    onSaved: body => {
      setServerRevision(Number(body.revision) || 0); setServerSavedAt(body.savedAt);
      const merged = mergeWorkoutProgress(progressSnapshot, body);
      setDone(merged.done); setWeights(merged.weights);
      setRepetitions(merged.repetitions || {}); setRepsUpdatedAt(merged.repsUpdatedAt || {});
      setSkipped(merged.skipped || {}); setSkipUpdatedAt(merged.skipUpdatedAt || {});
      setSetUpdatedAt(merged.setUpdatedAt); setWeightUpdatedAt(merged.weightUpdatedAt);
    },
  });

  const [activeTab, setActiveTab] = useState('workout');
  const [selectedHistDate, setSelectedHistDate] = useState(null);
  const [histSession, setHistSession] = useState(null);
  const [histMeta, setHistMeta] = useState(null);
  const historyRequest = useRef(0);
  const [histError, setHistError] = useState('');
  const [histLoading, setHistLoading] = useState(false);

  const doneCount = Object.values(done).filter(Boolean).length;
  const pct = totalSets > 0 ? Math.round((doneCount / totalSets) * 100) : 0;
  const tonnage = useMemo(() => completedTonnage(session, done, weights, repetitions), [session, done, weights, repetitions]);

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
    if (!restTimer?.running || !restUntil) return undefined;
    const tick = () => setRestTimer(current => current ? { ...current, remaining: restRemaining(restUntil) } : null);
    tick();
    const timer = setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [restTimer?.running, restUntil]);

  useEffect(() => {
    if (restTimer?.remaining !== 0 || restTimer?.notified) return;
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    setRestTimer(current => current ? { ...current, running: false, notified: true } : null);
  }, [restTimer?.remaining, restTimer?.notified]);

  useEffect(() => {
    if (!progressReady || !workoutStarted || totalSets === 0 || doneCount + skippedCount !== totalSets || completedAt) return;
    const now = new Date();
    const start = startedAt ? new Date(startedAt) : now;
    const seconds = Math.max(1, Math.round((now.getTime() - start.getTime()) / 1000));
    setCompletedAt(now.toISOString());
    setFocusMode(false); setUndoSet(null);
    setLastActionAt(now.toISOString());
    setRestUntil(null);
    setElapsedSeconds(seconds);
    setProgressRevision(value => value + 1);
    setRestTimer(null);
    if (navigator.vibrate) navigator.vibrate([35, 60, 35, 60, 80]);
  }, [progressReady, workoutStarted, totalSets, doneCount, skippedCount, completedAt, startedAt]);

  const upcomingSet = completedAt ? null : nextWorkoutSet(session, done, skipped);
  useEffect(() => {
    const item = holdTimer.hold;
    if (item && (completedAt || done[item.key] || skipped[`${item.bi}-${item.ei}`] || !blocks[item.bi]?.exercises?.[item.ei]?.targetSets?.[item.si])) holdTimer.cancel();
  }, [completedAt, done, skipped, holdTimer.hold]);

  function changeRest(action) {
    if (!restTimer) return;
    const remaining = restTimer.running ? restRemaining(restUntil) : restTimer.remaining;
    const running = action === 'add' || (action === 'toggle' && !restTimer.running);
    const seconds = remaining + (action === 'add' ? 15 : 0);
    setRestTimer(action === 'skip' ? null : { ...restTimer, running, remaining: seconds, total: Math.max(restTimer.total, seconds), notified: false });
    setRestUntil(running && action !== 'skip' ? new Date(Date.now() + seconds * 1000).toISOString() : null);
    setLastActionAt(new Date().toISOString()); setProgressRevision(value => value + 1);
  }

  function finishEarly() {
    if (!FINISH_REASONS.includes(selectedFinishReason)) return;
    const now = new Date();
    setUndoSet(null);
    setFinishReason(selectedFinishReason); setCompletedAt(now.toISOString());
    setElapsedSeconds(Math.max(0, Math.round((now - new Date(startedAt || now)) / 1000)));
    setRestTimer(null); setRestUntil(null); setLastActionAt(now.toISOString());
    setFinishOpen(false); setFocusMode(false); setProgressRevision(value => value + 1);
  }

  useEffect(() => {
    if (window.location.hash === '#history') setActiveTab('history');
  }, []);

  async function loadHistSession(date) {
    const request = ++historyRequest.current;
    setHistLoading(true); setHistSession(null); setHistMeta(null); setHistError('');
    setSelectedHistDate(date);
    try {
      const r = await fetch(`/api/player/session-detail?token=${encodeURIComponent(token)}&date=${date}`);
      if (r.ok) {
        const d = await r.json();
        if (request !== historyRequest.current) return;
        setHistSession(d.session || null);
        setHistMeta({ label: d.label || 'Тренировка в зале', dayGoal: d.dayGoal || '', log: d.log, feedback: d.feedback, actual: d.actual });
      } else throw new Error('history unavailable');
    } catch (_) { if (request === historyRequest.current) setHistError('Не удалось загрузить программу. Попробуй ещё раз.'); }
    if (request === historyRequest.current) setHistLoading(false);
  }

  function startWorkout() {
    const now = new Date().toISOString();
    const first = firstIncompleteBlock(session, done, skipped);
    setWorkoutStarted(true);
    setStartedAt(current => current || now);
    setCompletedAt(null);
    setFinishReason(null);
    try { localStorage.removeItem(`gym:feedback:${token}:${sessionDate}`); } catch (_) {}
    setLastActionAt(now);
    setProgressRevision(value => value + 1);
    if (first) { setActiveBlock(first.bi); setFocusMode(true); }
    if (navigator.vibrate) navigator.vibrate(20);
  }

  function skipExercise(bi, ei, reason) {
    if (reason && !SKIP_REASONS.includes(reason)) return;
    const key = `${bi}-${ei}`;
    const next = { ...skipped, [key]: reason };
    setSkipped(next); setSkipUpdatedAt(current => ({ ...current, [key]: new Date().toISOString() }));
    setCompletedAt(null); setFinishReason(null); setUndoSet(null);
    holdTimer.cancel(); setRestTimer(null); setRestUntil(null);
    setActiveBlock(firstIncompleteBlock(session, done, next)?.bi ?? -1);
    setLastActionAt(new Date().toISOString()); setProgressRevision(value => value + 1);
  }

  function startHold(item) {
    if (holdTimer.hold || skipped[`${item.bi}-${item.ei}`]) return;
    setRestTimer(null); setRestUntil(null);
    setLastActionAt(new Date().toISOString()); setProgressRevision(value => value + 1);
    holdTimer.start(item);
  }

  function confirmHold() {
    const item = holdTimer.hold;
    if (!item || holdTimer.remaining > 0 || item.side !== item.sides) return;
    holdTimer.cancel();
    const block = blocks[item.bi], ex = block?.exercises?.[item.ei];
    if (ex && !done[item.key] && !skipped[`${item.bi}-${item.ei}`]) toggleSet(item.key, { ...item, block, ex });
  }

  function toggleSet(key, context) {
    if (holdTimer.hold?.key === key) holdTimer.cancel();
    const actionAt = new Date().toISOString();
    if (completedAt) { setCompletedAt(null); setFinishReason(null); }
    const wasDone = Boolean(done[key]);
    if (!wasDone) {
      const target = context.ex.targetSets?.[context.si];
      if (repetitionInput(target) && repetitions[key] == null) changeReps(key, String(repetitionInput(target).planned));
      if (weights[key] == null && plannedWeightValue(context.ex)) changeWeight(key, plannedWeightValue(context.ex));
    }
    setDone(prev => ({ ...prev, [key]: !prev[key] }));
    setSetUpdatedAt(prev => ({ ...prev, [key]: actionAt }));
    setLastActionAt(actionAt);
    setProgressRevision(value => value + 1);
    if (wasDone) {
      setRestTimer(null);
      setRestUntil(null);
      setCompletedAt(null);
      setUndoSet(null);
      setFocusMode(true);
      setActiveBlock(context.bi);
      return;
    }

    if (navigator.vibrate) navigator.vibrate(16);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoSet({ key, setNumber: context.si + 1, bi: context.bi });
    undoTimer.current = setTimeout(() => setUndoSet(null), 5200);

    const newDone = { ...done, [key]: true };
    const allFinished = totalSets > 0 && Object.values(newDone).filter(Boolean).length === totalSets;
    if (!allFinished) {
      const seconds = restSecondsFor(context.block, context.ex, { ...context, next: nextWorkoutSet(session, newDone, skipped) });
      setRestTimer({
        total: seconds,
        remaining: seconds,
        running: true,
        notified: false,
        label: context.block?.rest_note || `После ${context.ex?.code || 'подхода'}`,
      });
      setRestUntil(new Date(Date.now() + seconds * 1000).toISOString());
    }

    if (blockIsComplete(context.block, context.bi, newDone, skipped)) {
      const next = nextIncompleteBlock(session, context.bi, newDone, skipped);
      setTimeout(() => {
        setActiveBlock(next?.bi ?? -1);
        if (next) {
          blockRefs.current[next.bi]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 320);
    }
  }

  function undoLastSet() {
    if (!undoSet?.key) return;
    const actionAt = new Date().toISOString();
    setDone(prev => ({ ...prev, [undoSet.key]: false }));
    setSetUpdatedAt(prev => ({ ...prev, [undoSet.key]: actionAt }));
    setLastActionAt(actionAt);
    setCompletedAt(null);
    setProgressRevision(value => value + 1);
    setUndoSet(null);
    setRestTimer(null);
    setRestUntil(null);
    setFocusMode(true);
    if (Number.isInteger(undoSet.bi)) setActiveBlock(undoSet.bi);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function changeReps(key, value) {
    setRepetitions(prev => ({ ...prev, [key]: value }));
    const actionAt = new Date().toISOString();
    setRepsUpdatedAt(prev => ({ ...prev, [key]: actionAt }));
    setLastActionAt(actionAt); setProgressRevision(current => current + 1);
  }

  function changeWeight(key, value) {
    setWeights(prev => ({ ...prev, [key]: value }));
    const actionAt = new Date().toISOString();
    setWeightUpdatedAt(prev => ({ ...prev, [key]: actionAt }));
    setLastActionAt(actionAt);
    setProgressRevision(current => current + 1);
  }

  function scrollToBlock(idx) {
    setActiveBlock(idx);
    blockRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(registrations
          .filter(registration => registration.scope.includes('/player/'))
          .map(registration => registration.unregister())))
        .catch(() => {});
    } else {
      navigator.serviceWorker.register('/sw.js', { scope: '/player/' })
        .then(registration => registration.update())
        .catch(() => {});
    }
  }, []);

  // Track active block on scroll
  useEffect(() => {
    if (focusMode) return undefined;
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
  }, [blocks.length, focusMode]);

  return (
    <ErrorBoundary>
    <>
      <Head>
        <title>{player?.name ? `${player.name} · NK Coach` : 'NK Coach'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#050b12" />
        {/* PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta key="application-name" name="application-name" content="NK TEAM SYSTEM" />
        <meta key="apple-title" name="apple-mobile-web-app-title" content="NK TEAM SYSTEM" />
        <link key="manifest" rel="manifest" href={`/api/player-manifest/${token}`} />
        <link key="apple-icon" rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      </Head>

      {/* Branded ambient background */}
      <div className="player-ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="player-ambient-emerald absolute -top-20 -left-20 h-[380px] w-[380px] rounded-full bg-[#4ade80]/[0.09] blur-[100px]" />
        <div className="player-ambient-cyan absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-blue-600/[0.07] blur-[100px]" />
      </div>

      <div className={`app-shell player-page-shell gym-premium ${workoutStarted && !completedAt && !finishOpen && activeTab === 'workout' ? 'gym-active' : ''} min-h-screen bg-[#07101a] text-slate-100`}>
        {/* ── Athlete identity hero ── */}
        <header className="player-hero px-4 pb-4 pt-4">
          <div className="player-brand-row mb-5 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src="/nk-logo.jpg" alt="NK" className="player-brand-logo h-9 w-9 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <div className="player-brand-name truncate text-[10px] font-extrabold uppercase tracking-[0.18em] text-white">NK Performance</div>

              </div>
            </div>
            <div className="player-session-state shrink-0 text-right">
              {activeTab === 'workout' && session ? (
                <>
                  <div className={`player-status-pill ${isToday ? 'is-today' : 'is-latest'}`}>
                    <span />{isToday ? 'Сегодня' : isUpcoming ? 'Запланирована' : 'Последняя'}
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
              <img src={playerPhoto} alt={player?.name || 'Фото игрока'} className="player-avatar h-14 w-14 shrink-0 rounded-[18px] border border-white/[0.1] object-cover" />
            ) : (
              <div className="player-avatar flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-[#4ade80]/20 text-[14px] font-black text-[#4ade80]">
                {initials(player?.name)}
              </div>
            )}
            <div className="min-w-0">

              <h1 className="player-page-title text-white">{player?.name || 'Игрок'}</h1>
              {player?.position && (
                <div className="player-position mt-1.5 text-[11px] text-slate-500">{player.position}</div>
              )}
            </div>
          </div>
        </header>

        {activeCoachCommand && (
          <div className={`${activeCoachCommand.type === 'pause' || activeCoachCommand.type === 'stop_exercise' ? 'fixed inset-0 z-[70] flex items-center justify-center bg-[#03070d]/90 px-5 backdrop-blur-xl' : 'relative z-40 px-4 pb-3'}`} role="alertdialog" aria-live="assertive">
            <div className="w-full max-w-md overflow-hidden rounded-[24px] border border-amber-300/25 bg-gradient-to-br from-[#1b1d18] via-[#111a1c] to-[#0a131b] p-5 shadow-[0_28px_90px_-30px_rgba(251,191,36,0.5)]">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/70">Сообщение тренера · LIVE</div>
              <div className="mt-3 text-[20px] font-black leading-tight text-white">
                {activeCoachCommand.type === 'pause' ? 'Пауза тренировки' : activeCoachCommand.type === 'stop_exercise' ? 'Остановить упражнение' : activeCoachCommand.type === 'adjust_load' ? 'Изменить рабочий вес' : activeCoachCommand.type === 'replace_exercise' ? 'Замена упражнения' : activeCoachCommand.type === 'rest' ? 'Новое время отдыха' : 'Важно'}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{activeCoachCommand.message || (activeCoachCommand.type === 'rest' ? `Отдых ${activeCoachCommand.payload?.seconds || 0} секунд` : 'Обратись к тренеру перед продолжением.')}</p>
              {activeCoachCommand.payload?.percent && <div className="mt-3 inline-flex rounded-xl bg-amber-300/10 px-3 py-2 text-[12px] font-black text-amber-200">Вес {activeCoachCommand.payload.percent > 0 ? '+' : ''}{activeCoachCommand.payload.percent}%</div>}
              {activeCoachCommand.payload?.replacement && <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-2 text-[12px] font-bold text-cyan-100">Новое: {activeCoachCommand.payload.replacement}</div>}
              <button type="button" disabled={commandAcknowledging} onClick={() => acknowledgeCoachCommand(activeCoachCommand)} className="mt-5 min-h-12 w-full rounded-2xl bg-gradient-to-r from-amber-300 to-emerald-300 text-[12px] font-black text-[#11150c] disabled:opacity-50">{commandAcknowledging ? 'Сохраняю…' : activeCoachCommand.type === 'rest' ? 'Принять и запустить таймер' : 'Понятно, подтвердить'}</button>
            </div>
          </div>
        )}

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
              <SyncBadge status={syncStatus} savedAt={serverSavedAt} />
              <button className="player-focus-toggle" type="button" onClick={() => { setFocusMode(value => !value); if (!focusMode && upcomingSet) setActiveBlock(upcomingSet.bi); }} aria-pressed={focusMode}>
                {focusMode ? 'Все упражнения' : 'Текущее упражнение'}
              </button>
            </div>

            {blocks.length > 0 && (
            <div className="player-block-nav mt-3 flex gap-2 overflow-x-auto no-scrollbar">
              {blocks.map((block, bi) => {
                const blockTotal = (block.exercises || []).reduce((s, ex) => s + (ex.targetSets?.length || 0), 0);
                const blockDone = (block.exercises || []).reduce((s, ex, ei) =>
                  s + (ex.targetSets || []).filter((_, si) => done[`${bi}-${ei}-${si}`]).length, 0);
                const blockComplete = blockIsComplete(block, bi, done, skipped);
                return (
                  <button
                    key={bi}
                    type="button"
                    onClick={() => scrollToBlock(bi)}
                    aria-current={activeBlock === bi ? 'step' : undefined}
                    data-complete={blockComplete || undefined}
                    data-block-tone={bi % 6}
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
                aria-pressed={activeTab === tab}
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

        {!notFound && (!workoutStarted || completedAt || finishOpen) && <details className="gym-settings">
          <summary>Дата и настройки <span>{sessionDate ? formatDate(sessionDate) : 'Выбрать дату'}</span></summary>
          <div className="gym-settings-content">
            <label>Дата программы<select aria-label="Дата программы" value={sessionDate || ''} onChange={event => { if (event.target.value) window.location.assign(`/player/${encodeURIComponent(token)}?date=${event.target.value}`); }}><option value="">Выбери дату</option>{sessionDate && !sessionDates.includes(sessionDate) && <option value={sessionDate}>{sessionDate} · нет программы</option>}{sessionDates.map(date => <option key={date} value={date}>{formatDate(date)}</option>)}</select></label>
            <a href={`/player/${encodeURIComponent(token)}?date=${todayISO()}`}>Открыть сегодня</a>
            {session && wakeLock.supported && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={wakeLock.enabled} onChange={wakeLock.toggle} />Не гасить экран во время тренировки</label>}
            {wakeLock.status && <p role="status">{wakeLock.status}</p>}
          </div>
        </details>}
        {!notFound && session && (!workoutStarted || completedAt || finishOpen) && <OfflineProgram token={token} date={sessionDate} session={session} lastContact={lastContact} />}
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
              На выбранную дату программа пока не назначена.<br />
              Загляни позже или уточни у тренера.
            </p>
          </div>
        )}

        {/* ── Session content ── */}
        {!notFound && session && activeTab === 'workout' && (
          <main className={`player-workout-content space-y-6 px-3.5 pt-4 ${restTimer || holdTimer.hold ? 'pb-72' : 'pb-24'}`}>
            {!workoutStarted ? (
              <WorkoutIntro
                sessionLabel={sessionLabel}
                dayGoal={dayGoal}
                session={session}
                sessionDate={sessionDate}
                isToday={isToday}
                isUpcoming={isUpcoming}
                dose={dose}
                onStart={startWorkout}
                token={token}
                previousResults={previousResults}
              />
            ) : (
              <>
                {!isToday && !isUpcoming && (
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

                {(session.blocks || []).some(b => (b.exercises || []).some(ex => ex.autoReg?.startsWith('Новая или усиливающаяся боль'))) && <p className="gym-safety-line">При новой или усиливающейся боли, онемении либо слабости остановись и сообщи тренеру.</p>}
                {skippedCount > 0 && <p className="text-sm text-amber-200">Пропущено подходов: {skippedCount}. Они не засчитываются как выполненные.</p>}
                {!focusMode && upcomingSet && <div className="rounded-xl border border-emerald-400/25 p-4 text-slate-200" role="status">
                  Далее: <strong>{upcomingSet.exercise.code} · {playerExerciseName(upcomingSet.exercise)}</strong><br />
                  Подход {upcomingSet.si + 1} · {targetLabel(upcomingSet.target)}
                </div>}
                {blocks.map((block, bi) => {
                  const blockTotal = (block.exercises || []).reduce((sum, ex) => sum + (ex.targetSets?.length || 0), 0);
                  const blockDone = (block.exercises || []).reduce((sum, ex, ei) =>
                    sum + (ex.targetSets || []).filter((_, si) => done[`${bi}-${ei}-${si}`]).length, 0);
                  const blockComplete = blockIsComplete(block, bi, done, skipped);
                  const blockCollapsed = focusMode && bi !== activeBlock;
                  const focusedEi = focusExerciseIndex(block, bi, done, skipped);

                  return (
                    <div
                      key={bi}
                      ref={el => (blockRefs.current[bi] = el)}
                      className="player-block-section"
                      data-block-tone={bi % 6}
                      style={{ scrollMarginTop: '190px' }}
                    >
                      {blockCollapsed ? (
                        <button
                          type="button"
                          className={`player-block-compact ${blockComplete ? 'is-complete' : ''}`}
                          onClick={() => scrollToBlock(bi)}
                          aria-label={`Открыть блок ${block.label}`}
                        >
                          <span className="player-block-badge">{block.label}</span>
                          <span className="min-w-0 flex-1 text-left">
                            <strong>Блок {block.label}</strong>
                            <small>{blockComplete ? (blockDone === blockTotal ? 'Выполнен' : 'Закрыт с пропусками') : 'Ожидает'} · {blockDone}/{blockTotal} подходов</small>
                          </span>
                          <span className="player-block-compact-action" aria-hidden="true">{blockComplete ? '✓' : '→'}</span>
                        </button>
                      ) : (
                        <>
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
                              (!focusMode || isCircuit(block) || focusedEi < 0 || ei === focusedEi) && <ExCard
                                key={ei}
                                bi={bi}
                                ei={ei}
                                ex={ex}
                                block={block}
                                done={done}
                                skipReason={skipped[`${bi}-${ei}`]}
                                onSkip={skipExercise}
                                onHold={startHold}
                                previousResult={previousResults[performanceKey(ex)]}
                                onToggle={toggleSet}
                                weights={weights}
                                repetitions={repetitions}
                                onRepsChange={changeReps}
                                onWeightChange={changeWeight}
                                token={token}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {!completedAt && <div className="rounded-xl border border-white/10 p-4">
                  <button type="button" onClick={() => setFinishOpen(open => !open)} className="text-sm text-slate-300">Завершить раньше</button>
                  {finishOpen && <div className="mt-3 space-y-3">
                    <label className="block text-sm text-slate-300">Причина завершения
                      <select value={selectedFinishReason} onChange={event => setSelectedFinishReason(event.target.value)} className="mt-2 w-full rounded-xl bg-slate-800 p-3">
                        <option value="">Выбери причину</option>
                        {FINISH_REASONS.map(reason => <option key={reason}>{reason}</option>)}
                      </select>
                    </label>
                    <p className="text-sm text-slate-400">Сохранятся только выполненные подходы. {selectedFinishReason === 'Дискомфорт' ? 'Сообщи тренеру, какое упражнение пришлось остановить.' : ''}</p>
                    <button type="button" disabled={!selectedFinishReason} onClick={finishEarly} className="rounded-xl bg-emerald-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-40">Завершить и оценить нагрузку</button>
                  </div>}
                </div>}
                {completedAt && (
                  <div className="space-y-4">
                    {doneCount + skippedCount < totalSets && <button type="button" onClick={startWorkout} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-slate-300">Вернуться к выполнению</button>}
                    <details className="gym-result-details"><summary>Фактические результаты</summary>{blocks.map((block, bi) => (block.exercises || []).map((ex, ei) => <div key={`${bi}-${ei}`}><strong>{playerExerciseName(ex)}</strong><p>{(ex.targetSets || []).map((target, si) => { const key = `${bi}-${ei}-${si}`; return done[key] ? `${targetLabel(actualTarget(target, repetitions[key]))}${weights[key] != null && weights[key] !== '' ? ` · ${weights[key]} кг` : ''}` : 'Не выполнен'; }).join(' · ')}</p></div>))}</details>
                    <CompletionSummary skippedCount={skippedCount} finishReason={finishReason} totalSets={doneCount} elapsedSeconds={elapsedSeconds} tonnage={tonnage} rpe={sessionRpe} />
                    <FeedbackForm
                      key={completedAt}
                      finishReason={finishReason}
                      skipped={skipped}
                      lastActionAt={lastActionAt}
                      initialFeedback={serverFeedback}
                      token={token}
                      sessionDate={sessionDate}
                      session={session}
                      done={done}
                      weights={weights}
                      repetitions={repetitions}
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
                  <div className="mb-4 rounded-xl border border-white/10 p-4 text-sm text-slate-300">
                    {histMeta?.log || histMeta?.actual ? <>
                      <p>Выполнено подходов: {histMeta?.log ? Object.values(histMeta.log.done || {}).filter(Boolean).length : (histMeta.actual.exercises || []).reduce((sum, ex) => sum + (ex.completedSets || 0), 0)}</p>
                      {histMeta?.log?.elapsedSeconds > 0 && <p>Время: {formatWorkoutDuration(histMeta.log.elapsedSeconds)}</p>}
                      {(histMeta?.log?.finishReason || histMeta?.feedback?.finishReason) && <p>Завершена раньше: {histMeta.log?.finishReason || histMeta.feedback?.finishReason}</p>}
                      <p>RPE: {histMeta?.feedback?.rpe || 'Оценка не отправлена'}</p>
                      {histMeta?.feedback?.note && <p>Комментарий: {histMeta.feedback.note}</p>}
                    </> : 'Фактическое выполнение ещё не записано.'}
                  </div>
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
                              <span className="text-[15px] font-bold leading-snug text-white">{playerExerciseName(ex)}</span>
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
                                  {histMeta?.log?.repetitions?.[`${bi}-${ei}-${si}`] != null && <span className="mt-1 text-xs text-slate-200">Факт: {targetLabel(actualTarget(s, histMeta.log.repetitions[`${bi}-${ei}-${si}`]))}</span>}
                                  <span className="mt-2 text-[11px] text-emerald-300">{histMeta?.log?.done?.[`${bi}-${ei}-${si}`] || histMeta?.actual?.exercises?.find(item => item.name === ex.name && item.block === (block.label || ''))?.setActuals?.[si]?.completed ? '✓ Выполнен' : (histMeta?.log?.skipped?.[`${bi}-${ei}`] || histMeta?.feedback?.skipped?.[`${bi}-${ei}`] || histMeta?.actual?.skipped?.[`${bi}-${ei}`]) ? `Пропущен: ${histMeta?.log?.skipped?.[`${bi}-${ei}`] || histMeta?.feedback?.skipped?.[`${bi}-${ei}`] || histMeta?.actual?.skipped?.[`${bi}-${ei}`]}` : 'Не отмечен'}</span>
                                  {Number(String(histMeta?.log?.weights?.[`${bi}-${ei}-${si}`] || histMeta?.actual?.exercises?.find(item => item.name === ex.name && item.block === (block.label || ''))?.setActuals?.[si]?.kg || '').replace(',', '.')) > 0 && <span className="mt-1 text-[11px] text-slate-200">Факт: {histMeta?.log?.weights?.[`${bi}-${ei}-${si}`] || histMeta?.actual?.exercises?.find(item => item.name === ex.name && item.block === (block.label || ''))?.setActuals?.[si]?.kg} кг</span>}
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
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 text-sm"><p>{histError || 'Тренировка не найдена'}</p><button type="button" className="mt-3 p-3" onClick={() => loadHistSession(selectedHistDate)}>Повторить</button><button type="button" className="p-3" onClick={() => setSelectedHistDate(null)}>Все тренировки</button></div>
            )}
          </main>
        )}

        {workoutStarted && !finishOpen && activeTab === 'workout' && holdTimer.hold && <section className={`player-rest-timer player-hold-timer ${holdTimer.preparing ? 'is-preparing' : ''}`} role="timer" aria-live="off" aria-label="Таймер удержания">
          <TimerDial remaining={holdTimer.preparing ? holdTimer.preparationRemaining : holdTimer.remaining} total={holdTimer.preparing ? 5 : holdTimer.hold.seconds} />
          <div className="player-timer-copy">
            <div className="player-kicker">{holdTimer.preparing ? (holdTimer.hold.deadline ? 'Подготовка · положи телефон' : 'Подготовка · пауза') : holdTimer.remaining === 0 ? 'Удержание завершено' : holdTimer.hold.deadline ? 'Удержание' : 'Удержание · пауза'}</div>
            <div className="player-timer-next">{holdTimer.preparing && <span className="player-timer-preparation">Затем {holdTimer.hold.seconds} сек работы<br /></span>}{holdTimer.hold.name}{holdTimer.hold.sides === 2 ? ` · сторона ${holdTimer.hold.side} из 2` : ''}</div>
          </div>
          <div className="player-rest-actions">
            {holdTimer.remaining > 0 ? <button type="button" onClick={holdTimer.toggle}>{holdTimer.preparing ? (holdTimer.hold.deadline ? 'Пауза подготовки' : 'Продолжить подготовку') : holdTimer.hold.deadline ? 'Пауза удержания' : 'Продолжить удержание'}</button> : holdTimer.hold.side < holdTimer.hold.sides ? <button type="button" onClick={holdTimer.nextSide}>Начать другую сторону</button> : <button type="button" onClick={confirmHold}>Подтвердить выполненный подход</button>}
            <button type="button" onClick={holdTimer.cancel}>Отменить удержание</button>
          </div>
        </section>}
        {workoutStarted && !finishOpen && !holdTimer.hold && activeTab === 'workout' && (
          <RestTimer
            timer={restTimer ? { ...restTimer, label: upcomingSet ? `Далее ${playerExerciseName(upcomingSet.exercise)} · подход ${upcomingSet.si + 1} · ${targetLabel(upcomingSet.target)}${plannedWeightValue(upcomingSet.exercise) ? ` · ${plannedWeightLabel(upcomingSet.exercise)}` : ''}` : restTimer.label } : null}
            onToggle={() => changeRest('toggle')}
            onAdd={() => changeRest('add')}
            onSkip={() => changeRest('skip')}
            undo={undoSet}
            onUndo={undoLastSet}
          />
        )}
        <UndoSetToast undo={restTimer && !finishOpen ? null : undoSet} onUndo={undoLastSet} onDismiss={() => setUndoSet(null)} />

        {/* ── Footer ── */}
        <div className="player-footer fixed bottom-0 left-0 right-0 flex items-center justify-center border-t border-white/[0.05] bg-[#07101a]/95 py-2 backdrop-blur-xl">
          <span className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/[0.24]">
            <span className="h-1 w-1 rounded-full bg-emerald-400/70" />
            NK Performance
          </span>
          {session && <SyncBadge status={syncStatus} savedAt={serverSavedAt} />}
        </div>
      </div>

      <PlayerSplash visible={splashVisible} />
      <InstallHint />
    </>
    </ErrorBoundary>
  );
}

// Changing a selected date must create a separate state/queue for that workout.
export default function PlayerPageByDate(props) {
  return <PlayerPage key={`${props.token}:${props.sessionDate || 'empty'}`} {...props} />;
}
