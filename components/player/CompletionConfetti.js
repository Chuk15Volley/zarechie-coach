import { useEffect, useRef } from 'react';
import { CONFETTI_DURATION_MS, createConfetti, confettiFrame } from '../../lib/completionConfetti.mjs';

export default function CompletionConfetti({ celebration }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!celebration || !canvas) return undefined;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches || document.hidden) { canvas.hidden = true; return undefined; }
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const width = window.innerWidth, height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.scale(ratio, ratio);
    canvas.hidden = false;
    const papers = createConfetti(width, height);
    let frame, stopped = false;
    const start = performance.now();
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      context.clearRect(0, 0, width, height);
      canvas.hidden = true;
    };
    const draw = now => {
      if (stopped) return;
      const elapsed = now - start;
      if (elapsed >= CONFETTI_DURATION_MS) { stop(); return; }
      context.clearRect(0, 0, width, height);
      for (const paper of papers) {
        const pose = confettiFrame(paper, elapsed, height);
        if (!pose) continue;
        context.save();
        context.globalAlpha = pose.opacity;
        context.translate(pose.x, pose.y);
        context.rotate(pose.angle);
        context.scale(pose.scale, 1);
        context.fillStyle = paper.color;
        context.fillRect(-paper.width / 2, -paper.height / 2, paper.width, paper.height);
        // A darker reverse face gives the fluttering pieces depth without shadows.
        if (pose.shade) {
          context.fillStyle = 'rgba(0,0,0,0.22)';
          context.fillRect(-paper.width / 2, -paper.height / 2, paper.width, paper.height);
        }
        context.restore();
      }
      frame = requestAnimationFrame(draw);
    };
    const visibility = () => { if (document.hidden) stop(); };
    const preference = () => { if (motion.matches) stop(); };
    frame = requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', preference);
    window.addEventListener('resize', stop, { once: true });
    return () => {
      stop();
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', preference);
      window.removeEventListener('resize', stop);
    };
  }, [celebration]);
  return celebration ? <canvas ref={canvasRef} aria-hidden="true" data-completion-confetti=""
    style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100 }} /> : null;
}
