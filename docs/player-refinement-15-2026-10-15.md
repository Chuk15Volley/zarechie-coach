# Athlete app: 15 approved improvements, 15 October 2026

Shared player frontend serves Zarechie and NK Pro. Baseline application efa7e6b.
No generation/methodology, prescribed-session save, log/feedback API persistence,
calendar or result calculations changed. Save checks use fictional local
fixtures; real publication checks only view the two existing player links.

1. Completed server workouts restore server facts and render read-only. No cached-view revision increments or pending/feedback replay on opening. Explicit correction mode exposes only done-set actual inputs, never unmarks completed sets or reopens the workout.
2. Media loading/error/missing states are distinct, bounded and retryable. Exact stored trainer video reads were already correct on the server; the defect was premature/misleading client missing state and swallowed failures. Player media storage failures now return 503 instead of false absence. No video records rewritten.
3. Explicit today/in-progress/completed/early/skipped status and workspace identity. Completed past workouts have no warning suggesting execution again.
4. Separate prescribed target and recorded actuals, including zero weights and exact custom-unit text.
5. One result sheet with draft-local inputs, explicit Save/Cancel/close/Escape. Only Save commits, and already-done corrections retain done flags, original completedAt/order/time. No-op saves do not queue an edit. Marked new pending completed corrections survive navigation; a read-only page can show their values and send only after an explicit recovery action. Field timestamps preserve newer server values.
6. Consistent one-implement weight labels and pair summaries; existing kg and tonnage calculations untouched.
7. Compact original brand/portrait/identity header.
8. One voice toggle per current mode. Date, sound checks, wake lock and offline preparation inside one existing settings disclosure; absent from History.
9. Short cue quotes a sentence from the existing approved exercise description, with full text retained in disclosure.
10. Repetitive coach weight-planning text moves to existing details with a concise athlete-facing prompt. All specific safety warnings remain fully visible; decorative lightning removed.
11. Inline privacy-enhanced YouTube modal with focus/scroll restoration, Escape and original-video fallback. iframe referrerPolicy origin avoids error153 without sending the player token/path. YouTube may still deny an individual embedded video; original link remains available, no replacement of trainer-selected clips.
12. Current exercise position and return-to-current button; block navigation labels include exact completed/total counts. Existing circuit/sequential/rest engines intact.
13. History rows show one formatted date, direction without service suffix duplicates, and factual status. Details retain original prescription and actual records.
14. Aligned fields/cards, tabular numbers, readable supporting type, wrapping rest/safety text, 390px responsive check.
15. Graphite/warm white/jade palette with quiet contours, existing celebration and reduced-motion protection retained. Pending/error/read-only sync states explicit and saved time uses player timezone. Offline check/preparation/failure/unavailable states are separate; video clearly requires internet.

Validation: 1064 passing tests, one existing skip; final local build passed.
Local UI used only four fictional tokens and an in-memory store. Both-space completion
correction and active-set input validated; Cancel produced zero journal/feedback
requests, explicit Save retained completion, rest remained 60 seconds. Tested decimal
kg, custom 3 m/6 assignment, media failure/retry, recovery after immediate navigation,
compact history, modal close/return and 390px/no horizontal overflow.

Production record guard is narrowly scoped: program, journal, actual and feedback
for Perova15Oct and Darya14Oct; only eight hashes, no private record export.
Publication and final verification details are appended after release.

Release reconciliation: publication guard detected a newer independent production
release422f444 while this work was in progress. Merged codex/prevention-courses
7bcd22a, retained exact Low Back/Knee libraries, APIs, player/coach prevention tabs
and independent course records. Resolved player chrome conflicts by keeping the
new single gym settings disclosure and prevention-only tab isolation. No course
methodology or assignment migration is part of this change. Repeated merged tests
and builds before publishing against422f444 instead of the stale efa7e6b baseline.

## Published release and final checks

Published 15 October 2026 at 19:55:00 MSK (16:55:00.225214Z), application
`6aa414b`, image `sha256:04cd480daf0fbeec9c688bdc30b4e00b785e47511670b700631727b219509715`.
Only the existing Russian Gym service was recreated. Runtime secrets, mounts,
transport, Valkey, worker, backup and 1 GiB memory limit were preserved.
Rollback compose is `/srv/readysix-ru-production/apps.private.compose.yaml.before-player15-6aa414b`.
Final container is running with zero restarts.

Merged final tests: 1064 passed, one existing skip. Local and server production
builds passed. Candidate and published smoke checks passed health, auth, storage,
backup/recovery, both player SSR pages, exact trainer video selection and both
48-exercise prevention libraries. No player writes were performed by smoke checks.

Published browser checks in both spaces: existing completed session remains
read-only (Zarechie 22/22, NK Pro 12/12), correct portrait/workspace/date, actual
values shown in correction sheet and Cancel returns without saving, technique
modal/fallback opens and closes, history rows are compact and accurate. NK Pro
390px viewport has no horizontal overflow. Stored videos were not replaced;
YouTube may disable individual embeds, with original-video fallback retained.
Real save transactions were not used for verification; explicit Save/Cancel,
decimal inputs and fast-navigation recovery were validated only on fictional data.

Eight narrowly scoped program/journal/actual/feedback keys for the two reviewed
players have identical hashes before publication, after publication and after
final browser actions. This is not a claim of a global private-record export.
No real programs or results were written, and training methodology was not changed.
Final screenshot: `/private/tmp/gym-player15-production-2026-10-15.jpg`.
Temporary browser tabs were closed and viewport override reset; the user's
existing coach/Safari tabs were retained. Owned candidate container cleaned up.
