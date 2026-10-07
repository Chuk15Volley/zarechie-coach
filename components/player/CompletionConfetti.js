import { useEffect, useRef } from 'react';
import styles from './CompletionConfetti.module.css';
import { CONFETTI_DURATION_MS, createConfetti, confettiFrame, createFireworks, fireworkFrame } from '../../lib/completionConfetti.mjs';

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
    const foils = new Map();
    const papers = createConfetti(width, height);
    for (const paper of papers) {
      if (foils.has(paper.color)) continue;
      const foil = context.createLinearGradient(-9, -8, 9, 8);
      foil.addColorStop(0, paper.color);
      foil.addColorStop(0.42, '#fff9df');
      foil.addColorStop(0.55, paper.color);
      foil.addColorStop(1, paper.color);
      foils.set(paper.color, foil);
    }
    const fireworks = createFireworks(width, height);
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
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.lineCap = 'round';
      for (const burst of fireworks) {
        const pose = fireworkFrame(burst, elapsed, height);
        if (!pose) continue;
        context.strokeStyle = burst.color;
        context.fillStyle = burst.color;
        if (pose.rocket) {
          context.globalAlpha = 0.65;
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(pose.rocket.x, pose.rocket.y + 22);
          context.lineTo(pose.rocket.x, pose.rocket.y);
          context.stroke();
        }
        for (const spark of pose.sparks) {
          context.globalAlpha = spark.opacity * 0.22;
          context.lineWidth = 6;
          context.beginPath();
          context.moveTo(spark.tailX, spark.tailY);
          context.lineTo(spark.x, spark.y);
          context.stroke();
          context.globalAlpha = spark.opacity;
          context.lineWidth = 1.5;
          context.stroke();
          context.fillRect(spark.x - 1, spark.y - 1, 2, 2);
        }
      }
      context.restore();
      for (const paper of papers) {
        const pose = confettiFrame(paper, elapsed, height);
        if (!pose) continue;
        context.save();
        context.globalAlpha = pose.opacity;
        context.translate(pose.x, pose.y);
        context.rotate(pose.angle);
        context.scale(pose.scale, 1);
        context.fillStyle = foils.get(paper.color);
        if (paper.ribbon) {
          context.strokeStyle = foils.get(paper.color);
          context.lineWidth = paper.width * 0.45;
          context.beginPath();
          context.moveTo(0, -paper.height * 1.5);
          context.bezierCurveTo(paper.width * 2, -paper.height, -paper.width * 2, paper.height, 0, paper.height * 1.5);
          context.stroke();
        } else {
          context.fillRect(-paper.width / 2, -paper.height / 2, paper.width, paper.height);
        }
        // A darker reverse face gives the fluttering pieces depth without shadows.
        if (pose.shade && !paper.ribbon) {
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
  return celebration ? <div className={styles.celebration} aria-hidden="true">
    <div className={styles.atmosphere} />
    <div className={styles.spotlight} />
    <canvas ref={canvasRef} data-completion-confetti="" className={styles.canvas} />
    <div className={styles.moment}>
      <div className={styles.halo} />
      <div className={styles.seal}>
        <svg viewBox="0 0 100 100" fill="none">
          <path d="M25 75C6 59 12 34 26 23M75 75C94 59 88 34 74 23" stroke="currentColor" strokeWidth="1.5" />
          <path d="M21 64l-10-5m9-7-9-7m13-5-7-9m62 33 10-5m-9-7 9-7m-13-5 7-9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M36 27h28v18c0 12-6 19-14 19s-14-7-14-19V27Z" fill="currentColor" />
          <path d="M36 32H27v8c0 9 5 13 13 14m24-22h9v8c0 9-5 13-13 14M50 64v11m-10 4h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="m50 33 2.2 4.5 5 .7-3.6 3.5.8 5-4.4-2.3-4.4 2.3.8-5-3.6-3.5 5-.7L50 33Z" fill="#81591c" />
        </svg>
      </div>
      <span className={styles.eyebrow}>NK PERFORMANCE</span>
      <strong className={styles.title}>Сильная<br />работа.</strong>
      <span className={styles.subtitle}>Тренировка завершена</span>
      <div className={styles.rule} />
      <span className={styles.caption}>Каждая тренировка делает тебя сильнее</span>
    </div>
  </div> : null;
}
