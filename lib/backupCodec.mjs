import crypto from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

const ENVELOPE_VERSION = 1;
const SNAPSHOT_VERSION = 2;
const MAX_PLAINTEXT_BYTES = 64 * 1024 * 1024;

function requireSecret(secret) {
  const value = String(secret || '');
  if (Buffer.byteLength(value) < 32) throw new Error('BACKUP_ENCRYPTION_KEY must be at least 32 bytes');
  return crypto.createHash('sha256').update('zarechie-coach-backup\0').update(value).digest();
}

function aad(workspace) {
  return Buffer.from(`zarechie-coach-backup:v${ENVELOPE_VERSION}:${workspace}`);
}

export function encodeBackup(snapshot, secret) {
  if (!snapshot || snapshot.schemaVersion !== SNAPSHOT_VERSION || !['zarechie', 'nkperf'].includes(snapshot.workspace)) {
    throw new Error('Invalid backup snapshot');
  }
  const plaintext = Buffer.from(JSON.stringify(snapshot));
  if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new Error('Backup is too large');
  const compressed = gzipSync(plaintext, { level: 9 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', requireSecret(secret), iv);
  cipher.setAAD(aad(snapshot.workspace));
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const envelope = {
    version: ENVELOPE_VERSION,
    algorithm: 'aes-256-gcm+gzip',
    workspace: snapshot.workspace,
    createdAt: snapshot.createdAt,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    digest: crypto.createHash('sha256').update(plaintext).digest('hex'),
    ciphertext: ciphertext.toString('base64'),
  };
  return Buffer.from(JSON.stringify(envelope));
}

export function decodeBackup(payload, secret) {
  const source = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let envelope;
  try { envelope = JSON.parse(source.toString('utf8')); } catch (_) { throw new Error('Backup envelope is not valid JSON'); }
  if (envelope?.version !== ENVELOPE_VERSION || envelope?.algorithm !== 'aes-256-gcm+gzip' || !['zarechie', 'nkperf'].includes(envelope?.workspace)) {
    throw new Error('Unsupported backup envelope');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', requireSecret(secret), Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(aad(envelope.workspace));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const compressed = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
    const plaintext = gunzipSync(compressed, { maxOutputLength: MAX_PLAINTEXT_BYTES });
    const digest = crypto.createHash('sha256').update(plaintext).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(String(envelope.digest || ''), 'hex'))) {
      throw new Error('Backup integrity check failed');
    }
    const snapshot = JSON.parse(plaintext.toString('utf8'));
    if (snapshot?.schemaVersion !== SNAPSHOT_VERSION || snapshot?.workspace !== envelope.workspace || !Array.isArray(snapshot?.entries)) {
      throw new Error('Backup snapshot is invalid');
    }
    return snapshot;
  } catch (error) {
    if (error?.message === 'Backup integrity check failed' || error?.message === 'Backup snapshot is invalid') throw error;
    throw new Error('Backup authentication failed');
  }
}

export function shouldIncludeBackupKey(workspace, key) {
  const value = String(key || '');
  const prefix = workspace === 'nkperf' ? 'nkperf' : 'coach';
  const scoped = value.startsWith(`${prefix}:`);
  const shared = workspace === 'zarechie' && (
    value.startsWith('ex:')
    || value.startsWith('exercise:manual:')
    || value.startsWith('exercise:yt-manual:')
    || value.startsWith('player:photo:')
  );
  if (!scoped && !shared) return false;
  return !(
    value.startsWith(`${prefix}:ops_snapshot:`)
    || value === `${prefix}:ops_snapshots`
    || value.startsWith(`${prefix}:platform:`)
    || value.startsWith('coach:batch:')
    || value.startsWith('coach:batch-lock:')
  );
}

function hashPairs(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.entries(value).flat();
  return [];
}

export function restoreCommandsForEntry(entry, options = {}) {
  const key = String(options.key || entry?.key || '');
  const type = String(entry?.type || '');
  if (!key) throw new Error('Backup entry key is missing');
  const commands = [['DEL', key]];
  if (type === 'string') commands.push(['SET', key, String(entry.value ?? '')]);
  else if (type === 'hash') {
    const pairs = hashPairs(entry.value);
    if (pairs.length) commands.push(['HSET', key, ...pairs.map(String)]);
  } else if (type === 'list') {
    const values = Array.isArray(entry.value) ? entry.value.map(String) : [];
    if (values.length) commands.push(['RPUSH', key, ...values]);
  } else if (type === 'set') {
    const values = Array.isArray(entry.value) ? entry.value.map(String) : [];
    if (values.length) commands.push(['SADD', key, ...values]);
  } else if (type === 'zset') {
    const values = Array.isArray(entry.value) ? entry.value.map(String) : [];
    if (values.length && values.length % 2 === 0) {
      const args = [];
      for (let index = 0; index < values.length; index += 2) args.push(values[index + 1], values[index]);
      commands.push(['ZADD', key, ...args]);
    }
  } else throw new Error(`Unsupported Redis type: ${type}`);
  const ttlMs = Number(options.ttlMs ?? entry.ttlMs);
  if (commands.length > 1 && Number.isFinite(ttlMs) && ttlMs > 0) commands.push(['PEXPIRE', key, String(Math.max(1, Math.floor(ttlMs)))]);
  return commands;
}

export const BACKUP_SCHEMA_VERSION = SNAPSHOT_VERSION;
