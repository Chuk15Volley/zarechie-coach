import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import * as legacy from '@vercel/blob';
import { S3Client, GetBucketAclCommand, GetBucketPolicyCommand, GetBucketVersioningCommand, GetObjectCommand, GetObjectAclCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const ENDPOINT = 'https://storage.yandexcloud.net';
const PREFIX = 'gym/readysix-gym-ru-production/';
const MAX_BYTES = 80 * 1024 * 1024;
const fail = () => { throw new Error('GYM_BACKUP_UNAVAILABLE'); };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const selected = env => Boolean(env.GYM_BACKUP_PROVIDER || env.GYM_DEPLOYMENT_ENV);

export function gymBackupConfiguration(env) {
  if (env.GYM_BACKUP_PROVIDER !== 'yandex-s3' || env.GYM_DEPLOYMENT_ENV !== 'ru-self-hosted'
    || env.GYM_DEPLOYMENT_REGION !== 'ru' || env.GYM_STORAGE_BOUNDARY !== 'readysix-gym-ru-production'
    || env.GYM_BACKUP_S3_BUCKET !== 'readysix-ru-production-20261002'
    || env.GYM_BACKUP_S3_OWNER_ID !== 'aje3okvqb48qsqlitglj'
    || !env.GYM_BACKUP_S3_ACCESS_KEY_ID || !env.GYM_BACKUP_S3_SECRET_ACCESS_KEY
    || Buffer.byteLength(env.BACKUP_ENCRYPTION_KEY || '') < 32
    || env.BACKUP_READ_WRITE_TOKEN || env.BLOB_READ_WRITE_TOKEN) fail();
  return { bucket: env.GYM_BACKUP_S3_BUCKET, owner: env.GYM_BACKUP_S3_OWNER_ID };
}
function objectKey(pathname) {
  if (typeof pathname !== 'string' || !/^operations\/(?:backups|quarantine|integrity)\/(?:zarechie|nkperf)\/[A-Za-z0-9_.-]+$/.test(pathname)
    || pathname.includes('..') || pathname.length > 300) fail();
  return PREFIX + pathname;
}
function privateAcl(acl, owner) {
  if (!Array.isArray(acl?.Grants)) fail();
  if (acl.Grants.length === 0 && ['', owner].includes(acl.Owner?.ID)) return;
  if (acl.Owner?.ID !== owner || !acl.Grants.length || acl.Grants.some(grant => grant.Grantee?.Type !== 'CanonicalUser' || grant.Grantee.ID !== owner || grant.Permission !== 'FULL_CONTROL')) fail();
}
export function createGymBackupStore(env, clientOverride, anonymousHeadOverride) {
  const config = gymBackupConfiguration(env);
  const client = clientOverride || new S3Client({ endpoint: ENDPOINT, region: 'ru-central1', forcePathStyle: true,
    followRegionRedirects: false, maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: env.GYM_BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: env.GYM_BACKUP_S3_SECRET_ACCESS_KEY } });
  const send = command => client.send(command, { abortSignal: AbortSignal.timeout(30000) });
  const encryptionKey = crypto.createHash('sha256').update('readysix-gym-yandex-object:v1\0').update(env.BACKUP_ENCRYPTION_KEY).digest();
  const aad = pathname => Buffer.from(PREFIX + pathname);
  function encrypt(pathname, bytes) {
    if (bytes.length > MAX_BYTES) fail();
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    cipher.setAAD(aad(pathname));
    return Buffer.concat([Buffer.from('RSGB1'), iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
  }
  function decrypt(pathname, bytes) {
    if (bytes.length < 33 || bytes.length > MAX_BYTES + 33 || bytes.subarray(0, 5).toString() !== 'RSGB1') fail();
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, bytes.subarray(5, 17));
    decipher.setAAD(aad(pathname));decipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([decipher.update(bytes.subarray(17, -16)), decipher.final()]);
  }
  async function preflight() {
    privateAcl(await send(new GetBucketAclCommand({ Bucket: config.bucket })), config.owner);
    try {
      const policy = JSON.parse((await send(new GetBucketPolicyCommand({ Bucket: config.bucket }))).Policy);
      if (!Array.isArray(policy.Statement) || policy.Statement.some(rule => rule.Effect !== 'Deny')) fail();
    } catch (error) { if (error.name !== 'NoSuchBucketPolicy') throw error; }
    if ((await send(new GetBucketVersioningCommand({ Bucket: config.bucket }))).Status !== 'Enabled') fail();
  }
  async function readEncrypted(key) {
    const response = await send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    if (!response.Body || !Number.isSafeInteger(response.ContentLength) || response.ContentLength < 33 || response.ContentLength > MAX_BYTES + 33) { response.Body?.destroy?.();fail(); }
    let length = 0;const chunks = [];
    const timeout = setTimeout(() => response.Body.destroy?.(new Error('GYM_BACKUP_UNAVAILABLE')), 30000);
    try {
      for await (const chunk of response.Body) { length += chunk.length;if (length > MAX_BYTES + 33) fail();chunks.push(Buffer.from(chunk)); }
      if (length !== response.ContentLength) fail();return Buffer.concat(chunks);
    } finally { clearTimeout(timeout);response.Body.destroy?.(); }
  }
  const guarded = fn => async (...args) => { try { return await fn(...args); } catch { fail(); } };
  return {
    put: guarded(async (pathname, body, options = {}) => {
      const key = objectKey(pathname);
      if (options.access !== 'private' || options.addRandomSuffix !== false) fail();
      const encrypted = encrypt(pathname, Buffer.isBuffer(body) ? body : Buffer.from(body));
      await preflight();
      await send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: encrypted, ContentLength: encrypted.length,
        ContentType: 'application/octet-stream', ACL: 'private', ContentMD5: crypto.createHash('md5').update(encrypted).digest('base64'),
        ...(options.allowOverwrite ? {} : { IfNoneMatch: '*' }) }));
      if (digest(await readEncrypted(key)) !== digest(encrypted)) fail();
      privateAcl(await send(new GetObjectAclCommand({ Bucket: config.bucket, Key: key })), config.owner);
      const status = anonymousHeadOverride ? await anonymousHeadOverride(key) : (await fetch(ENDPOINT + '/' + config.bucket + '/' + key, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15000) })).status;
      if (status !== 403) fail();
      return { pathname, size: encrypted.length };
    }),
    get: guarded(async pathname => {
      const key = objectKey(pathname);let encrypted;
      try { encrypted = await readEncrypted(key); } catch (error) { if (error.name === 'NoSuchKey') return { statusCode: 404 };throw error; }
      const plaintext = decrypt(pathname, encrypted), stream = Readable.from([plaintext]);
      stream.once('close', () => plaintext.fill(0));
      return { statusCode: 200, stream };
    }),
    list: guarded(async (options = {}) => {
      if (!/^operations\/(?:backups|quarantine)\/(?:zarechie|nkperf)\/$/.test(options.prefix || '')) fail();
      const result = await send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: PREFIX + options.prefix,
        MaxKeys: Math.min(1000, Math.max(1, Number(options.limit) || 1000)), ...(options.cursor ? { ContinuationToken: options.cursor } : {}) }));
      const blobs = (result.Contents || []).map(row => {
        if (!row.Key.startsWith(PREFIX + options.prefix)) fail();
        return { pathname: row.Key.slice(PREFIX.length), size: row.Size, uploadedAt: row.LastModified };
      });
      return { blobs, hasMore: result.IsTruncated === true, cursor: result.NextContinuationToken };
    }),
    close() { encryptionKey.fill(0);client.destroy?.(); },
  };
}

let runtime;
function store() { return runtime ||= createGymBackupStore(process.env); }
export function backupStoreIsConfigured(env = process.env) {
  if (!selected(env)) return Boolean(env.BACKUP_READ_WRITE_TOKEN && Buffer.byteLength(env.BACKUP_ENCRYPTION_KEY || '') >= 32);
  try { gymBackupConfiguration(env);return true; } catch { return false; }
}
export function backupStorageProvider(env = process.env) { return selected(env) ? 'yandex-s3-private' : 'vercel-blob-private'; }
export function backupRetentionManagedByOperator(env = process.env) { return selected(env); }
export const put = (...args) => selected(process.env) ? store().put(...args) : legacy.put(...args);
export const get = (...args) => selected(process.env) ? store().get(...args) : legacy.get(...args);
export const list = (...args) => selected(process.env) ? store().list(...args) : legacy.list(...args);
export const del = (...args) => { if (selected(process.env)) fail();return legacy.del(...args); };
