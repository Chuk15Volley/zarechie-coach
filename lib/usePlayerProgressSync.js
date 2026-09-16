import { useEffect, useRef } from 'react';

// A single sender drains the latest snapshot. An older response must never
// remove a newer queued change made while the request was in flight.
export function usePlayerProgressSync({ token, sessionDate, ready, revision, snapshot, onSaved, onStatus }) {
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const callbacks = useRef({ onSaved, onStatus });
  callbacks.current = { onSaved, onStatus };
  const queue = useRef(null);
  const busy = useRef(false);
  const flush = useRef(async () => {});
  const key = `gym:pending:${token}:${sessionDate}`;

  useEffect(() => {
    if (!ready || !token || !sessionDate) return;
    let alive = true;
    try { queue.current = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) {}
    flush.current = async () => {
      if (!alive || busy.current || !queue.current) return;
      if (!navigator.onLine) { callbacks.current.onStatus('offline'); return; }
      busy.current = true;
      const payload = queue.current;
      callbacks.current.onStatus('syncing');
      try {
        const response = await fetch('/api/player/log', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('sync failed');
        const body = await response.json();
        if (!alive) return;
        callbacks.current.onSaved(body);
        if (queue.current?.requestId === payload.requestId) {
          queue.current = null;
          try {
            const stored = JSON.parse(localStorage.getItem(key) || 'null');
            if (stored?.requestId === payload.requestId) localStorage.removeItem(key);
          } catch (_) {}
          callbacks.current.onStatus('saved');
        }
      } catch (_) {
        if (alive) callbacks.current.onStatus(navigator.onLine ? 'error' : 'offline');
      } finally { busy.current = false; }
      if (alive && queue.current && queue.current.requestId !== payload.requestId) flush.current();
    };
    const retry = () => flush.current();
    const offline = () => callbacks.current.onStatus('offline');
    retry();
    const interval = setInterval(retry, 15000);
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    window.addEventListener('offline', offline);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
      window.removeEventListener('offline', offline);
    };
  }, [ready, token, sessionDate, key]);

  useEffect(() => {
    if (!ready || !revision || !token || !sessionDate) return;
    const payload = { ...latest.current, token, date: sessionDate, requestId: crypto.randomUUID() };
    queue.current = payload;
    try { localStorage.setItem(key, JSON.stringify(payload)); }
    catch (_) { callbacks.current.onStatus('storage-error'); }
    const timer = setTimeout(() => flush.current(), 500);
    return () => clearTimeout(timer);
  }, [ready, revision, token, sessionDate, key]);
}
