// Self-reported symptoms are monitoring, not a diagnosis or medical clearance.
export const PREHAB_ZONES = [
  { key: 'ankle', label: 'Голеностоп' }, { key: 'achilles', label: 'Ахилл' },
  { key: 'knee', label: 'Колени' }, { key: 'back', label: 'Поясница' },
  { key: 'shoulder', label: 'Плечи' },
];
export const PREHAB_STAGES = ['before', 'after', 'nextMorning'];
export function normalizePrehabReaction(input) {
  const pain = {};
  for (const { key } of PREHAB_ZONES) {
    const value = input?.pain?.[key];
    if (value == null || value === '' || typeof value === 'boolean' || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 10) {
      throw new Error('Оцените каждую область от 0 до 10; 0 — боли нет.');
    }
    pain[key] = Number(value);
  }
  return { pain, note: String(input?.note || '').trim().slice(0, 300) };
}
export function worseningPrehabZones(record) {
  const baseline = record?.before?.pain;
  if (!baseline) return [];
  return PREHAB_ZONES.filter(({ key }) => ['after', 'nextMorning'].some(stage => {
    const next = record?.[stage]?.pain?.[key];
    return typeof baseline[key] === 'number' && typeof next === 'number' && next > baseline[key];
  })).map(zone => zone.key);
}
export function prehabReactionKey(prefix, playerId, date) {
  return `${prefix}:feedback:${playerId}:${date}:prehab-reaction`;
}
export function nextPrehabDate(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
