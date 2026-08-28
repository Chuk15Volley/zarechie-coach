import crypto from 'node:crypto';

const SUPPORTED_TYPES = new Set(['string', 'hash', 'list', 'set', 'zset']);

function hashPairs(value) {
  if (Array.isArray(value)) {
    const pairs = [];
    for (let index = 0; index + 1 < value.length; index += 2) pairs.push([String(value[index]), String(value[index + 1])]);
    return pairs;
  }
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => [String(key), String(item)]);
  return [];
}

export function canonicalRedisValue(type, value) {
  if (type === 'string') return String(value ?? '');
  if (type === 'hash') return hashPairs(value).sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
  if (type === 'list') return (Array.isArray(value) ? value : []).map(String);
  if (type === 'set') return (Array.isArray(value) ? value : []).map(String).sort();
  if (type === 'zset') return hashPairs(value).sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
  throw new Error(`Unsupported Redis type: ${type}`);
}

export function redisValuesMatch(type, expected, actual) {
  return JSON.stringify(canonicalRedisValue(type, expected)) === JSON.stringify(canonicalRedisValue(type, actual));
}

function stableScore(entry) {
  return crypto.createHash('sha256').update(`${entry.type}\0${entry.key}`).digest('hex');
}

export function selectRecoveryDrillEntries(entries, maximum = 240) {
  const valid = (Array.isArray(entries) ? entries : []).filter(entry => entry?.key && SUPPORTED_TYPES.has(entry.type));
  const limit = Math.max(1, Math.min(1000, Math.floor(Number(maximum) || 240)));
  if (valid.length <= limit) return valid;
  const selected = [];
  const seen = new Set();
  for (const type of SUPPORTED_TYPES) {
    const match = valid.find(entry => entry.type === type);
    if (match) { selected.push(match); seen.add(match.key); }
  }
  const remaining = valid.filter(entry => !seen.has(entry.key)).sort((left, right) => stableScore(left).localeCompare(stableScore(right)));
  return [...selected, ...remaining.slice(0, Math.max(0, limit - selected.length))];
}

export function recoveryDrillKey(workspace, runId, originalKey) {
  const digest = crypto.createHash('sha256').update(String(originalKey)).digest('hex').slice(0, 32);
  return `drill:${workspace}:${runId}:${digest}`;
}
