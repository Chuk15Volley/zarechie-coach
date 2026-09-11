import { restoreCommandsForEntry } from './backupCodec.mjs';

// Additive recovery only. Scalars and lists already present are never replaced.
// The whole decision executes atomically, including the absent-key check.
export const ADD_MISSING_HISTORY_LUA = `
local current = redis.call('TYPE', KEYS[1]).ok
local expected = ARGV[1]
local commands = cjson.decode(ARGV[2])
local merge = ARGV[3] == 'merge'
if current ~= 'none' and current ~= expected then return -1 end
if current ~= 'none' and not merge then return 0 end
local changed = 0
for _, command in ipairs(commands) do
  local op = command[1]
  local args = {KEYS[1]}
  for i = 2, #command do table.insert(args, command[i]) end
  local result = redis.call(op, unpack(args))
  if type(result) == 'number' then changed = changed + result else changed = changed + 1 end
end
if current == 'none' and tonumber(ARGV[4]) > 0 then redis.call('PEXPIRE', KEYS[1], ARGV[4]) end
return changed
`;

export function isHistoryRecoveryKey(workspace, key) {
  const prefix = workspace === 'zarechie' ? 'coach' : workspace === 'nkperf' ? 'nkperf' : null;
  if (!prefix) throw new Error('Unknown recovery workspace');
  return new RegExp(`^${prefix}:(session:|sessions:|exhist:|exweight:|gym_tonnage:|gym_tonnage_actual:|gym_tonnage_dates:|feedback:|log:|ex_memory:|warmup:)`).test(key)
    && !key.endsWith(':merge-lock');
}

export function missingHistoryCommand(entry, workspace, capturedAt, now = Date.now()) {
  if (!isHistoryRecoveryKey(workspace, entry.key)) throw new Error('Outside recovery scope');
  const elapsed = now - Date.parse(capturedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Invalid backup timestamp');
  const ttl = Number(entry.ttlMs);
  if (!Number.isFinite(ttl) || ttl === -2 || ttl === 0) return null;
  const remaining = ttl > 0 ? Math.floor(ttl - elapsed) : -1;
  if (ttl > 0 && remaining <= 0) return null;
  // Only historical collections can merge: a current-weight hash is one record,
  // so combining individual kg/date fields from different versions is unsafe.
  const merge = /:(sessions|exhist|gym_tonnage_dates):/.test(entry.key);
  const restore = restoreCommandsForEntry({ ...entry, ttlMs: -1 });
  const commands = restore.slice(1).map(([op, , ...args]) => {
    if (merge && op === 'HSET') return null;
    if (merge && op === 'ZADD') return ['ZADD', 'NX', ...args];
    return [op, ...args];
  }).filter(Boolean);
  if (merge && entry.type === 'hash') {
    const values = Array.isArray(entry.value) ? entry.value : Object.entries(entry.value || {}).flat();
    for (let i = 0; i < values.length; i += 2) commands.push(['HSETNX', String(values[i]), String(values[i + 1])]);
  }
  if (!commands.length) return null;
  return ['EVAL', ADD_MISSING_HISTORY_LUA, 1, entry.key, entry.type, JSON.stringify(commands), merge ? 'merge' : 'absent', String(remaining)];
}
