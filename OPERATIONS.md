# Zarechie Coach Operations

## Current Production

- Main coach app: https://zarechie-sc.vercel.app
- GitHub: https://github.com/Chuk15Volley/zarechie-coach
- Vercel project: `zarechie/zarechie-coach`
- Production branch: `main`

## Data Sources

- Zarechie source dashboard: https://zarechie-odintsovo.vercel.app
- Zarechie source GitHub: https://github.com/Chuk15Volley/sport-dashboard
- NK Performance source API: https://nk-performance.vercel.app

The coach app reads Zarechie players from Redis directly and reads NK Performance players through the NK Performance API.

## Workspace Separation

Redis prefixes must stay separated:

- `coach:*` - Zarechie coach app data
- `nkperf:*` - NK Performance coach app data

Do not reuse one workspace's keys for the other workspace.

## Required Vercel Environment Variables

Configured in `production`, `preview`, and `development`:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `BLOB_READ_WRITE_TOKEN`
- `BACKUP_READ_WRITE_TOKEN` (отдельный private Vercel Blob store; не заменяет публичное медиа-хранилище)
- `TRAINER_API_KEY`
- `SESSION_SECRET` (случайная строка не короче 32 символов)
- `BACKUP_ENCRYPTION_KEY` (отдельный случайный секрет не короче 32 символов; не менять без процедуры ротации архивов)
- `CRON_SECRET` (случайный секрет авторизации Vercel Cron)
- `NK_PERF_URL`
- `NK_PERF_API_KEY`
- `OPENAI_API_KEY`

Do not commit secret values to GitHub.

Optional external incident delivery:

- `ALERT_WEBHOOK_URL` — credential-free HTTPS endpoint for the operations channel.
- `ALERT_WEBHOOK_SECRET` — independent random signing secret of at least 32 bytes. Receivers must verify `X-Zarechie-Signature` against the exact raw request body.
- Without both values, SLO incidents continue to be emitted as structured Production `error` logs for the existing Vercel alert rule. Preview and Development never deliver external notifications.

## Verification Checklist

Run these checks after env or deploy changes:

- `GET /` returns 200
- `GET /library` returns 200
- Keyless `GET /api/system/health` returns 401
- Authenticated `GET /api/system/health` returns healthy Redis checks
- Authenticated `GET /api/players/list` returns Zarechie players
- Authenticated `GET /api/nkperf/sync` returns NK Performance players
- Authenticated `GET /api/team/readiness?workspace=zarechie` returns only Zarechie players
- Authenticated `GET /api/team/readiness?workspace=nkperf` returns only NK Performance players
- Generate warmup on one approved real player
- Generate gym session on one approved real player
- Delete any test session from Redis after testing
- `GET /api/system/health` reports a fresh encrypted backup for each workspace
- `GET /api/system/health` reports a successful recovery drill not older than eight days

For automated checks, pass `Authorization: Bearer $TRAINER_API_KEY`. For the
browser UI, use `/api/auth/login`; never place the trainer key in `localStorage`
or a client-side environment variable. Run `SMOKE_BASE_URL=... SMOKE_TRAINER_KEY=... npm run test:smoke`
after every production deployment.

## Encrypted backups

- Vercel Cron creates independent encrypted backups for `zarechie` and `nkperf` every day at 02:30 UTC.
- Backups are compressed, encrypted with AES-256-GCM and stored in private Vercel Blob storage.
- The latest 30 copies per workspace are retained. Redis stores only the latest backup metadata used by health checks.
- Manual creation: authenticated `POST /api/system/snapshots` with `{ "workspace": "zarechie" }`.
- Listing: authenticated `GET /api/system/snapshots?workspace=zarechie`.
- Restore requires the exact Blob `pathname` and `confirmation: "RESTORE <backup-id>"`; always validate the target workspace before restoring.
- Never rotate or delete `BACKUP_ENCRYPTION_KEY` until all retained archives have been re-encrypted or have expired.

## Recovery drills and alerting

