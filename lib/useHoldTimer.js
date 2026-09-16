import { useEffect, useState } from 'react';

export function useHoldTimer(storageKey) {
  const [hold, setHold] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (stored && /^\d+-\d+-\d+$/.test(stored.key) && stored.seconds > 0 && stored.seconds <= 600 && [1, 2].includes(stored.sides) && stored.side >= 1 && stored.side <= stored.sides) setHold(stored);
    } catch (_) {}
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    try { if (hold) localStorage.setItem(storageKey, JSON.stringify(hold)); else localStorage.removeItem(storageKey); } catch (_) {}
  }, [hold, ready, storageKey]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!hold?.deadline) return;
    const tick = () => setNow(Date.now());
    tick(); const timer = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [hold?.deadline]);
  const remaining = hold ? (hold.deadline ? Math.max(0, Math.ceil((hold.deadline - now) / 1000)) : hold.remaining) : 0;
  return {
    hold, remaining,
    start(item) { setNow(Date.now()); setHold({ ...item, side: 1, deadline: Date.now() + item.seconds * 1000, remaining: item.seconds }); },
    toggle() { setHold(current => current ? { ...current, deadline: current.deadline ? null : Date.now() + current.remaining * 1000, remaining: current.deadline ? Math.max(0, Math.ceil((current.deadline - Date.now()) / 1000)) : current.remaining } : null); setNow(Date.now()); },
    nextSide() { setNow(Date.now()); setHold(current => current && current.side < current.sides && (current.deadline ? current.deadline <= Date.now() : current.remaining === 0) ? { ...current, side: current.side + 1, deadline: Date.now() + current.seconds * 1000, remaining: current.seconds } : current); },
    cancel() { setHold(null); },
  };
}
