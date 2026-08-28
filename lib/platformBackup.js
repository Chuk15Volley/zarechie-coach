import crypto from 'node:crypto';
import { del, get, list, put } from '@vercel/blob';
import { BACKUP_SCHEMA_VERSION, decodeBackup, encodeBackup, restoreCommandsForEntry, shouldIncludeBackupKey } from './backupCodec.mjs';
import { recoveryDrillKey, redisValuesMatch, selectRecoveryDrillEntries } from './recoveryDrill.mjs';
import { redis, redisPipeline } from './redis.js';
import { pfx } from './workspacePrefix.js';

const BACKUP_PREFIX = 'operations/backups';
const MAX_KEYS = 12000;
const PIPELINE_CHUNK = 100;
const RETENTION_COUNT = 30;
const DRILL_SAMPLE_SIZE = 240;
const DRILL_TTL_MS = 15 * 60 * 1000;

function normalizeWorkspace(workspace) {
  return workspace === 'nkperf' ? 'nkperf' : 'zarechie';
}

function requireConfiguration() {
  if (!process.env.BACKUP_READ_WRITE_TOKEN) throw new Error('BACKUP_READ_WRITE_TOKEN is not configured');
  if (Buffer.byteLength(String(process.env.BACKUP_ENCRYPTION_KEY || '')) < 32) throw new Error('BACKUP_ENCRYPTION_KEY is not configured');
}

function blobToken() {
  return process.env.BACKUP_READ_WRITE_TOKEN;
}

function patternsFor(workspace) {
  const prefix = pfx(workspace);
  return workspace === 'zarechie'
    ? [`${prefix}:*`, 'ex:*', 'exercise:manual:*', 'exercise:yt-manual:*', 'player:photo:*']
    : [`${prefix}:*`];
}

async function scanPattern(pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const result = await redis('scan', cursor, 'match', pattern, 'count', '500');
    cursor = String(result?.[0] || '0');
    keys.push(...(Array.isArray(result?.[1]) ? result[1].map(String) : []));
    if (keys.length > MAX_KEYS) throw new Error(`Backup key limit exceeded for ${pattern}`);
  } while (cursor !== '0');
  return keys;
}

async function runChunked(commands) {
  const results = [];
  for (let index = 0; index < commands.length; index += PIPELINE_CHUNK) {
    results.push(...await redisPipeline(commands.slice(index, index + PIPELINE_CHUNK)));
  }
  return results;
}

function readCommand(key, type) {
  if (type === 'string') return ['GET', key];
  if (type === 'hash') return ['HGETALL', key];
  if (type === 'list') return ['LRANGE', key, '0', '-1'];
  if (type === 'set') return ['SMEMBERS', key];
  if (type === 'zset') return ['ZRANGE', key, '0', '-1', 'WITHSCORES'];
  return null;
}

async function captureSnapshot(workspace) {
  const allKeys = (await Promise.all(patternsFor(workspace).map(scanPattern))).flat();
  const keys = [...new Set(allKeys)].filter(key => shouldIncludeBackupKey(workspace, key)).sort();
  if (keys.length > MAX_KEYS) throw new Error('Backup key limit exceeded');
  const types = await runChunked(keys.map(key => ['TYPE', key]));
  const existing = keys.map((key, index) => ({ key, type: String(types[index] || 'none') }))
    .filter(entry => ['string', 'hash', 'list', 'set', 'zset'].includes(entry.type));
  const [values, ttls] = await Promise.all([
    runChunked(existing.map(entry => readCommand(entry.key, entry.type))),
    runChunked(existing.map(entry => ['PTTL', entry.key])),
  ]);
  const createdAt = new Date().toISOString();
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    id: `${createdAt.replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`,
    workspace,
    createdAt,
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    entries: existing.map((entry, index) => ({ ...entry, ttlMs: Number(ttls[index] ?? -1), value: values[index] })),
  };
}

function backupPath(snapshot) {
  return `${BACKUP_PREFIX}/${snapshot.workspace}/${snapshot.id}.backup`;
}

async function enforceRetention(workspace) {
  const listed = await list({ prefix: `${BACKUP_PREFIX}/${workspace}/`, limit: 100, token: blobToken() });
  const expired = [...listed.blobs].sort((left, right) => new Date(right.uploadedAt) - new Date(left.uploadedAt)).slice(RETENTION_COUNT);
  if (expired.length) await del(expired.map(blob => blob.pathname), { token: blobToken() });
}

export async function createEncryptedBackup(requestedWorkspace) {
  requireConfiguration();
  const workspace = normalizeWorkspace(requestedWorkspace);
  const snapshot = await captureSnapshot(workspace);
  const encrypted = encodeBackup(snapshot, process.env.BACKUP_ENCRYPTION_KEY);
  const pathname = backupPath(snapshot);
  const blob = await put(pathname, encrypted, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: 'application/octet-stream',
    cacheControlMaxAge: 60,
    token: blobToken(),
  });
  const metadata = {
    id: snapshot.id,
    workspace,
    createdAt: snapshot.createdAt,
    keyCount: snapshot.entries.length,
    encryptedBytes: encrypted.length,
    release: snapshot.release,
    pathname: blob.pathname,
    storage: 'vercel-blob-private',
  };
  await redis('set', `${pfx(workspace)}:platform:backup:last`, JSON.stringify(metadata));
  await enforceRetention(workspace);
  return metadata;
}