- Vercel Cron runs an isolated recovery drill every Sunday at 03:30 UTC (06:30 Moscow) for both workspaces.
- The drill downloads and authenticates the latest encrypted archive, selects up to 240 durable keys while covering every Redis type present, restores them only into hashed `drill:<workspace>:<run-id>:*` keys, verifies type/value/TTL, and then deletes every temporary key.
- Temporary drill keys always receive a 15-minute TTL as a second cleanup boundary. The drill never overwrites Production keys.
- Manual drill: authenticated `POST /api/system/recovery-drill` with `{ "workspace": "zarechie" }` or `{ "workspace": "nkperf" }`.
- Health is fresh for eight days. An explicit drill failure or a check older than ten days raises the overall health state to `error`.
- Backup failures are logged at `error`; recovery failures are logged at `critical`. Both Cron endpoints return HTTP 500 on partial or complete failure so Vercel alerting can detect the incident.
- Every five minutes, authenticated SLO Cron evaluates both workspaces independently. It opens an incident when readiness p95 exceeds 1,500 ms after 20 samples or when at least three ReadySix/readiness-refresh errors occur within ten minutes.
- Webhook incidents are HMAC-SHA256 signed, protected by a distributed delivery lock, deduplicated for six hours, reminded after six hours, and followed by one recovery event when the condition clears.
- Delivery failures return HTTP 502 so Vercel alerting can detect them. New and six-hour reminder incidents emit structured Production `error` logs even when no external webhook is configured; unchanged incidents are deduplicated in Redis.
- Keep the team default Vercel `error`/`critical` alert rule enabled. Configure the optional webhook when an operational channel is selected.

## Roster fast path

- ReadySix roster responses are cached for two minutes in workspace-scoped Redis keys. A validated copy may be used for up to 15 minutes only when ReadySix is temporarily unavailable.
- Concurrent cache misses inside one function instance are coalesced into one upstream request.
- Player lists never embed base64 photos. They return versioned, authenticated `/api/players/photo` URLs, keeping roster JSON small and allowing private immutable browser caching.
- A new photo version changes the URL hash automatically. Photo writes are pipelined and fail explicitly when storage is unavailable.

## Team readiness fast path

- Complete readiness responses are cached for 60 seconds in workspace-, date-, and release-scoped Redis keys. Preview deployments cannot contaminate Production cache entries.
- Once the soft 60-second TTL expires, a validated response is returned immediately as `stale-while-revalidate`; `@vercel/functions` `waitUntil` keeps the invocation alive until the cache refresh completes. This removes periodic cold waits during active coaching without unbounded fire-and-forget work.
- Concurrent misses inside one function instance are coalesced. A validated cached response may be served for no more than five minutes. Refresh failures mark the record as `stale`, emit a structured error, and never extend the hard age boundary.
- `X-Readiness-Cache` reports `hit`, `miss`, `refresh`, `stale-while-revalidate`, or `stale`; `X-Readiness-Cache-Age` reports milliseconds and `Server-Timing` exposes request duration. An authenticated `refresh=1` request forces synchronous recomputation.
- The last 200 raw request durations remain available for deployment warm-up and diagnostics. In parallel, atomic per-minute Redis histograms retain a bounded, environment-scoped rolling 24-hour window across Production releases; Preview and local data remain release-isolated. Two daily hashes cap key growth while a three-day TTL cleans obsolete buckets automatically.
- System Health reports 24-hour p50/p95/p99, average latency, cache-hit and target-violation rates. It raises a warning only after at least 20 samples when more than 5% of requests exceed 1,500 ms. The dashboard explicitly identifies warm-up data versus the full 24-hour rollup.
- Invalid or impossible dates are rejected with HTTP 400, and unknown workspace values are normalized to `zarechie` to prevent cross-workspace reads.

## Known Notes

- Old domain `zarechie-coach.vercel.app` is still owned by the old Vercel team and is not used.
- Permanent production address is `zarechie-sc.vercel.app`.
- OpenAI API billing must stay funded for generation to work.
- ChatGPT Plus/Pro does not fund OpenAI API usage.
- Legacy APIs should not be deleted without a separate decision.
