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
- `NK_PERF_URL`
- `NK_PERF_API_KEY`
- `OPENAI_API_KEY`
- `YOUTUBE_API_KEY`

Do not commit secret values to GitHub.

## Verification Checklist

Run these checks after env or deploy changes:

- `GET /` returns 200
- `GET /library` returns 200
- `GET /api/players/list` returns Zarechie players
- `GET /api/nkperf/sync` returns NK Performance players
- `GET /api/team/readiness?workspace=zarechie` returns only Zarechie players
- `GET /api/team/readiness?workspace=nkperf` returns only NK Performance players
- Generate warmup on one approved real player
- Generate gym session on one approved real player
- Delete any test session from Redis after testing

## Known Notes

- Old domain `zarechie-coach.vercel.app` is still owned by the old Vercel team and is not used.
- Permanent production address is `zarechie-sc.vercel.app`.
- OpenAI API billing must stay funded for generation to work.
- ChatGPT Plus/Pro does not fund OpenAI API usage.
- Legacy APIs should not be deleted without a separate decision.

