import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
  Target,
  Layers,
  TrendingUp,
  MessageSquare,
  Loader2,
  ChevronDown,
  Dumbbell,
} from 'lucide-react';

const FOCUS_OPTIONS = [
  { value: 'inseason', label: 'Игровой период (поддержание)' },
  { value: 'preseason', label: 'Межсезонье (наращивание)' },
  { value: 'power', label: 'Взрывная сила / прыжок' },
  { value: 'strength', label: 'Максимальная сила' },
  { value: 'rehab', label: 'Реабилитация / разгрузка' },
];

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function fieldLabel(icon, text) {
  return (
    <span className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
      {icon}
      {text}
    </span>
  );
}

const inputClass =
  'block w-full rounded-xl border border-surface-border bg-surface-raised px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20';

const selectClass = `${inputClass} appearance-none pr-9`;

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [keyPanelOpen, setKeyPanelOpen] = useState(true);
  const [players, setPlayers] = useState([]);
  const [playersError, setPlayersError] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [dayGoal, setDayGoal] = useState('');
  const [days, setDays] = useState(7);
  const [focus, setFocus] = useState('inseason');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('coachApiKey');
    if (saved) {
      setApiKey(saved);
      setKeyPanelOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    localStorage.setItem('coachApiKey', apiKey);
    setPlayersError('');
    fetch('/api/players/list', { headers: { 'x-api-key': apiKey } })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Ошибка загрузки списка игроков (${r.status})`);
        setPlayers(data.players || []);
      })
      .catch(err => {
        setPlayers([]);
        setPlayersError(err.message);
      });
  }, [apiKey]);

  const keyConnected = apiKey && !playersError;

  async function handleGenerate(e) {
    e.preventDefault();
    if (!playerId) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/programs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, date, dayGoal, days, focus, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации');
      setResult(data);
      setShowSummary(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        {/* Top bar */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent shadow-glow">
              <Dumbbell size={18} strokeWidth={2.25} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide text-slate-50">ЗАРЕЧЬЕ</div>
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                AI S&amp;C Coach
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setKeyPanelOpen(o => !o)}
            className="flex items-center gap-2 rounded-full border border-surface-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accent/40"
          >
            {keyConnected ? (
              <CheckCircle2 size={14} className="text-emerald-400" />
            ) : (
              <KeyRound size={14} className="text-slate-400" />
            )}
            {keyConnected ? 'Подключено' : 'API-ключ'}
          </button>
        </div>

        {keyPanelOpen && (
          <div className="mb-6 rounded-2xl border border-surface-border bg-surface-card p-4 shadow-card">
            {fieldLabel(<KeyRound size={13} />, 'API-ключ (TRAINER_API_KEY)')}
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Введите ключ"
              className={inputClass}
            />
            {playersError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
                <AlertTriangle size={13} /> {playersError}
              </p>
            )}
          </div>
        )}

        <p className="mb-6 text-sm leading-relaxed text-slate-400">
          Генерация тренировки на конкретный день — индивидуально под игрока, его состояние именно на
          эту дату, и под цель, которую ты сейчас задашь.
        </p>

        {/* Form card */}
        <form
          onSubmit={handleGenerate}
          className="space-y-5 rounded-2xl border border-surface-border bg-surface-card p-5 shadow-card sm:p-6"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              {fieldLabel(<Target size={13} />, 'Игрок')}
              <div className="relative">
                <select
                  value={playerId}
                  onChange={e => setPlayerId(e.target.value)}
                  required
                  className={selectClass}
                >
                  <option value="">— выбрать —</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.position ? ` (${p.position})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
            </label>

            <label className="block">
              {fieldLabel(<CalendarDays size={13} />, 'Дата тренировки')}
              <input
                type="date"
                value={date}
                max={todayISO()}
                onChange={e => setDate(e.target.value)}
                required
                className={inputClass}
              />
            </label>
          </div>

          <label className="block">
            {fieldLabel(<Target size={13} />, 'Цель именно этой тренировки')}
            <input
              type="text"
              value={dayGoal}
              onChange={e => setDayGoal(e.target.value)}
              placeholder="Например: верх тела + кор, восстановительная сессия, акцент на прыжок"
              className={inputClass}
            />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              {fieldLabel(<Layers size={13} />, 'Фаза подготовки')}
              <div className="relative">
                <select value={focus} onChange={e => setFocus(e.target.value)} className={selectClass}>
                  {FOCUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
            </label>

            <label className="block">
              {fieldLabel(<TrendingUp size={13} />, 'Окно тренда (дней до даты)')}
              <input
                type="number"
                min={3}
                max={30}
                value={days}
                onChange={e => setDays(Number(e.target.value))}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block">
            {fieldLabel(<MessageSquare size={13} />, 'Комментарии тренера (необязательно)')}
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </label>

          <button
            type="submit"
            disabled={loading || !apiKey || !playerId}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-surface transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Генерация...
              </>
            ) : (
              <>
                <Dumbbell size={16} /> Сгенерировать тренировку
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {loading && !result && (
          <div className="mt-6 animate-pulse space-y-3 rounded-2xl border border-surface-border bg-surface-card p-6 shadow-card">
            <div className="h-4 w-1/3 rounded bg-surface-raised" />
            <div className="h-3 w-full rounded bg-surface-raised" />
            <div className="h-3 w-5/6 rounded bg-surface-raised" />
            <div className="h-3 w-2/3 rounded bg-surface-raised" />
          </div>
        )}

        {result && (
          <div className="mt-6 rounded-2xl border border-surface-border bg-surface-card p-5 shadow-card sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-50">Тренировка</h2>
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                {result.player?.name}
              </span>
              <span className="rounded-full bg-surface-raised px-2.5 py-1 text-xs font-medium text-slate-400">
                {result.date}
              </span>
            </div>

            <div className="prose-session text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.program}</ReactMarkdown>
            </div>

            <button
              type="button"
              onClick={() => setShowSummary(s => !s)}
              className="mt-4 flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-300"
            >
              <ChevronDown size={14} className={`transition-transform ${showSummary ? 'rotate-180' : ''}`} />
              Исходные данные, на которых построена тренировка
            </button>
            {showSummary && (
              <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-surface-border bg-surface-raised p-4 text-xs leading-relaxed text-slate-400">
                {result.dataSummary}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
