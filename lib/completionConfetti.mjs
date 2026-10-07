// Paper motion is evaluated from elapsed time, so dropped frames never slow it down.
export const CONFETTI_DURATION_MS = 14000;
export const CONFETTI_COLORS = ['#e9b94f', '#ffe7a0', '#b67d28', '#fff3cf', '#79d8ba'];

export function createConfetti(width, height, random = Math.random) {
  const perWave = width < 600 ? 170 : 260;
  return Array.from({ length: perWave * 4 }, (_, index) => {
    const wave = Math.floor(index / perWave);
    const cannon = wave < 2;
    const side = index % 2 ? 1 : -1;
    const depth = 0.65 + random() * 0.85;
    return {
      cannon,
      x: cannon ? (side < 0 ? width * 0.04 : width * 0.96) : random() * width,
      y: cannon ? height + 20 : -30,
      delay: (cannon ? wave * 1.5 : 2.6 + (wave - 2) * 3.2) + random() * (cannon ? 0.35 : 1.8),
      vx: cannon ? -side * width * (0.2 + random() * 0.65) : (random() - 0.5) * 45,
      vy: cannon ? -height * (1.25 + random() * 0.65) : height * (0.12 + random() * 0.09),
      gravity: height * (cannon ? 0.22 : 0.035),
      flutter: (12 + random() * 22) * depth,
      phase: random() * Math.PI * 2,
      spin: (random() - 0.5) * 7,
      tumble: 3 + random() * 5,
      width: (4 + random() * 5) * depth,
      height: (8 + random() * 10) * depth,
      ribbon: index % 9 === 0,
      color: CONFETTI_COLORS[Math.floor(random() * CONFETTI_COLORS.length)],
    };
  });
}

export function confettiFrame(paper, elapsedMs, height) {
  if (elapsedMs < 0 || elapsedMs >= CONFETTI_DURATION_MS) return null;
  const t = elapsedMs / 1000 - paper.delay;
  if (t < 0) return null;
  const travel = paper.cannon ? (1 - Math.exp(-1.1 * t)) / 1.1 : t;
  const y = paper.y + paper.vy * travel + paper.gravity * t * t / 2;
  if (y > height + 40 && t > 0.2) return null;
  const face = Math.cos(paper.phase + t * paper.tumble);
  return {
    x: paper.x + paper.vx * travel + Math.sin(paper.phase + t * 2.3) * paper.flutter,
    y, angle: paper.phase + paper.spin * t,
    scale: Math.max(0.08, Math.abs(face)),
    shade: face < 0,
    opacity: Math.min(1, (CONFETTI_DURATION_MS - elapsedMs) / 1700),
  };
}


export function createFireworks(width, height, random = Math.random) {
  const colors = ['#ffe1a0', '#f5c65e', '#fff2ca'];
  return Array.from({ length: 5 }, (_, index) => ({
    delay: 0.45 + index * 1.8,
    x: width * ([0.22, 0.78, 0.5, 0.28, 0.72][index] + (random() - 0.5) * 0.08),
    y: height * (0.18 + random() * 0.16),
    color: colors[index % colors.length],
    sparks: Array.from({ length: width < 600 ? 64 : 96 }, (_, spark) => {
      const angle = spark / (width < 600 ? 64 : 96) * Math.PI * 2 + random() * 0.1;
      const speed = Math.min(width, height) * (0.32 + random() * 0.25);
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 2.4 + random() * 0.8 };
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
  const tailAge = Math.max(0, age - 0.16);
  const sparks = burst.sparks.filter(spark => age < spark.life).map(spark => ({
    x: burst.x + spark.vx * travel(age),
    y: burst.y + spark.vy * travel(age) + 35 * age * age,
    tailX: burst.x + spark.vx * travel(tailAge),
    tailY: burst.y + spark.vy * travel(tailAge) + 35 * tailAge * tailAge,
    opacity: Math.max(0, (1 - age / spark.life) ** 0.9),
  }));
  return sparks.length ? { rocket: null, sparks } : null;
}
