import fs from 'node:fs';
import { gymStorageIsConfigured } from '../lib/gymValkeyTransport.mjs';
import { backupStoreIsConfigured } from '../lib/gymBackupStore.mjs';
try {
  const file = '/run/secrets/runtime.json', stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 1024 * 1024 || (stat.mode & 0o007) || process.env.NODE_OPTIONS || process.env.DEBUG) throw new Error();
  const env = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!env || Array.isArray(env) || typeof env !== 'object' || Object.keys(env).length > 100) throw new Error();
  for (const [name, value] of Object.entries(env)) if (!/^[A-Z][A-Z0-9_]*$/.test(name) || typeof value !== 'string' || value.includes('\0')
    || /^(?:NODE_|LD_|DYLD_|NPM_|DEBUG$|PATH$|HOME$|ENV$|BASH_ENV$|OPENSSL_CONF$|SSLKEYLOGFILE$|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|VERCEL_|KV_|UPSTASH_|SUPABASE_|BLOB_)/.test(name)) throw new Error();
  if (!gymStorageIsConfigured(env) || !backupStoreIsConfigured(env)
    || env.GYM_PROVIDER_EGRESS_MODE !== 'restricted-gateway' || env.GYM_PROVIDER_EGRESS_PROXY !== 'http://provider-egress:3128'
    || env.READYSIX_URL !== 'https://readysix.app'
    || env.READYSIX_ZARECHIE_MODE !== 'primary' || env.READYSIX_NK_MODE !== 'primary'
    || !env.READYSIX_ZARECHIE_API_KEY || !env.READYSIX_NK_API_KEY || !env.TRAINER_API_KEY
    || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error();
  Object.assign(process.env, env, { NODE_ENV: 'production' });
} catch { console.error('GYM_CONTAINER_CONFIGURATION_REJECTED');process.exit(1); }
