import { useEffect, useState } from 'react';

export function usePlayerWakeLock(active) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    setSupported(Boolean(navigator.wakeLock?.request));
    try { setEnabled(localStorage.getItem('player-keep-awake') === '1'); } catch (_) {}
  }, []);
  useEffect(() => {
    if (!supported || !enabled || !active) { setStatus(''); return; }
    let alive = true, lock = null, acquiring = false;
    const acquire = async () => {
      if (!alive || document.visibilityState !== 'visible' || lock || acquiring) return;
      acquiring = true;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (!alive) { await acquired.release(); return; }
        lock = acquired; setStatus('Экран остаётся включённым');
        acquired.addEventListener('release', () => { lock = null; if (alive) setStatus('Удержание экрана приостановлено системой'); });
      } catch (_) { if (alive) setStatus('Браузер не разрешил удержание экрана'); }
      finally { acquiring = false; }
    };
    acquire(); document.addEventListener('visibilitychange', acquire);
    return () => { alive = false; document.removeEventListener('visibilitychange', acquire); lock?.release().catch(() => {}); };
  }, [supported, enabled, active]);
  return { supported, enabled, status, toggle() { const next = !enabled; setEnabled(next); try { localStorage.setItem('player-keep-awake', next ? '1' : '0'); } catch (_) {} } };
}
