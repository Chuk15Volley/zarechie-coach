import { useEffect, useRef, useState } from 'react';

const PREFERENCE_KEY = 'player-timer-voice';
const MAX_CUE_DELAY_MS = 1500;
const RECORDINGS = {
  'Подготовься к подходу': 'prepare',
  'Начинай': 'start',
  'Удержание завершено': 'complete',
  'Начинай следующий подход': 'rest',
  'Голосовые подсказки включены': 'enabled',
};

// Speak only transitions observed in this mounted page. Restored/hidden timers
// must not announce an old start or completion when the athlete returns.
export function useTimerVoice({ hold, remaining, preparing, restTimer, restUntil, active }) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [message, setMessage] = useState('');
  const enabledRef = useRef(true);
  const alive = useRef(true);
  const previous = useRef(null);
  const utterance = useRef(null);
  const audio = useRef(null);
  const source = useRef(null);
  const generation = useRef(0);

  function stop() {
    generation.current++;
    if (source.current) {
      source.current.onended = null;
      try { source.current.stop(); source.current.disconnect(); } catch (_) {}
      source.current = null;
    }
    const current = utterance.current;
    utterance.current = null;
    if (current) {
      current.onend = null;
      current.onerror = null;
      window.speechSynthesis?.cancel();
    }
  }

  function fallback(text) {
    if (!enabledRef.current || document.visibilityState !== 'visible' ||
        !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    try {
      const synth = window.speechSynthesis;
      const cue = new window.SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      cue.voice = voices.find(v => /^ru(?:-|_)/i.test(v.lang) && v.localService) ||
        voices.find(v => /^ru(?:-|_)/i.test(v.lang)) || null;
      cue.lang = 'ru-RU';
      cue.rate = 1;
      cue.volume = 1;
      cue.onend = () => { if (utterance.current === cue) utterance.current = null; };
      cue.onerror = event => {
        if (utterance.current !== cue || !alive.current) return;
        utterance.current = null;
        if (!['interrupted', 'canceled'].includes(event.error)) setMessage('Голос недоступен. Нажми «Проверить звук» и проверь громкость устройства.');
      };
      utterance.current = cue; // Keep the utterance alive until the engine finishes.
      synth.speak(cue);
    } catch (_) {
      if (alive.current) setMessage('Голос недоступен. Нажми «Проверить звук» и проверь громкость устройства.');
    }
  }

  function speak(text) {
    if (!alive.current || !enabledRef.current || document.visibilityState !== 'visible') return;
    stop();
    const id = generation.current, requestedAt = Date.now(), engine = audio.current;
    const fresh = () => alive.current && enabledRef.current && generation.current === id &&
      document.visibilityState === 'visible' && Date.now() - requestedAt <= MAX_CUE_DELAY_MS;
    const play = () => {
      if (!fresh()) return;
      const buffer = engine?.buffers[RECORDINGS[text]];
      if (!buffer || engine.context.state !== 'running') { fallback(text); return; }
      try {
        const node = engine.context.createBufferSource();
        node.buffer = buffer;
        node.connect(engine.context.destination);
        node.onended = () => { node.disconnect(); if (source.current === node) source.current = null; };
        source.current = node;
        node.start();
      } catch (_) { if (fresh()) fallback(text); }
    };
    // Resume directly from the athlete's gesture so Safari unlocks audio.
    if (engine && engine.context.state !== 'running') {
      try { engine.context.resume().then(play, () => { if (fresh()) fallback(text); }); }
      catch (_) { if (fresh()) fallback(text); }
    } else play();
  }

  useEffect(() => {
    alive.current = true;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const controller = new AbortController();
    let engine;
    try {
      if (AudioContext) {
        engine = { context: new AudioContext(), buffers: {} };
        audio.current = engine;
        for (const name of Object.values(RECORDINGS)) {
          fetch(`/audio/timer-voice-v1/${name}.wav`, { signal: controller.signal })
            .then(response => { if (!response.ok) throw new Error('Audio unavailable'); return response.arrayBuffer(); })
            .then(bytes => engine.context.decodeAudioData(bytes))
            .then(buffer => { if (audio.current === engine) engine.buffers[name] = buffer; })
            .catch(() => {}); // Keep browser speech available if a clip cannot load.
        }
      }
    } catch (_) {}
    setSupported(Boolean(engine || (window.speechSynthesis && window.SpeechSynthesisUtterance)));
    try { enabledRef.current = localStorage.getItem(PREFERENCE_KEY) !== '0'; } catch (_) {}
    setEnabled(enabledRef.current);
    // Request the voice list early; speak() resolves it again when the user acts.
    window.speechSynthesis?.getVoices();
    const hidden = () => { if (document.visibilityState !== 'visible') stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      alive.current = false; stop(); controller.abort(); audio.current = null;
      engine?.context.close().catch(() => {});
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  useEffect(() => {
    const current = { key: hold ? `${hold.key}:${hold.side}` : null, remaining, preparing,
      restRemaining: restTimer?.remaining, restRunning: restTimer?.running, active };
    const prev = previous.current;
    previous.current = current;
    if (!active) { stop(); return; }
    if (!prev?.active) return;
    if (prev.key && !current.key) stop();
    const time = Date.now();
    if (current.key && prev.key === current.key && hold.deadline) {
      if (prev.preparing && !preparing && remaining > 0 && time - hold.preparationEndsAt <= MAX_CUE_DELAY_MS) speak('Начинай');
      else if (prev.remaining > 0 && remaining === 0 && time - hold.deadline <= MAX_CUE_DELAY_MS) speak('Удержание завершено');
    }
    if (!hold && prev.restRunning && prev.restRemaining > 0 && restTimer?.remaining === 0 && restUntil &&
        time - new Date(restUntil).getTime() <= MAX_CUE_DELAY_MS) speak('Начинай следующий подход');
  }, [hold, remaining, preparing, restTimer?.remaining, restTimer?.running, restUntil, active]);

  return {
    supported, enabled, message,
    prepare() { setMessage(''); speak('Подготовься к подходу'); },
    stop,
    test() { setMessage(''); speak('Голосовые подсказки включены'); },
    toggle() {
      const next = !enabledRef.current;
      enabledRef.current = next; setEnabled(next); setMessage('');
      try { localStorage.setItem(PREFERENCE_KEY, next ? '1' : '0'); } catch (_) {}
      if (next) speak('Голосовые подсказки включены'); else stop();
    },
  };
}
