import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createGymBackupStore, backupStoreIsConfigured } from '../lib/gymBackupStore.mjs';

const env = { GYM_BACKUP_PROVIDER: 'yandex-s3', GYM_DEPLOYMENT_ENV: 'ru-self-hosted', GYM_DEPLOYMENT_REGION: 'ru',
  GYM_STORAGE_BOUNDARY: 'readysix-gym-ru-production', GYM_BACKUP_S3_BUCKET: 'readysix-ru-production-20261002',
  GYM_BACKUP_S3_OWNER_ID: 'aje3okvqb48qsqlitglj', GYM_BACKUP_S3_ACCESS_KEY_ID: 'synthetic',
  GYM_BACKUP_S3_SECRET_ACCESS_KEY: 'synthetic', BACKUP_ENCRYPTION_KEY: 'synthetic-backup-encryption-key-32bytes' };
const pathname = 'operations/backups/zarechie/synthetic.backup';
function fixture({ publicAcl = false, anonymousStatus = 403, versioned = true } = {}) {
  const objects = new Map(), calls = [];
  const client = { async send(command) {
    calls.push(command);const name = command.constructor.name, input = command.input;
    if (name === 'GetBucketAclCommand' || name === 'GetObjectAclCommand') return { Owner: { ID: '' }, Grants: publicAcl ? [{ Grantee: { Type: 'Group' }, Permission: 'READ' }] : [] };
    if (name === 'GetBucketPolicyCommand') throw Object.assign(new Error('synthetic'), { name: 'NoSuchBucketPolicy' });
    if (name === 'GetBucketVersioningCommand') return { Status: versioned ? 'Enabled' : 'Suspended' };
    if (name === 'PutObjectCommand') { if (input.IfNoneMatch && objects.has(input.Key)) throw new Error('synthetic');objects.set(input.Key, Buffer.from(input.Body));return {}; }
    if (name === 'GetObjectCommand') { if (!objects.has(input.Key)) throw Object.assign(new Error('synthetic'), { name: 'NoSuchKey' });const bytes = objects.get(input.Key);return { Body: Readable.from([bytes]), ContentLength: bytes.length }; }
    if (name === 'ListObjectsV2Command') return { Contents: [...objects].filter(([key]) => key.startsWith(input.Prefix)).map(([Key, bytes]) => ({ Key, Size: bytes.length, LastModified: new Date(0) })), IsTruncated: false };
    throw new Error('unexpected command');
  } };
  return { objects, calls, store: createGymBackupStore(env, client, async () => anonymousStatus) };
}
test('Russian backup configuration rejects old providers, foreign boundaries and weak encryption', () => {
  assert.equal(backupStoreIsConfigured(env), true);
  for (const change of [{ GYM_BACKUP_PROVIDER: '' }, { GYM_DEPLOYMENT_REGION: 'eu' }, { GYM_STORAGE_BOUNDARY: 'readysix-ru-production' }, { BLOB_READ_WRITE_TOKEN: 'synthetic' }, { BACKUP_ENCRYPTION_KEY: 'short' }]) {
    assert.equal(backupStoreIsConfigured({ ...env, ...change }), false);
    assert.throws(() => createGymBackupStore({ ...env, ...change }), /GYM_BACKUP_UNAVAILABLE/);
  }
});
test('archives and integrity baselines are encrypted, private, fully read back and recoverable', async () => {
  const f = fixture();
  try {
    for (const path of [pathname, 'operations/integrity/zarechie/session-baseline.json']) {
      const plaintext = Buffer.from('synthetic-private-content');
      await f.store.put(path, plaintext, { access: 'private', addRandomSuffix: false, allowOverwrite: false });
      const [stored] = [...f.objects].filter(([key]) => key.endsWith(path));
      assert.ok(!stored[1].includes(plaintext));
      const result = await f.store.get(path), chunks = [];for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));
      assert.equal(Buffer.concat(chunks).toString(), plaintext.toString());
    }
    const listed = await f.store.list({ prefix: 'operations/backups/zarechie/' });assert.equal(listed.blobs[0].pathname, pathname);
    assert.equal((await f.store.get('operations/backups/nkperf/missing.backup')).statusCode, 404);
    assert.equal(f.calls.some(call => /Delete/.test(call.constructor.name)), false);
  } finally { f.store.close(); }
});
test('ciphertext cannot be swapped across workspaces or silently modified', async () => {
  const f = fixture();
  try {
    await f.store.put(pathname, 'synthetic', { access: 'private', addRandomSuffix: false });
    const [key, bytes] = [...f.objects][0], swapped = key.replace('/zarechie/', '/nkperf/');f.objects.set(swapped, Buffer.from(bytes));
    await assert.rejects(f.store.get(pathname.replace('/zarechie/', '/nkperf/')), /GYM_BACKUP_UNAVAILABLE/);
    f.objects.get(key)[20] ^= 1;await assert.rejects(f.store.get(pathname), /GYM_BACKUP_UNAVAILABLE/);
    await assert.rejects(f.store.get('recovery/production.encrypted.json'), /GYM_BACKUP_UNAVAILABLE/);
  } finally { f.store.close(); }
});
test('public ACLs, missing versioning, anonymous access and overwrites fail closed', async () => {
  for (const settings of [{ publicAcl: true }, { versioned: false }, { anonymousStatus: 200 }]) {
    const f = fixture(settings);try { await assert.rejects(f.store.put(pathname, 'synthetic', { access: 'private', addRandomSuffix: false }), /GYM_BACKUP_UNAVAILABLE/); } finally { f.store.close(); }
  }
  const f = fixture();try {
    await f.store.put(pathname, 'first', { access: 'private', addRandomSuffix: false });
    await assert.rejects(f.store.put(pathname, 'second', { access: 'private', addRandomSuffix: false }), /GYM_BACKUP_UNAVAILABLE/);
  } finally { f.store.close(); }
});
