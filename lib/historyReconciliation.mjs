import { canonicalRedisValue, redisValuesMatch } from './recoveryDrill.mjs';
const hash = value => Object.fromEntries(canonicalRedisValue('hash', value));
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const dated = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

// Three-way recovery: newer archive vs earlier archive vs live data.
// Only unchanged earlier values or explicitly older dated metadata advance.
export function reconcileHistoryValue(newer, earlier, live) {
  if (!live || newer.type !== live.type || !newer.key.startsWith('coach:')) return null;
  if (redisValuesMatch(newer.type, newer.value, live.value)) return null;
  if (newer.key.startsWith('coach:exweight:') && newer.type === 'hash') {
    const n = hash(newer.value), c = hash(live.value);
    if (dated(n.date) && dated(c.date) && n.date > c.date) return newer.value;
  }
  if (newer.key.startsWith('coach:exhist:') && newer.type === 'hash') {
    const n = hash(newer.value), c = hash(live.value), old = earlier ? hash(earlier.value) : {};
    const updated = { ...c };
    for (const [date, value] of Object.entries(n)) if (!(date in c) || (date in old && c[date] === old[date])) updated[date] = value;
    return same(updated, c) ? null : updated;
  }
  if (newer.key.startsWith('coach:ex_memory:') && newer.type === 'string') {
    const n = json(newer.value), c = json(live.value), old = earlier ? json(earlier.value) : {};
    const updated = { ...c };
    for (const [id, entry] of Object.entries(n)) {
      if (!c[id] || (dated(entry.lastDate) && dated(c[id].lastDate) && entry.lastDate > c[id].lastDate) || (old[id] && same(c[id], old[id]))) updated[id] = entry;
    }
    return same(updated, c) ? null : JSON.stringify(updated);
  }
  const replaceable = /^coach:(exweight:|gym_tonnage:|session:actual:)/.test(newer.key);
  if (replaceable && earlier?.type === live.type && redisValuesMatch(live.type, earlier.value, live.value)) return newer.value;
  return null;
}

export const RECONCILE_HISTORY_LUA = `
local actualType = redis.call('TYPE', KEYS[1]).ok
if actualType ~= ARGV[1] then return 0 end
if actualType == 'string' then
  if redis.call('GET', KEYS[1]) ~= ARGV[2] then return 0 end
  redis.call('SET', KEYS[1], ARGV[3], 'KEEPTTL')
elseif actualType == 'hash' then
  local expected = cjson.decode(ARGV[2])
  local target = cjson.decode(ARGV[3])
  if redis.call('HLEN', KEYS[1]) ~= #expected / 2 then return 0 end
  for i = 1, #expected, 2 do if redis.call('HGET', KEYS[1], expected[i]) ~= expected[i+1] then return 0 end end
  local wanted = {}
  for i = 1, #target, 2 do wanted[target[i]] = true end
  for i = 1, #expected, 2 do if not wanted[expected[i]] then redis.call('HDEL', KEYS[1], expected[i]) end end
  for i = 1, #target, 2 do redis.call('HSET', KEYS[1], target[i], target[i+1]) end
else return 0 end
return 1
`;
