import { useEffect, useState } from 'react';

export default function OfflineProgram({ token, date, session, lastContact }) {
  const [online, setOnline] = useState(true);
  const [cache, setCache] = useState(null);
  const [busy, setBusy] = useState(false);
  async function check(prepare = false) {
    if (!navigator.serviceWorker?.controller) { setCache({ ready: false }); return; }
    setBusy(true);
    try {
      const result = await new Promise(resolve => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => { channel.port1.close(); resolve({ ready: false }); }, 20000);
        channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data); };
        navigator.serviceWorker.controller.postMessage({
          type: prepare ? 'PREPARE_PLAYER_CACHE' : 'CHECK_PLAYER_CACHE', url: window.location.href,
          expected: { token, date, session: JSON.stringify(session) },
          assets: [...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(el => el.src || el.href),
        }, [channel.port2]);
      });
      setCache(result);
    } catch (_) { setCache({ ready: false }); }
    setBusy(false);
  }
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); check(); };
    update();
    window.addEventListener('online', update); window.addEventListener('offline', update);
    navigator.serviceWorker?.addEventListener('controllerchange', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); navigator.serviceWorker?.removeEventListener('controllerchange', update); };
  }, [token, date]);
  return <section className="mx-3.5 mt-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400" aria-label="Доступность программы">
    <p role="status">{busy ? 'Проверяю сохранённую копию…' : cache?.ready ? 'Программа доступна без сети' : 'Программа ещё не подготовлена для работы без сети'}</p>
    {cache?.savedAt && <p className="mt-1">Копия от {new Date(cache.savedAt).toLocaleString('ru-RU')}</p>}
    {(!online || !lastContact) && <p className="mt-1 text-amber-200">Новые изменения тренера пока не проверены. При отсутствии сети используется сохранённая программа.</p>}
    {cache?.changed && <p className="mt-1 text-amber-200">Программа на сервере изменилась. Обнови страницу перед сохранением копии.</p>}
    {!cache?.ready && <button type="button" disabled={!online || busy} onClick={() => check(true)} className="mt-2 rounded-lg border border-white/15 px-3 py-2 font-semibold text-slate-200 disabled:opacity-40">Сохранить для зала</button>}
  </section>;
}
