import { useEffect, useRef, useState } from 'react';

export function usePlayerFeedback({ token, date, draft, restore, payload, initialFeedback, onSubmitted }) {
  const key = `gym:feedback:${token}:${date}`;
  const [ready, setReady] = useState(false);
  const [queued, setQueued] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const current = useRef({ draft, payload, restore, onSubmitted });
  current.current = { draft, payload, restore, onSubmitted };
  const pending = useRef(null);
  const busy = useRef(false);
  const sendRef = useRef(async () => {});
  const draftText = JSON.stringify(draft);
  const signature = value => JSON.stringify([value?.done, value?.weights, value?.finishReason]);
  const payloadSignature = signature(payload);
  const previousSignature = useRef(payloadSignature);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved?.draft) current.current.restore(saved.draft);
      if (saved?.pending && signature(saved.pending) === signature(current.current.payload)) { pending.current = saved.pending; setQueued(true); }
      if (saved?.submitted && signature(saved.payload) === signature(current.current.payload)) setSubmitted(true);
      else if (initialFeedback && !saved?.pending && !saved?.draft) {
        current.current.restore({ ...initialFeedback, speedFeel: initialFeedback.primerFeedback?.speed, legFeel: initialFeedback.primerFeedback?.legs, shoulderFeel: initialFeedback.primerFeedback?.shoulder });
        setSubmitted(true);
      }
    } catch (_) { setMessage('Локальное сохранение недоступно. Не закрывай страницу до отправки.'); }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready || previousSignature.current === payloadSignature) return;
    previousSignature.current = payloadSignature;
    pending.current = null; setQueued(false); setSubmitted(false);
    setMessage('Выполнение изменилось. Отправь обновлённую оценку.');
  }, [ready, payloadSignature]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(key, JSON.stringify({ draft: current.current.draft, pending: pending.current, submitted, payload: current.current.payload })); }
    catch (_) { setMessage('Локальное сохранение недоступно. Не закрывай страницу до отправки.'); }
  }, [ready, draftText, payloadSignature, queued, submitted, key]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    sendRef.current = async () => {
      if (!alive || busy.current || !pending.current) return;
      if (!navigator.onLine) { setMessage('Без сети. Оценка ожидает отправки.'); return; }
      busy.current = true; setSending(true);
      const sent = pending.current;
      try {
        const response = await fetch('/api/player/feedback', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sent), signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500) {
            pending.current = null; setQueued(false);
            throw new Error('Проверь заполнение оценки и актуальность ссылки. Затем повтори отправку.');
          }
          throw new Error('Сервер недоступен. Повторим отправку автоматически.');
        }
        if (!alive || signature(sent) !== signature(current.current.payload)) return;
        pending.current = null; setQueued(false); setSubmitted(true); setMessage('Получено сервером');
        try { localStorage.setItem(key, JSON.stringify({ submitted: true, draft: current.current.draft, payload: current.current.payload })); } catch (_) {}
        current.current.onSubmitted?.();
      } catch (error) { if (alive) setMessage(error.message || 'Не удалось отправить. Повторим автоматически.'); }
      finally { busy.current = false; if (alive) setSending(false); }
    };
    const retry = () => sendRef.current();
    retry();
    const timer = setInterval(retry, 15000);
    window.addEventListener('online', retry); window.addEventListener('focus', retry);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('online', retry); window.removeEventListener('focus', retry); };
  }, [ready, key]);

  function submit() {
    if (!ready || busy.current) return;
    pending.current = current.current.payload; setQueued(true); setMessage('Ожидает отправки');
    try { localStorage.setItem(key, JSON.stringify({ draft: current.current.draft, pending: pending.current })); }
    catch (_) { setMessage('Не закрывай страницу: локальное сохранение недоступно.'); }
    sendRef.current();
  }
  function edit() { pending.current = null; setQueued(false); setSubmitted(false); setMessage(''); }
  return { ready, queued, sending, submitted, message, submit, edit };
}
