// pages/library.js — /library: browse the accumulated exercise library.
// Same dark Tailwind theme as index.js. Reuses the trainer apiKey from localStorage.

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { findExerciseUrl } from '../lib/exerciseBank';

// Card thumbnail — fetches its own image bytes with the auth header → object URL.
function LibraryCard({ card, apiKey, onDelete, onRename }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!card.hasImage || !apiKey) { setImgUrl(null); return; }
    let cancelled = false;
    let objectUrl = null;
    fetch(`/api/exercises/manual-image?name=${encodeURIComponent(card.title)}&serve=1`, {
      headers: { 'x-api-key': apiKey },
    })
      .then(r => (r.ok ? r.blob() : null))
      .then(blob => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setImgUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [card.hasImage, card.title, apiKey]);

  // Video sources, in priority order:
  //   1. card.video      — stored in ex:lib (trainer's manual link or previously persisted)
  //   2. card.autoVideo  — server resolved from yt-manual/yt cache by canonicalId
  //   3. static bank     — findExerciseUrl, no network
  //   4. ytSearchUrl     — client-side youtube-search (name mismatch fallback; saves to ex:lib)
  const bankUrl = card.title?.trim() ? findExerciseUrl(card.title) : null;
  const [ytSearchUrl, setYtSearchUrl] = useState(null);

  useEffect(() => {
    const base = card.video || card.autoVideo || bankUrl;
    if (base || !card.title?.trim() || !apiKey) return;
    let cancelled = false;
    fetch(`/api/exercises/youtube-search?name=${encodeURIComponent(card.title)}`, {
      headers: { 'x-api-key': apiKey },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data?.url && data.url !== 'none') setYtSearchUrl(data.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.video, card.autoVideo, card.title, apiKey]);

  const resolvedVideoUrl = card.video || card.autoVideo || bankUrl || ytSearchUrl || null;

  const handleDelete = async () => {
    if (!confirm(`Удалить "${card.title}" из библиотеки?`)) return;
    setDeleting(true);
    try {
      await onDelete(card.canonicalId);
    } finally {
      setDeleting(false);
    }
  };

  const handleRename = async () => {
    const clean = titleDraft.trim();
    if (!clean || clean === card.title) { setEditingTitle(false); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/exercises/rename', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ canonicalId: card.canonicalId, newTitle: clean }),
      });
      if (r.ok) { onRename(card.canonicalId, clean); setEditingTitle(false); }
    } finally {
      setSaving(false);
    }
  };

  const ytId = resolvedVideoUrl && extractYtId(resolvedVideoUrl);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] shadow-card">
      <div className="relative aspect-square w-full overflow-hidden bg-white/[0.02]">
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt={card.title} className="h-full w-full object-contain" />
        ) : card.hasImage ? (
          <div className="flex h-full w-full items-center justify-center text-[11px] text-slate-600">Загрузка…</div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-700">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
        {ytId && (
          <a
            href={`https://www.youtube.com/watch?v=${ytId}`}
            target="_blank"
            rel="noreferrer"
            title="Открыть видео на YouTube"
            className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-red-600/90 px-2 py-1 text-[10px] font-bold text-white shadow-lg backdrop-blur-sm transition hover:bg-red-500"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" /></svg>
            YT
          </a>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {editingTitle ? (
          <div className="flex items-start gap-1">
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingTitle(false); }}
              className="min-w-0 flex-1 rounded-lg border border-accent/40 bg-white/[0.05] px-2 py-1 text-[11px] font-semibold text-slate-100 outline-none"
            />
            <button
              type="button"
              onClick={handleRename}
              disabled={saving}
              className="rounded-lg bg-accent/20 px-2 py-1 text-[10px] font-bold text-accent transition hover:bg-accent/30 disabled:opacity-40"
            >
              {saving ? '…' : '✓'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setTitleDraft(card.title || ''); setEditingTitle(true); }}
            className="text-left text-[12px] font-semibold leading-snug text-slate-200 hover:text-accent transition"
            title="Нажми чтобы переименовать"
          >
            {card.title}
          </button>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-600">
            {card.hasImage && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">фото</span>}
            {ytId && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-400">видео</span>}
            {!card.hasImage && !ytId && <span className="text-slate-700">пусто</span>}
          </span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-400 transition hover:bg-rose-500/20 disabled:opacity-40"
          >
            {deleting ? '…' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function extractYtId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export default function LibraryPage() {
  const [apiKey, setApiKey] = useState('');
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // AI rename state
  const [aiRenaming, setAiRenaming] = useState(false);
  const [aiRenameResult, setAiRenameResult] = useState(null);

  // Dedupe modal state
  const [dedupeOpen, setDedupeOpen] = useState(false);
  const [dedupeLoading, setDedupeLoading] = useState(false);
  const [dedupeGroups, setDedupeGroups] = useState([]);
  const [mergingIdx, setMergingIdx] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('coachApiKey');
    if (saved) setApiKey(saved);
    else setLoading(false);
  }, []);

  const load = useCallback(() => {
    if (!apiKey) return;
    setLoading(true);
    setError('');
    fetch('/api/exercises/library', { headers: { 'x-api-key': apiKey } })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Ошибка (${r.status})`);
        setCards(Array.isArray(data.cards) ? data.cards : []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiKey]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    await fetch(`/api/exercises/library?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-api-key': apiKey },
    }).catch(() => {});
    setCards(prev => prev.filter(c => c.canonicalId !== id));
  };

  const handleRename = (canonicalId, newTitle) => {
    setCards(prev => prev.map(c => c.canonicalId === canonicalId ? { ...c, title: newTitle } : c));
  };

  const handleAiRename = async () => {
    if (!apiKey || aiRenaming) return;
    setAiRenaming(true);
    setAiRenameResult(null);
    setError('');
    try {
      const r = await fetch('/api/exercises/ai-rename-bulk', {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Ошибка (${r.status})`);
      // Apply renames to local state
      if (Array.isArray(data.renames)) {
        const map = {};
        data.renames.forEach(({ canonicalId, newTitle }) => { map[canonicalId] = newTitle; });
        setCards(prev => prev.map(c => map[c.canonicalId] ? { ...c, title: map[c.canonicalId] } : c));
        setAiRenameResult(data.renames.length);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setAiRenaming(false);
    }
  };

  // ── Dedupe ───────────────────────────────────────────────────────────────────
  const openDedupe = async () => {
    if (!apiKey) return;
    setDedupeOpen(true);
    setDedupeLoading(true);
    setDedupeGroups([]);
    try {
      const r = await fetch('/api/exercises/dedupe', { headers: { 'x-api-key': apiKey } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Ошибка (${r.status})`);
      setDedupeGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch (e) {
      setError(e.message);
      setDedupeOpen(false);
    } finally {
      setDedupeLoading(false);
    }
  };

  // Merge every other card in a group into the first one, then drop the group.
  const mergeGroup = async (group, idx) => {
    const targetId = group.cards[0].canonicalId;
    setMergingIdx(idx);
    try {
      for (const c of group.cards.slice(1)) {
        await fetch('/api/exercises/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ action: 'merge', sourceId: c.canonicalId, targetId }),
        }).catch(() => {});
      }
      setDedupeGroups(prev => prev.filter((_, i) => i !== idx));
      load();
    } finally {
      setMergingIdx(null);
    }
  };

  return (
    <>
      <Head><title>Библиотека упражнений</title></Head>
      <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link href="/" className="text-[12px] font-semibold text-slate-500 transition hover:text-accent">
                ← Назад
              </Link>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Библиотека упражнений</h1>
              <p className="mt-1 text-[12px] text-slate-500">
                Всего упражнений в базе: <span className="font-semibold text-accent">{cards.length}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAiRename}
                disabled={!apiKey || aiRenaming}
                className="rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-2 text-[12px] font-semibold text-accent transition hover:border-accent/50 hover:bg-accent/[0.14] disabled:opacity-40"
                title="Перевести все русские названия в профессиональный английский S&C"
              >
                {aiRenaming ? 'Перевожу…' : 'AI → English'}
              </button>
              {aiRenameResult !== null && (
                <span className="text-[11px] text-slate-500">
                  Переименовано: <span className="font-semibold text-accent">{aiRenameResult}</span>
                </span>
              )}
              <button
                type="button"
                onClick={openDedupe}
                disabled={!apiKey}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] font-semibold text-slate-300 transition hover:border-white/[0.16] hover:text-white disabled:opacity-40"
              >
                Найти дубли
              </button>
              <button
                type="button"
                onClick={load}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[12px] font-semibold text-slate-300 transition hover:border-white/[0.16] hover:text-white"
              >
                Обновить
              </button>
            </div>
          </div>

          {!apiKey && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center text-[13px] text-slate-500">
              Не найден API-ключ. Открой <Link href="/" className="text-accent hover:underline">главную страницу</Link> и подключи ключ тренера.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.08] px-4 py-3 text-[12px] text-rose-400">
              {error}
            </div>
          )}

          {apiKey && loading && (
            <div className="py-16 text-center text-[13px] text-slate-600">Загрузка библиотеки…</div>
          )}

          {apiKey && !loading && !error && cards.length === 0 && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-10 text-center text-[13px] text-slate-500">
              Библиотека пуста. Добавляй фото и видео упражнений на главной странице — они появятся здесь.
            </div>
          )}

          {apiKey && cards.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
              {cards.map(card => (
                <LibraryCard key={card.canonicalId} card={card} apiKey={apiKey} onDelete={handleDelete} onRename={handleRename} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dedupe modal */}
      {dedupeOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tight text-white">Возможные дубли</h2>
              <button
                type="button"
                onClick={() => setDedupeOpen(false)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] font-semibold text-slate-300 transition hover:text-white"
              >
                Закрыть
              </button>
            </div>

            {dedupeLoading && (
              <div className="py-16 text-center text-[13px] text-slate-500">Анализ библиотеки…</div>
            )}

            {!dedupeLoading && dedupeGroups.length === 0 && (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center text-[13px] text-slate-500">
                Дубли не найдены.
              </div>
            )}

            <div className="space-y-3">
              {dedupeGroups.map((group, idx) => (
                <div key={idx} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="mb-3 space-y-1.5">
                    {group.cards.map(c => (
                      <div key={c.canonicalId} className="flex items-center gap-2 text-[12px] text-slate-300">
                        <span className="line-clamp-1" title={c.title}>{c.title}</span>
                        {c.hasImage && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">фото</span>}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => mergeGroup(group, idx)}
                    disabled={mergingIdx === idx}
                    className="rounded-lg bg-accent/15 px-3 py-1.5 text-[11px] font-semibold text-accent transition hover:bg-accent/25 disabled:opacity-40"
                  >
                    {mergingIdx === idx ? 'Слияние…' : 'Слить → оставить первую'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
