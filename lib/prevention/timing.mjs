export function timedExercise(ex) {
  const holds = /^(\d+)\s*[x×]\s*(\d+)(?:-(\d+))? sec/.exec(ex.reps);
  const range = /^(\d+)(?:-(\d+))? sec/.exec(ex.reps);
  if (!holds && !range) return null;
  return { min: Number(holds ? holds[2] : range[1]), max: Number(holds ? holds[3] || holds[2] : range[2] || range[1]), sides: /each|ea\b/.test(ex.reps) ? 2 : 1, repeats: holds ? Number(holds[1]) : 1 };
}
