// Paper motion is evaluated from elapsed time, so dropped frames never slow it down.
export const CONFETTI_DURATION_MS = 6200;
export const CONFETTI_COLORS = ['#e8bd60', '#68d9b3', '#f4f0dd', '#7aa9e8', '#d897aa'];

export function createConfetti(width, height, random = Math.random) {
  const count = width < 600 ? 100 : 155;
  return Array.from({ length: count }, () => ({
    x: random() * width,
    delay: random() * 1.15,
    velocity: height * (0.17 + random() * 0.09),
    gravity: height * (0.035 + random() * 0.018),
    drift: (random() - 0.5) * 65,
    flutter: 12 + random() * 24,
    phase: random() * Math.PI * 2,
    spin: (random() - 0.5) * 6,
    tumble: 3 + random() * 5,
    width: 5 + random() * 5,
    height: 9 + random() * 7,
    color: CONFETTI_COLORS[Math.floor(random() * CONFETTI_COLORS.length)],
  }));
}

export function confettiFrame(paper, elapsedMs, height) {
  if (elapsedMs < 0 || elapsedMs >= CONFETTI_DURATION_MS) return null;
  const t = elapsedMs / 1000 - paper.delay;
  if (t < 0) return null;
  const y = -25 + paper.velocity * t + paper.gravity * t * t / 2;
  if (y > height + 30) return null;
  const face = Math.cos(paper.phase + t * paper.tumble);
  return {
    x: paper.x + paper.drift * t + Math.sin(paper.phase + t * 2.3) * paper.flutter,
    y,
    angle: paper.phase + paper.spin * t,
    scale: Math.max(0.08, Math.abs(face)),
    shade: face < 0,
    opacity: Math.min(1, (CONFETTI_DURATION_MS - elapsedMs) / 600),
  };
}
