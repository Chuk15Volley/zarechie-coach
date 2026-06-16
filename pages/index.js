import { useEffect, useState } from 'react';

const FOCUS_OPTIONS = [
  { value: 'inseason', label: 'Игровой период (поддержание)' },
  { value: 'preseason', label: 'Межсезонье (наращивание)' },
  { value: 'power', label: 'Взрывная сила / прыжок' },
  { value: 'strength', label: 'Максимальная сила' },
  { value: 'rehab', label: 'Реабилитация / разгрузка' },
];

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [players, setPlayers] = useState([]);
  const [playerId, setPlayerId] = useState('');
  const [days, setDays] = useState(14);
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
    fetch('/api/players/list', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => {
        if (data.players) setPlayers(data.players);
      })
      .catch(() => {});
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
        body: JSON.stringify({ playerId, days, focus, notes }),
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
        Генерация программ силовой/кондиционной подготовки на основе данных WHOOP, опросников и нейротестов.
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
          Цель программы
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
          Период анализа данных (дней)
          <input
            type="number"
            min={3}
            max={60}
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 16 }}>
          Доп. указания тренера (необязательно)
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
          {loading ? 'Генерация...' : 'Сгенерировать программу'}
        </button>
      </form>

      {error && <p style={{ color: 'crimson', marginTop: 16 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18 }}>Программа для {result.player?.name}</h2>
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
