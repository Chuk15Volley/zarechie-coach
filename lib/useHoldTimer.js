import { useEffect, useState } from 'react';

const PREPARATION_MS = 5000;

function clockState(hold, now) {
  if (!hold) return { preparationMs: 0, workMs: 0 };
  if (!hold.deadline) return {
    preparationMs: Math.max(0, hold.preparationRemainingMs || 0),
    workMs: Math.max(0, hold.remainingMs ?? hold.remaining * 1000),
  };
  return {
    preparationMs: Math.max(0, (hold.preparationEndsAt || 0) - now),
    workMs: Math.max(0, Math.min(hold.seconds * 1000, hold.deadline - now)),
  };
}

function startSide(item, side, now) {
  return { ...item, side, preparationEndsAt: now + PREPARATION_MS,
    preparationRemainingMs: PREPARATION_MS, deadline: now + PREPARATION_MS + item.seconds * 1000,
    remaining: item.seconds, remainingMs: item.seconds * 1000 };
}

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
  const clock = clockState(hold, now);
  const remaining = Math.ceil(clock.workMs / 1000);
  const preparing = clock.preparationMs > 0;
  return {
    hold, remaining, preparing, preparationRemaining: Math.ceil(clock.preparationMs / 1000),
    start(item) { const time = Date.now(); setNow(time); setHold(startSide(item, 1, time)); },
    toggle() {
      const time = Date.now(); setNow(time);
      setHold(current => {
        if (!current) return null;
        const value = clockState(current, time);
        return { ...current, remaining: Math.ceil(value.workMs / 1000), remainingMs: value.workMs,
          preparationRemainingMs: value.preparationMs,
          preparationEndsAt: current.deadline ? null : time + value.preparationMs,
          deadline: current.deadline ? null : time + value.preparationMs + value.workMs };
      });
    },
    nextSide() {
      const time = Date.now(); setNow(time);
      setHold(current => {
        const value = clockState(current, time);
        return current && current.side < current.sides && value.workMs === 0 && value.preparationMs === 0
          ? startSide(current, current.side + 1, time) : current;
      });
    },
    cancel() { setHold(null); },
  };
}
