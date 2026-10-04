import { useEffect, useState } from 'react';
import { PREHAB_ZONES, nextPrehabDate } from '../../lib/prehabReaction.mjs';
const stageLabels = { before:'До занятия', after:'После занятия', nextMorning:'Следующим утром' };
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Moscow' }).format(new Date());
export default function PrehabReaction({ token, date, completed = false, morningOnly = false }) {
  const [reaction, setReaction] = useState(null);
  const [stage, setStage] = useState(morningOnly ? 'nextMorning' : 'before');
  const [pain, setPain] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetch(`/api/player/prehab-reaction?token=${encodeURIComponent(token)}&date=${encodeURIComponent(date)}`, { cache:'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить оценку.');
        if (!cancelled) { setReaction(data.reaction); setLoaded(true); setMessage(''); }
      }).catch(error => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [token, date, retry]);
  useEffect(() => {
    const desired = morningOnly || today() >= nextPrehabDate(date) ? 'nextMorning' : completed ? 'after' : 'before';
    const next = reaction?.before ? desired : 'before';
    setStage(next);
    setPain(reaction?.[next]?.pain || {});
    setNote(reaction?.[next]?.note || '');
  }, [reaction, completed, morningOnly, date]);
  useEffect(() => { setMessage(''); setEditing(false); }, [stage]);
  async function save() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/player/prehab-reaction', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token,date,stage,pain,note}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить оценку.');
      setReaction(data.reaction); setEditing(false);
      setMessage(data.worsenedZones?.length ? 'Есть усиление боли. Сообщи тренеру; болезненную работу не продолжай. Оценка сохранена.' : 'Оценка сохранена и будет учтена в следующей программе.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  const saved = !!reaction?.[stage] && !editing;
  return <section className="mx-4 my-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4 text-slate-200" aria-label="Реакция после профилактики">
    <h2 className="font-bold">Профилактика — {stageLabels[stage]}</h2>
    <p className="mt-1 text-xs text-slate-400">Программа {date}. Оцени боль: 0 — нет, 10 — максимально сильная. Это контроль реакции, а не разрешение работать через боль.</p>
    {!loaded ? <button type="button" className="mt-3 rounded-lg border px-3 py-2" onClick={() => setRetry(value => value + 1)}>Повторить загрузку</button> : saved ? <>
      <p className="mt-3 text-sm">Оценка получена сервером.</p>
      <p className="mt-1 text-xs">{PREHAB_ZONES.map(zone => `${zone.label}: ${reaction[stage].pain[zone.key]}`).join(' · ')}</p>
      {stage !== 'before' && <button type="button" onClick={() => setEditing(true)} className="mt-2 rounded-lg border px-3 py-2 text-xs">Изменить оценку</button>}
      {stage === 'before' && !completed && today() === date && <p className="mt-2 text-xs text-slate-400">После завершения тренировки здесь появится оценка реакции. Следующим утром открой эту же ссылку.</p>}
    </> : <fieldset disabled={busy} className="mt-3 space-y-3">
      {stage === 'before' && today() > date && <p className="text-xs text-amber-300">Исходная оценка пропущена. Внеси её только если помнишь ощущения до занятия; она будет отмечена как внесённая позже.</p>}
      {PREHAB_ZONES.map(zone => <label key={zone.key} className="flex items-center justify-between gap-3 text-sm">
        <span>{zone.label}</span>
        <select aria-label={`Боль: ${zone.label}`} className="rounded-lg border border-white/20 bg-slate-900 p-2" value={pain[zone.key] ?? ''} onChange={event => setPain(values => ({...values,[zone.key]:event.target.value === '' ? '' : Number(event.target.value)}))}>
          <option value="">Выбрать</option>{Array.from({length:11},(_,i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </label>)}
      <label className="block text-sm">Комментарий<textarea value={note} maxLength={300} onChange={event => setNote(event.target.value)} className="mt-1 w-full rounded-lg border border-white/20 bg-slate-900 p-2" placeholder="Что изменилось, где возник дискомфорт" /></label>
      <button type="button" disabled={busy || PREHAB_ZONES.some(zone => pain[zone.key] === undefined || pain[zone.key] === '')} onClick={save} className="rounded-xl bg-cyan-200 px-4 py-3 font-bold text-slate-950 disabled:opacity-40">{busy ? 'Сохранение…' : 'Сохранить оценку'}</button>
    </fieldset>}
    {message && <p role="status" className="mt-3 text-sm text-cyan-200">{message}</p>}
  </section>;
}
