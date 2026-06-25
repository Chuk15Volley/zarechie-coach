// pages/player/[id].js
// Individual player training page — shared link, read-only, mobile-first.
// SSR: fetches today's saved session from Redis server-side (no client secrets exposed).

import { useState, useEffect, useRef, Component } from 'react';
import Head from 'next/head';
import { redis } from '../../lib/redis';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
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

  // Resolve token → playerId (never expose playerId to the client)
  const playerId = await redis('get', `coach:share_token:${token}`).catch(() => null);
  if (!playerId) {
    return { props: { token, session: null, player: null, sessionDate: null, dayGoal: '', isToday: false, notFound: true, sessionDates: [], playerPhoto: null } };
  }

  const [allDates, playerPhoto] = await Promise.all([
    redis('zrange', `coach:sessions:${playerId}`, 0, -1).catch(() => []),
    redis('get', `player:photo:${playerId}`).catch(() => null),
  ]);
  const sessionDates = [...(allDates || [])].reverse();

  let record = null;
  const rawToday = await redis('get', `coach:session:${playerId}:${date}`).catch(() => null);

  if (rawToday) {
    try { record = typeof rawToday === 'string' ? JSON.parse(rawToday) : rawToday; } catch (_) {}
  }

  if (!record) {
    const dates = await redis('zrange', `coach:sessions:${playerId}`, -1, -1).catch(() => []);
    if (dates?.length) {
      const rawLast = await redis('get', `coach:session:${playerId}:${dates[0]}`).catch(() => null);
      if (rawLast) { try { record = typeof rawLast === 'string' ? JSON.parse(rawLast) : rawLast; } catch (_) {} }
    }
  }

  if (!record) {
    return { props: { token, session: null, player: null, sessionDate: null, dayGoal: '', isToday: false, notFound: false, sessionDates, playerPhoto: playerPhoto || null } };
  }

  return {
    props: {
      token,
      session: record.session || null,
      player: record.player || null,
      sessionDate: record.date || date,
      dayGoal: record.dayGoal || '',
      isToday: (record.date || '') === date,
      notFound: false,
      sessionDates,
      playerPhoto: playerPhoto || null,
    },
  };
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Set button — tappable, turns green when done, shows weight input ──────────
function SetBtn({ label, value, done, onToggle, weight, onWeightChange }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex min-w-[58px] flex-col items-center rounded-2xl border px-3 py-2.5 transition-all duration-200 active:scale-95 ${
        done
          ? 'border-emerald-500/50 bg-emerald-500/[0.18] shadow-[0_0_12px_rgba(52,211,153,0.15)]'
          : 'border-white/[0.10] bg-white/[0.04]'
      }`}
    >
      <span className={`text-[10px] font-bold mb-0.5 ${done ? 'text-emerald-400' : 'text-slate-600'}`}>
        {done ? '✓' : label}
      </span>
      <span className={`text-sm font-black leading-none ${done ? 'text-emerald-300' : 'text-slate-200'}`}>
        {value}
      </span>
      {done && (
        <input
          type="text"
          inputMode="decimal"
          value={weight || ''}
          onChange={e => onWeightChange(e.target.value)}
          onClick={e => e.stopPropagation()}
          placeholder="кг"
          className="mt-1.5 w-full rounded-lg border border-emerald-500/20 bg-black/20 px-1 py-0.5 text-center text-[10px] text-emerald-200 placeholder-emerald-800 outline-none focus:border-emerald-500/40"
          maxLength={6}
        />
      )}
    </button>
  );
}

// ── Exercise illustration — token-authenticated, with 429 retry ──────────────
function ExerciseImage({ name, imgPrompt, token }) {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let cancelled = false;
    let retryTimer = null;

    function attempt(retryCount = 0) {
      if (cancelled) return;
      fetch('/api/exercises/image-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, token, ...(imgPrompt ? { img_prompt: imgPrompt } : {}) }),
      })
        .then(async r => {
          if (cancelled) return;
          if (r.status === 429 && retryCount < 4) {
            const delay = 15000 + Math.random() * 30000;
            retryTimer = setTimeout(() => attempt(retryCount + 1), delay);
            return;
          }
          if (!r.ok) { setLoading(false); return; }
          const d = await r.json().catch(() => ({}));
          if (!cancelled && d.image) { setImage(d.image); setLoading(false); }
        })
        .catch(() => { if (!cancelled) setLoading(false); });
    }

    attempt();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [name, token]);

  if (loading) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-white/[0.02]">
        <div className="h-5 w-5 rounded-full border-2 border-[#4ade80]/20 border-t-[#4ade80]/60 animate-spin" />
      </div>
    );
  }
  if (!image) return null;
  return (
    <div className="flex aspect-[4/3] items-center justify-center bg-white overflow-hidden">
      <img src={image} alt={name} className="h-full w-full object-contain" />
    </div>
  );
}

// ── Single exercise card ──────────────────────────────────────────────────────
function ExCard({ bi, ei, ex, done, onToggle, weights, onWeightChange, token }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
      {/* Header */}
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-[#4ade80]/[0.14] to-transparent px-4 py-3">
        <span className="shrink-0 rounded-lg bg-[#4ade80]/20 px-2 py-1 text-[11px] font-black text-[#4ade80]">
          {ex.code}
        </span>
        {ex.tempo && (
          <span className="shrink-0 rounded-lg border border-blue-500/25 bg-blue-500/[0.10] px-2 py-0.5 text-[10px] font-bold text-blue-400">
            {ex.tempo}
          </span>
        )}
        <span className="text-[15px] font-bold leading-snug text-white">{ex.name}</span>
      </div>

      {/* Illustration */}
      <ExerciseImage name={ex.name} imgPrompt={ex.img_prompt} token={token} />

      {/* Sets row */}
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        {(ex.targetSets || []).map((s, si) => {
          const key = `${bi}-${ei}-${si}`;
          return (
            <SetBtn
              key={si}
              label={`${si + 1}`}
              value={s}
              done={!!done[key]}
              onToggle={() => onToggle(key)}
              weight={weights?.[key] || ''}
              onWeightChange={val => onWeightChange(key, val)}
            />
          );
        })}
      </div>

      {/* Details */}
      <div className="space-y-2 px-4 pb-4 pt-3">
        {ex.weightNote && (
          <div className="text-[15px] font-semibold text-slate-200">{ex.weightNote}</div>
        )}
        {ex.autoReg && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5">
            <span className="text-base leading-none text-amber-400">⚡</span>
            <span className="text-[13px] leading-snug text-amber-300/90">{ex.autoReg}</span>
          </div>
        )}
        {ex.cue && (
          <p className="text-[13px] leading-snug text-slate-400">{ex.cue}</p>
        )}
      </div>
    </div>
  );
}

// ── Workout feedback form ─────────────────────────────────────────────────────
const FEEL_OPTIONS = [
  { value: 'easy',      emoji: '💪', label: 'Легко' },
  { value: 'good',      emoji: '😊', label: 'Хорошо' },
  { value: 'hard',      emoji: '😓', label: 'Тяжело' },
  { value: 'very_hard', emoji: '🤕', label: 'Очень тяжело' },
];

function FeedbackForm({ token, sessionDate }) {
  const [rpe, setRpe] = useState(null);
  const [feel, setFeel] = useState(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!rpe || sending) return;
    setSending(true);
    try {
      await fetch('/api/player/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, date: sessionDate, rpe, feel, note }),
      });
      setSubmitted(true);
    } catch (_) {}
    setSending(false);
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.09] px-4 py-8 text-center">
        <div className="mb-2 text-3xl">💪</div>
        <div className="text-base font-black text-emerald-300">Тренировка завершена!</div>
        <div className="mt-2 text-sm text-emerald-600">Оценка отправлена тренеру</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.09] px-4 py-5 text-center">
        <div className="mb-1 text-3xl">💪</div>
        <div className="text-base font-black text-emerald-300">Тренировка завершена!</div>
        <div className="mt-0.5 text-xs text-emerald-600">Оцени нагрузку для тренера</div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4 space-y-4">
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
                onClick={() => setRpe(n)}
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

        {/* Feel */}
        <div>
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
        </div>

        {/* Note */}
        <div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Комментарий тренеру (необязательно)..."
            maxLength={300}
            rows={2}
            className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-slate-200 placeholder-slate-600 outline-none focus:border-[#4ade80]/30"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!rpe || sending}
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
    <div className="fixed bottom-5 inset-x-4 z-50 animate-fade-in">
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

// ── Main component ────────────────────────────────────────────────────────────
export default function PlayerPage({ token, session, player, sessionDate, dayGoal, isToday, notFound, sessionDates, playerPhoto }) {
  const [done, setDone] = useState({});
  const [weights, setWeights] = useState({});
  const [activeBlock, setActiveBlock] = useState(0);
  const blockRefs = useRef([]);

  // Load progress from localStorage on mount
  useEffect(() => {
    if (!token || !sessionDate) return;
    try {
      const saved = localStorage.getItem(`gym:${token}:${sessionDate}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.done) setDone(parsed.done);
        if (parsed.weights) setWeights(parsed.weights);
      }
    } catch (_) {}
  }, [token, sessionDate]);

  // Persist progress to localStorage on every change
  useEffect(() => {
    if (!token || !sessionDate) return;
    try {
      localStorage.setItem(`gym:${token}:${sessionDate}`, JSON.stringify({ done, weights }));
    } catch (_) {}
  }, [done, weights, token, sessionDate]);

  const [activeTab, setActiveTab] = useState('workout');
  const [selectedHistDate, setSelectedHistDate] = useState(null);
  const [histSession, setHistSession] = useState(null);
  const [histLoading, setHistLoading] = useState(false);

  const blocks = Array.isArray(session?.blocks) ? session.blocks : [];
  const totalSets = blocks.flatMap(b => b.exercises || []).reduce((s, ex) => s + (ex.targetSets?.length || 0), 0);
  const doneCount = Object.values(done).filter(Boolean).length;
  const pct = totalSets > 0 ? Math.round((doneCount / totalSets) * 100) : 0;

  async function loadHistSession(date) {
    setHistLoading(true);
    setSelectedHistDate(date);
    try {
      const r = await fetch(`/api/player/session-detail?token=${encodeURIComponent(token)}&date=${date}`);
      if (r.ok) { const d = await r.json(); setHistSession(d.session || null); }
    } catch (_) {}
    setHistLoading(false);
  }

  function toggleSet(key) {
    setDone(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function changeWeight(key, value) {
    setWeights(prev => ({ ...prev, [key]: value }));
  }

  function scrollToBlock(idx) {
    setActiveBlock(idx);
    blockRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/player/' }).catch(() => {});
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
        <meta name="theme-color" content="#07101a" />
        {/* PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={player?.name || 'Тренировка'} />
        <link rel="manifest" href={`/api/player-manifest/${token}`} />
        <link rel="apple-touch-icon" href="/nk-logo.jpg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/nk-logo.jpg" />
      </Head>

      {/* Ambient bg */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-20 -left-20 h-[380px] w-[380px] rounded-full bg-[#4ade80]/[0.09] blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-blue-600/[0.07] blur-[100px]" />
      </div>

      <div className="min-h-screen bg-[#07101a] text-slate-100">

        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#07101a]/95 backdrop-blur-xl">
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Player avatar */}
                {playerPhoto ? (
                  <img src={playerPhoto} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover border border-white/[0.1]" />
                ) : (
                  <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-[#4ade80]/20 text-[12px] font-black text-[#4ade80]">
                    {initials(player?.name)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.22em] text-[#4ade80]/60 mb-0.5">
                    Nikolay Korenchuk · High Performance Coach
                  </div>
                  <div className="text-xl font-black leading-none text-white truncate">{player?.name || 'Игрок'}</div>
                  {player?.position && (
                    <div className="mt-0.5 text-[11px] text-slate-500">{player.position}</div>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                {activeTab === 'workout' ? (
                  <>
                    <div className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {isToday ? '● Сегодня' : '● Последняя'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5" suppressHydrationWarning>{formatDate(sessionDate)}</div>
                  </>
                ) : selectedHistDate ? (
                  <div className="text-[10px] text-slate-500">{selectedHistDate}</div>
                ) : (
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">● История</div>
                )}
              </div>
            </div>

            {/* Progress bar — workout tab only */}
            {totalSets > 0 && activeTab === 'workout' && (
              <div className="mt-3">
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-slate-600">Подходы</span>
                  <span className="text-[10px] font-semibold text-slate-400">{doneCount}/{totalSets} · {pct}%</span>
                </div>
                <div className="h-[3px] w-full rounded-full bg-white/[0.06]">
                  <div
                    className="h-[3px] rounded-full bg-[#4ade80] transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Block nav — workout tab only */}
          {blocks.length > 0 && activeTab === 'workout' && (
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 no-scrollbar">
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
                    className={`shrink-0 rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
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

        {/* ── Tab bar ── */}
        {!notFound && sessionDates.length > 0 && (
          <div className="flex gap-1.5 border-b border-white/[0.05] px-4 py-2">
            {[['workout', 'Тренировка'], ['history', `История (${sessionDates.length})`]].map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === 'history') { setSelectedHistDate(null); setHistSession(null); }
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
          </div>
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
          <div className="px-4 pb-24 pt-4 space-y-6">

            {/* Goal */}
            {dayGoal && (
              <div className="rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/[0.05] px-4 py-3.5">
                <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4ade80]/50">
                  Цель тренировки
                </div>
                <div className="text-[14px] font-semibold text-slate-200">{dayGoal}</div>
              </div>
            )}

            {/* Blocks */}
            {blocks.map((block, bi) => (
              <div
                key={bi}
                ref={el => (blockRefs.current[bi] = el)}
                style={{ scrollMarginTop: '180px' }}
              >
                {/* Block header */}
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4ade80] text-sm font-black text-[#060a0e]">
                    {block.label}
                  </span>
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                    Блок {block.label}
                  </div>
                </div>

                {/* Exercises */}
                <div className="space-y-3">
                  {(block.exercises || []).map((ex, ei) => (
                    <ExCard
                      key={ei}
                      bi={bi}
                      ei={ei}
                      ex={ex}
                      done={done}
                      onToggle={toggleSet}
                      weights={weights}
                      onWeightChange={changeWeight}
                      token={token}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Completion banner + feedback */}
            {totalSets > 0 && doneCount === totalSets && (
              <FeedbackForm token={token} sessionDate={sessionDate} />
            )}
          </div>
        )}

        {/* ── History tab ── */}
        {!notFound && activeTab === 'history' && (
          <div className="px-4 pb-24 pt-4">
            {!selectedHistDate ? (
              <div className="space-y-2">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">Все тренировки</p>
                {sessionDates.map(date => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => loadHistSession(date)}
                    className="w-full flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-left transition hover:bg-white/[0.05] active:scale-[0.98]"
                  >
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-slate-200">{formatDate(date)}</div>
                      <div className="text-[11px] text-slate-600 mt-0.5">{date}</div>
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
                  onClick={() => { setSelectedHistDate(null); setHistSession(null); }}
                  className="mb-4 flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-300 transition"
                >
                  ← Все тренировки
                </button>
                <div className="space-y-6">
                  {(histSession.blocks?.[0]?.goal || histSession.goal || histSession.day_goal) && (
                    <div className="rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/[0.05] px-4 py-3.5">
                      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#4ade80]/50">Цель тренировки</div>
                      <div className="text-[14px] font-semibold text-slate-200">{histSession.blocks?.[0]?.goal || histSession.goal || histSession.day_goal}</div>
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
                          <div key={ei} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                            <div className="flex items-center gap-2.5 bg-gradient-to-r from-[#4ade80]/[0.10] to-transparent px-4 py-3">
                              <span className="shrink-0 rounded-lg bg-[#4ade80]/20 px-2 py-1 text-[11px] font-black text-[#4ade80]">{ex.code}</span>
                              {ex.tempo && <span className="shrink-0 rounded-lg border border-blue-500/25 bg-blue-500/[0.10] px-2 py-0.5 text-[10px] font-bold text-blue-400">{ex.tempo}</span>}
                              <span className="text-[15px] font-bold leading-snug text-white">{ex.name}</span>
                            </div>
                            <div className="px-4 py-3 flex flex-wrap gap-2">
                              {(ex.targetSets || []).map((s, si) => (
                                <div key={si} className="flex min-w-[58px] flex-col items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                                  <span className="text-[10px] font-bold mb-0.5 text-slate-600">{si + 1}</span>
                                  <span className="text-sm font-black leading-none text-slate-400">{s}</span>
                                </div>
                              ))}
                            </div>
                            {ex.coaching_note && (
                              <div className="px-4 pb-3 text-[12px] leading-relaxed text-slate-500">{ex.coaching_note}</div>
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
          </div>
        )}

        {/* ── Footer ── */}
        <div className="fixed bottom-0 left-0 right-0 flex items-center justify-center py-3 bg-[#07101a]/80 backdrop-blur-xl border-t border-white/[0.05]">
          <span className="text-[10px] text-white/[0.15] font-medium tracking-wide">Periodyx · AI Performance Coach</span>
        </div>
      </div>

      <InstallHint />
    </>
    </ErrorBoundary>
  );
}
