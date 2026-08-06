// Canonical exercise identity. Equipment and execution mode are part of the
// identity because they produce different loading histories.
export function legacyExerciseId(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function canonicalExerciseId(name) {
  const raw = String(name || '').normalize('NFKC').toLowerCase();
  const tags = [];
  const variants = [
    ['trap-bar', /trap\s*bar|трэп\s*гриф/], ['db', /\bdb\b|dumbbell|гантел/],
    ['kb', /\bkb\b|kettlebell|гир[яеи]/], ['band', /band|резин|эспандер|петл/],
    ['trx', /\btrx\b/], ['barbell', /barbell|штанг/], ['landmine', /landmine/],
    ['cable', /cable|блочн/], ['bw', /body\s*weight|вес\s*тела|\bbw\b/],
    ['iso', /\biso(?:metric)?\b|изометр/], ['ecc', /eccentric|эксцентр/],
    ['cluster', /cluster|кластер/], ['tempo', /tempo|темпов/],
  ];
  for (const [tag, re] of variants) if (re.test(raw)) tags.push(tag);
  const base = raw
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 92);
  return `v2-${base}${tags.length ? `--${[...new Set(tags)].sort().join('-')}` : ''}`.slice(0, 120);
}
