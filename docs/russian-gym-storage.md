# Separate Russian gym storage

This adapter preserves the gym's existing string, hash, set, list, sorted-set,
Lua-lock and pipeline contracts. It connects directly to an authenticated private
Valkey process. ReadySix analytics still come through the organization-bound
read-only ReadySix API; this change does not merge the two applications' data.

The Russian runtime requires all of these settings:

```dotenv
GYM_DEPLOYMENT_ENV=ru-self-hosted
GYM_DEPLOYMENT_REGION=ru
GYM_STORAGE_PROVIDER=valkey
GYM_STORAGE_BOUNDARY=readysix-gym-ru-production
GYM_VALKEY_ENDPOINT=redis://valkey-gym:6379/0
GYM_VALKEY_USERNAME=gym
# GYM_VALKEY_PASSWORD is a separately generated secret of at least 32 characters.
```

Mount the secret outside the repository. Run `valkey-gym` as a separate process
with its own persistent volume, `gym` ACL user, disabled default user, AOF and
`noeviction`. Do not publish its port. Only the gym runtime belongs on its private
network; ReadySix's primary and queue stores remain separate.

Remove `KV_REST_API_URL`, `KV_REST_API_TOKEN` and equivalent Upstash settings from
this runtime. A missing/unknown provider, wrong region or storage boundary,
ReadySix container endpoint, public hostname, nonzero database or legacy
credentials makes the Russian adapter reject access. A failed direct request
cannot fall back to the old service. Writes and pipelines are never automatically
replayed after a lost acknowledgement. Storage failures return fixed errors,
without values, credentials or raw upstream errors. `DEBUG` is forbidden because
the Redis client can otherwise log command arguments.

Existing deployments keep using their configured REST store until cutover.
Enabling the adapter alone does **not** migrate data, hosting, file storage,
backups or scheduled jobs. The current Vercel runtime cannot reach the private
container endpoint; deploy the gym runtime in Russia before enabling it.

Before cutting over, preserve the entire source archive, identify gym-owned keys
from actual consumers, stop every source writer, take a final consistent copy,
and restore into an empty dedicated target. Compare every value and absolute
expiry, including lists, hashes, sets and sorted sets. Retain unknown source keys
in the encrypted preservation archive. Keep the old source until new writes,
authenticated access, the ReadySix integration and backup recovery are verified.

Validation:

```sh
npm test
npm run build
GYM_TEST_REDIS_SERVER=/absolute/path/to/redis-server npm test
git diff --check
```

The opt-in test starts and removes its own synthetic local server. It verifies
five data types, Unicode, null replies, pipeline order and command failures,
absolute ordering of sorted sets, TTL, NX and Lua ownership of locks, reconnect
after a rejected command, and failure after shutdown. It never connects to
production. Without the binary, that single integration test is skipped.
# Russian encrypted backup storage

The self-hosted gym uses `GYM_BACKUP_PROVIDER=yandex-s3` with the same Russian
deployment and gym storage boundary as its Valkey client. Configure the private
`readysix-ru-production-20261002` bucket, its existing backup account owner, and
`GYM_BACKUP_S3_ACCESS_KEY_ID` / `GYM_BACKUP_S3_SECRET_ACCESS_KEY` outside Git.
Keep the existing `BACKUP_ENCRYPTION_KEY`; remove both Vercel Blob tokens from
the Russian runtime. Missing or mismatched Russian configuration fails closed.

Only the gym object prefix is accessible through this adapter. Both archives
and history integrity baselines receive authenticated AES-GCM encryption, with
the original pathname in authenticated data. Every upload requires private ACLs,
versioning, full ciphertext readback, and anonymous access denial. The existing
backup format remains recoverable after the outer encryption layer is removed.

The uploader account cannot delete objects. Russian runtime retention therefore
preserves all archives; an operator must review recovery and bucket usage before
configuring retention. Existing Blob files must be copied and verified before
their source service is retired. This code change does not migrate old files or
switch production by itself.