export async function listEncryptedBackups(requestedWorkspace, limit = 14) {
  requireConfiguration();
  const workspace = normalizeWorkspace(requestedWorkspace);
  const listed = await list({ prefix: `${BACKUP_PREFIX}/${workspace}/`, limit: Math.min(100, Math.max(1, Number(limit) || 14)), token: blobToken() });
  return listed.blobs
    .sort((left, right) => new Date(right.uploadedAt) - new Date(left.uploadedAt))
    .map(blob => ({
      id: blob.pathname.split('/').pop()?.replace(/\.backup$/, '') || blob.pathname,
      pathname: blob.pathname,
      createdAt: new Date(blob.uploadedAt).toISOString(),
      encryptedBytes: blob.size,
      storage: 'vercel-blob-private',
    }));
}

async function readStream(stream, maximumBytes = 80 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > maximumBytes) throw new Error('Backup payload is too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function loadEncryptedBackup(workspace, pathname) {
  const allowedPrefix = `${BACKUP_PREFIX}/${workspace}/`;
  if (!String(pathname || '').startsWith(allowedPrefix) || !String(pathname).endsWith('.backup')) throw new Error('Invalid backup path');
  const result = await get(pathname, { access: 'private', useCache: false, token: blobToken() });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error('Backup not found');
  const snapshot = decodeBackup(await readStream(result.stream), process.env.BACKUP_ENCRYPTION_KEY);
  if (snapshot.workspace !== workspace) throw new Error('Backup workspace mismatch');
  return snapshot;
}

export async function restoreEncryptedBackup(requestedWorkspace, pathname) {
  requireConfiguration();
  const workspace = normalizeWorkspace(requestedWorkspace);
  const snapshot = await loadEncryptedBackup(workspace, pathname);
  const entries = snapshot.entries.filter(entry => shouldIncludeBackupKey(workspace, entry.key));
  for (let index = 0; index < entries.length; index += 25) {
    const commands = entries.slice(index, index + 25).flatMap(restoreCommandsForEntry);
    if (commands.length) await redisPipeline(commands);
  }
  return { restored: true, id: snapshot.id, workspace, keyCount: entries.length, createdAt: snapshot.createdAt, release: snapshot.release };
}

export async function runRecoveryDrill(requestedWorkspace) {
  requireConfiguration();
  const workspace = normalizeWorkspace(requestedWorkspace);
  const started = Date.now();
  const runId = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  let drillKeys = [];
  let sourceId = null;
  try {
    const [latest] = await listEncryptedBackups(workspace, 1);
    if (!latest?.pathname) throw new Error('Backup not found');
    const snapshot = await loadEncryptedBackup(workspace, latest.pathname);
    sourceId = snapshot.id;
    const selected = selectRecoveryDrillEntries(
      snapshot.entries.filter(entry => shouldIncludeBackupKey(workspace, entry.key)),
      DRILL_SAMPLE_SIZE,
    );
    if (!selected.length) throw new Error('Backup has no restorable entries');
    const mapped = selected.map(entry => ({ entry, key: recoveryDrillKey(workspace, runId, entry.key) }));
    drillKeys = mapped.map(item => item.key);
    const restoreCommands = mapped.flatMap(({ entry, key }) => restoreCommandsForEntry(entry, { key, ttlMs: DRILL_TTL_MS }));
    await runChunked(restoreCommands);
    const [types, values, ttls] = await Promise.all([
      runChunked(mapped.map(item => ['TYPE', item.key])),
      runChunked(mapped.map(item => readCommand(item.key, item.entry.type))),
      runChunked(mapped.map(item => ['PTTL', item.key])),
    ]);
    const failures = mapped.filter((item, index) => (
      String(types[index]) !== item.entry.type
      || !redisValuesMatch(item.entry.type, item.entry.value, values[index])
      || Number(ttls[index]) <= 0
      || Number(ttls[index]) > DRILL_TTL_MS
    ));
    if (failures.length) throw new Error(`Recovery verification failed for ${failures.length} entries`);
    await runChunked(drillKeys.map(key => ['DEL', key]));
    drillKeys = [];
    const metadata = {
      id: runId,
      workspace,
      status: 'ok',
      checkedAt: new Date().toISOString(),
      sourceBackupId: snapshot.id,
      sourceKeyCount: snapshot.entries.length,
      sampledKeyCount: mapped.length,
      verifiedTypes: [...new Set(mapped.map(item => item.entry.type))].sort(),
      durationMs: Date.now() - started,
      release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
      cleanup: true,
    };
    await redis('set', `${pfx(workspace)}:platform:recovery:last`, JSON.stringify(metadata));
    return metadata;
  } catch (error) {
    const metadata = {
      id: runId,
      workspace,
      status: 'error',
      checkedAt: new Date().toISOString(),
      sourceBackupId: sourceId,
      durationMs: Date.now() - started,
      release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
      reason: String(error?.message || 'Recovery drill failed').slice(0, 160),
    };
    await redis('set', `${pfx(workspace)}:platform:recovery:last`, JSON.stringify(metadata)).catch(() => {});
    throw error;
  } finally {
    if (drillKeys.length) await runChunked(drillKeys.map(key => ['DEL', key])).catch(() => {});
  }
}

export function backupIsConfigured() {
  return Boolean(process.env.BACKUP_READ_WRITE_TOKEN && Buffer.byteLength(String(process.env.BACKUP_ENCRYPTION_KEY || '')) >= 32);
}
