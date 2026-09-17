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
  return <section className="gym-offline" aria-label="Доступность программы">
    <div className="flex items-center justify-between gap-3">
      <span role="status" className={cache?.ready ? 'text-emerald-200' : 'text-slate-300'}>{busy ? 'Подготовка…' : cache?.ready ? '✓ Программа доступна без интернета' : 'Доступ без интернета'}</span>
      {!cache?.ready && <button type="button" disabled={!online || busy} onClick={() => check(true)} className="shrink-0 rounded-lg border border-white/20 px-3 py-2 font-semibold disabled:opacity-40">{busy ? '…' : 'Подготовить'}</button>}
    </div>
    {!online && <p className="mt-2 text-amber-200">Нет сети. Новые изменения тренера пока не проверены.</p>}
    {cache?.changed && <p className="mt-2 text-amber-200">Тренер обновил программу. Обнови страницу и сохрани её для зала.</p>}
    {cache?.savedAt && <details className="mt-1"><summary>Подробнее</summary><p>Сохранена {new Date(cache.savedAt).toLocaleString('ru-RU')}. Видео требует подключения к интернету.</p></details>}
  </section>;
}
