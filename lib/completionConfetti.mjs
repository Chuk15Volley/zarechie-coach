// Paper motion is evaluated from elapsed time, so dropped frames never slow it down.
export const CONFETTI_DURATION_MS = 12000;
export const CONFETTI_COLORS = ['#e8bd60', '#68d9b3', '#f4f0dd', '#7aa9e8', '#d897aa'];

export function createConfetti(width, height, random = Math.random) {
  const perWave = width < 600 ? 150 : 230;
  const count = perWave * 3;
  return Array.from({ length: count }, (_, index) => ({
    x: random() * width,
    delay: Math.floor(index / perWave) * 2.7 + random() * 1.2,
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


export function createFireworks(width, height, random = Math.random) {
  const colors = ['#ffd97a', '#8ce9d0', '#94baff', '#f5a8cf', '#fff0ba'];
  return Array.from({ length: 7 }, (_, index) => ({
    delay: 0.25 + index * 1.3,
    x: width * (0.18 + random() * 0.64),
    y: height * (0.16 + random() * 0.3),
    color: colors[index % colors.length],
    sparks: Array.from({ length: width < 600 ? 42 : 64 }, (_, spark) => {
      const angle = spark / (width < 600 ? 42 : 64) * Math.PI * 2 + random() * 0.1;
      const speed = Math.min(width, height) * (0.22 + random() * 0.18);
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.7 + random() * 0.6 };
    }),
  }));
}

export function fireworkFrame(burst, elapsedMs, height) {
  if (elapsedMs < 0 || elapsedMs >= CONFETTI_DURATION_MS) return null;
  const t = elapsedMs / 1000 - burst.delay;
  if (t < 0) return null;
  const launch = 0.65;
  if (t < launch) {
    const progress = t / launch;
    return { rocket: {x: burst.x, y: height + 20 + (burst.y - height - 20) * progress}, sparks: [] };
  }
  const age = t - launch;
  const travel = time => (1 - Math.exp(-1.2 * time)) / 1.2;
  const tailAge = Math.max(0, age - 0.055);
  const sparks = burst.sparks.filter(spark => age < spark.life).map(spark => ({
    x: burst.x + spark.vx * travel(age),
    y: burst.y + spark.vy * travel(age) + 35 * age * age,
    tailX: burst.x + spark.vx * travel(tailAge),
    tailY: burst.y + spark.vy * travel(tailAge) + 35 * tailAge * tailAge,
    opacity: Math.max(0, (1 - age / spark.life) ** 1.4),
  }));
  return sparks.length ? { rocket: null, sparks } : null;
}
