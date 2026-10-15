export function timedExercise(ex) {
  const holds = /^(\d+)\s*[x×]\s*(\d+)(?:-(\d+))? sec/.exec(ex.reps);
  const range = /^(\d+)(?:-(\d+))? (sec|min)\b/.exec(ex.reps);
  if (!holds && !range) return null;
  const factor = !holds && range[3] === 'min' ? 60 : 1;
  return { min: Number(holds ? holds[2] : range[1]) * factor, max: Number(holds ? holds[3] || holds[2] : range[2] || range[1]) * factor, sides: /each|ea\b/.test(ex.reps) ? 2 : 1, repeats: holds ? Number(holds[1]) : 1 };
}
