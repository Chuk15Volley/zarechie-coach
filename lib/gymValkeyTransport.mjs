import Redis from 'ioredis';
import { createHash } from 'node:crypto';

const COMMANDS = new Set(('PING GET SET DEL EXPIRE PEXPIRE PEXPIREAT TTL PTTL TYPE EXISTS SCAN KEYS '
  + 'HGET HGETALL HSET HDEL HKEYS HINCRBY SADD SREM SMEMBERS SCARD '
  + 'LPUSH RPUSH LRANGE LLEN LTRIM ZADD ZREM ZRANGE ZREVRANGE ZRANGEBYSCORE ZREVRANGEBYSCORE ZCARD EVAL').split(' '));

function failure(code = 'GYM_STORAGE_UNAVAILABLE') {
  const error = new Error(code);
  error.code = code;
  error.status = 503;
  return error;
}

function configuration(env) {
  if (env.DEBUG || process.env.DEBUG) throw failure('GYM_STORAGE_DEBUG_FORBIDDEN');
  if (env.GYM_STORAGE_PROVIDER !== 'valkey'
    || env.GYM_DEPLOYMENT_ENV !== 'ru-self-hosted'
    || env.GYM_DEPLOYMENT_REGION !== 'ru'
    || env.GYM_STORAGE_BOUNDARY !== 'readysix-gym-ru-production'
    || env.KV_REST_API_URL || env.KV_REST_API_TOKEN
    || env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_TOKEN) {
    throw failure('GYM_STORAGE_BOUNDARY_REQUIRED');
  }
  let endpoint;
  try { endpoint = new URL(env.GYM_VALKEY_ENDPOINT); } catch { throw failure('GYM_STORAGE_ENDPOINT_INVALID'); }
  if (endpoint.protocol !== 'redis:' || !['valkey-gym', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    || !['', '/', '/0'].includes(endpoint.pathname)
    || env.GYM_VALKEY_USERNAME !== 'gym'
    || typeof env.GYM_VALKEY_PASSWORD !== 'string' || env.GYM_VALKEY_PASSWORD.length < 32) {
    throw failure('GYM_STORAGE_ENDPOINT_INVALID');
  }
  return {
    host: endpoint.hostname.replace(/^\[|\]$/g, ''), port: Number(endpoint.port || 6379), db: 0,
    username: env.GYM_VALKEY_USERNAME, password: env.GYM_VALKEY_PASSWORD,
    protocol: 2, lazyConnect: true, connectTimeout: 3000,
    enableOfflineQueue: false, retryStrategy: null, reconnectOnError: null,
    maxRetriesPerRequest: 0, autoResendUnfulfilledCommands: false, autoResubscribe: false,
    disableClientInfo: true,
  };
}

export function gymStorageIsConfigured(env) {
  try { configuration(env); return true; } catch { return false; }
}

function normalize(command, args) {
  if (typeof command !== 'string' || !COMMANDS.has(command.toUpperCase()) || !Array.isArray(args)) {
    throw failure('GYM_STORAGE_COMMAND_INVALID');
  }
  return [command.toUpperCase(), ...args.map(value => {
    if (typeof value === 'string' || Buffer.isBuffer(value)) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    throw failure('GYM_STORAGE_ARGUMENT_INVALID');
  })];
}

export function createGymValkeyTransport(env) {
  const options = configuration(env);
  let client, connecting, closed = false;
  function disconnect() { client?.disconnect(); client = undefined; connecting = undefined; }
  async function ready() {
    if (closed) throw failure('GYM_STORAGE_CLOSED');
    if (client?.status === 'ready') return client;
    if (!connecting) {
      disconnect();
      const current = new Redis(options);
      current.on('error', () => {});
      client = current;
      connecting = current.connect().then(() => current).finally(() => {
        if (client === current) connecting = undefined;
      });
    }
    return connecting;
  }
  async function run(operation) {
    let timer;
    try {
      return await Promise.race([
        (async () => operation(await ready()))(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(failure()), 4000); }),
      ]);
    } catch {
      // An acknowledgement can be lost after a write committed: never replay it.
      disconnect();
      throw failure();
    } finally { clearTimeout(timer); }
  }
  return {
    command(command, ...args) {
      const [name, ...values] = normalize(command, args);
      return run(connection => connection.call(name, ...values));
    },
    pipeline(commands) {
      if (!Array.isArray(commands) || commands.some(row => !Array.isArray(row) || !row.length)) {
        throw failure('GYM_STORAGE_COMMAND_INVALID');
      }
      const normalized = commands.map(([name, ...args]) => normalize(name, args));
      if (!normalized.length) return Promise.resolve([]);
      return run(async connection => {
        const pipeline = connection.pipeline();
        for (const [name, ...args] of normalized) pipeline.call(name, ...args);
        const replies = await pipeline.exec();
        if (!Array.isArray(replies) || replies.length !== normalized.length || replies.some(([error]) => error)) {
          throw failure();
        }
        return replies.map(([, value]) => value);
      });
    },
    close() { closed = true; disconnect(); },
  };
}

let cached;
export function gymValkeyTransport(env = process.env) {
  const options = configuration(env);
  const identity = createHash('sha256').update(JSON.stringify(options)).digest('hex');
  if (cached?.identity !== identity) {
    cached?.transport.close();
    cached = { identity, transport: createGymValkeyTransport(env) };
  }
  return cached.transport;
}

export function closeGymValkeyTransport() { cached?.transport.close(); cached = undefined; }
