import { useEffect, useRef, useState } from 'react';

const PREFERENCE_KEY = 'player-timer-voice';
const MAX_CUE_DELAY_MS = 1500;

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

  function stop() {
    const current = utterance.current;
    utterance.current = null;
    if (current) {
      current.onend = null;
      current.onerror = null;
      window.speechSynthesis?.cancel();
    }
  }

  function speak(text) {
    if (!enabledRef.current || document.visibilityState !== 'visible' ||
        !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    stop();
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

  useEffect(() => {
    alive.current = true;
    setSupported(Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance));
    try { enabledRef.current = localStorage.getItem(PREFERENCE_KEY) !== '0'; } catch (_) {}
    setEnabled(enabledRef.current);
    // Request the voice list early; speak() resolves it again when the user acts.
    window.speechSynthesis?.getVoices();
    const hidden = () => { if (document.visibilityState !== 'visible') stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { alive.current = false; stop(); document.removeEventListener('visibilitychange', hidden); };
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
      if (prev.preparing && !preparing && remaining > 0 && time - hold.preparationEndsAt <= MAX_CUE_DELAY_MS) speak('Начали');
      else if (prev.remaining > 0 && remaining === 0 && time - hold.deadline <= MAX_CUE_DELAY_MS) speak('Завершено');
    }
    if (!hold && prev.restRunning && prev.restRemaining > 0 && restTimer?.remaining === 0 && restUntil &&
        time - new Date(restUntil).getTime() <= MAX_CUE_DELAY_MS) speak('Отдых завершён');
  }, [hold, remaining, preparing, restTimer?.remaining, restTimer?.running, restUntil, active]);

  return {
    supported, enabled, message,
    prepare() { setMessage(''); speak('Приготовиться'); },
    stop,
    test() { setMessage(''); speak('Звуковые команды включены'); },
    toggle() {
      const next = !enabledRef.current;
      enabledRef.current = next; setEnabled(next); setMessage('');
      try { localStorage.setItem(PREFERENCE_KEY, next ? '1' : '0'); } catch (_) {}
      if (next) speak('Звуковые команды включены'); else stop();
    },
  };
}
