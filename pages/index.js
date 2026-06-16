import { useEffect, useState } from 'react';

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

export default function Home() {
  const [apiKey, setApiKey] = useState('');
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

  useEffect(() => {
    const saved = localStorage.getItem('coachApiKey');
    if (saved) setApiKey(saved);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Заречье — AI-тренер (зал)</h1>
      <p style={{ color: '#666', marginTop: 0, marginBottom: 20 }}>
        Генерация тренировки на конкретный день — индивидуально под игрока, его состояние именно на эту дату,
        и под цель, которую ты сейчас задашь.
      </p>

      <label style={{ display: 'block', marginBottom: 16 }}>
        API-ключ (TRAINER_API_KEY)
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="Введите ключ"
          style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>

      {playersError && <p style={{ color: 'crimson', marginTop: -8, marginBottom: 16 }}>{playersError}</p>}

      <form onSubmit={handleGenerate}>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Игрок
          <select
            value={playerId}
            onChange={e => setPlayerId(e.target.value)}
            required
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
          >
            <option value="">— выбрать —</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.name}{p.position ? ` (${p.position})` : ''}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          Дата тренировки
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={e => setDate(e.target.value)}
            required
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          Цель именно этой тренировки
          <input
            type="text"
            value={dayGoal}
            onChange={e => setDayGoal(e.target.value)}
            placeholder="Например: верх тела + кор, восстановительная сессия, акцент на прыжок"
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          Фаза подготовки
          <select
            value={focus}
            onChange={e => setFocus(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
          >
            {FOCUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          Окно тренда для контекста (дней до даты тренировки)
          <input
            type="number"
            min={3}
            max={30}
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 16 }}>
          Комментарии тренера (необязательно)
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>

        <button
          type="submit"
          disabled={loading || !apiKey || !playerId}
          style={{ padding: '10px 20px', fontSize: 15, cursor: 'pointer' }}
        >
          {loading ? 'Генерация...' : 'Сгенерировать тренировку'}
        </button>
      </form>

      {error && <p style={{ color: 'crimson', marginTop: 16 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18 }}>Тренировка для {result.player?.name} — {result.date}</h2>
          <pre style={{
            whiteSpace: 'pre-wrap',
            background: '#f5f5f5',
            padding: 16,
            borderRadius: 8,
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}>
            {result.program}
          </pre>
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', color: '#666' }}>Исходные данные, на которых построена программа</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#444' }}>{result.dataSummary}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
