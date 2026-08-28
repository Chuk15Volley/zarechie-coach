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
- `TRAINER_API_KEY`
- `SESSION_SECRET` (случайная строка не короче 32 символов)
- `BACKUP_ENCRYPTION_KEY` (отдельный случайный секрет не короче 32 символов; не менять без процедуры ротации архивов)
- `CRON_SECRET` (случайный секрет авторизации Vercel Cron)
- `NK_PERF_URL`
- `NK_PERF_API_KEY`
- `OPENAI_API_KEY`

Do not commit secret values to GitHub.

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

## Known Notes

- Old domain `zarechie-coach.vercel.app` is still owned by the old Vercel team and is not used.
- Permanent production address is `zarechie-sc.vercel.app`.
- OpenAI API billing must stay funded for generation to work.
- ChatGPT Plus/Pro does not fund OpenAI API usage.
- Legacy APIs should not be deleted without a separate decision.
