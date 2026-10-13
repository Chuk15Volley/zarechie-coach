# Coach overviews: Today, Week and Load

Status: published as c26efac on gym.readysix.app on 2026-10-13, after explicit approval for source transfer, candidate verification and publication. Based on 4cf8fc1 (release evidence df6977e); shared by zarechie and nkperf.

## Result

- Today has a calm two-column athlete overview (one on phones), four summary tiles, filters for decisions/data/no assigned program, explicit source-quality reasons, and direct player/draft/version navigation. RTP and existing adaptation actions remain under coach decisions; stale/refreshing/failed ReadySix snapshots cannot trigger that automatic adaptation action. No readiness model was added or changed.
- Source issues use existing ReadySix provenance: missing sources, stale source names/dates, stale cache after refresh failure and ongoing revalidation. The UI does not infer freshness from an invented threshold. The overview timestamp is the browser's successful fetch time in Moscow time; source-specific stale badges remain visible independently.
- Load separates factual and planned kg totals and shows the evidence in every day cell. Missing fact is explicit, incomplete weekly totals remain labelled, confirmed coach supplements are identified, and stale supplements require review. No program is distinguished from a known zero. Tonnes no longer carry universal light/working/heavy classifications across different athletes or exercises. Counts/filter concern recorded kg/reps and supplement validity, not a claim that all exercise RPE fields have been audited.
- Week preserves budget/adaptation/rollback logic and exposes ReadySix provenance and factual-load evidence. Future programs without actuals are not flagged as missing fact before their day. Conflict cards link to the correct athlete/date; unsaved current queue drafts can open from empty day cells when exact workspace/player/date match. Existing publication and medical guards remain unchanged.
- Quick links open the correct player and date without saving or applying recommendations. Published, wrong-date and other-space queue rows never become draft shortcuts. The common drafts link scrolls to the existing team-review panel. Navigation opens a new overview at its top instead of retaining the previous screen's deep scroll position.
- Today, Week, Load and status requests have 25-second bounds. HTTP/malformed-data failures are explicit rather than silently replaced by empty success. Today and Week retain a prior successful snapshot after refresh failure and block automatic adaptations until refreshed. Workspace/navigation guards discard outdated replies. Supplemental-fact events refresh Today/Week/Load.

## Validation

- Full suite: 882 tests, 881 passed, one existing skip. Production build passed after final changes; git diff --check passed. Six new regression tests cover source provenance, empty/partial/verified/stale evidence, exact scoped draft selection, both-space read-only requests, source failure stopping the sequence, and week evidence preservation without changing totals.
- Safari on a separate local synthetic API fixture, 15/3 fictional rosters: Today filters and correct player draft, all Week roster entries and evidence, Load plan/fact totals and missing-data filter, selected load cell opens its exact date, shared drafts shortcut lands at the panel with review/save counts unchanged. Both spaces verified. No real credentials, athlete health data or programs used in the fixture; its save counter stayed zero.
- Safari simulated ReadySix 503: Week retained its previous snapshot and reported failure; Today reported failure instead of empty healthy data. Subsequent stale cache was visible per athlete and automatic adaptation stayed disabled; manual refresh recovered after fixture restoration.
- Safari Responsive Design Mode 320x667: readable summary tiles, single-column Today cards, wrapped reasons/buttons, Load summary and contained wide table. New-section top-scroll verified after the final navigation fix. Responsive mode exited after testing.
- Local proof: /private/tmp/coach-overview-safari-final-zarechie.png, /private/tmp/coach-overview-safari-final-nkperf.png, /private/tmp/coach-overview-safari-week-nkperf.png, /private/tmp/coach-overview-safari-mobile-today.png, /private/tmp/coach-overview-safari-mobile-load.png.
- Synthetic proxy/records/failure flags remain outside source in /private/tmp/coach-overview-ui-fixture.mjs and /private/tmp/overview-fixture-flags.json; no fixture API or credential ships in the application.

## Release checks after approval

Build the exact committed source on the existing Russian server. Verify an isolated worker-disabled candidate (no public port): source revision, auth, health/storage, both 15/3 roster identities across readiness/week/load, planned/factual totals/evidence parity, unchanged inventory ladders, queue integrity and new UI bundle/styles. Recreate only gym with rollback to 4cf8fc1. Check production Safari both spaces read-only; do not generate, save, complete, review or publish athlete programs for QA.

## Next improvements

1. A compact review flow for missing exercise kg/reps/RPE, reusing the existing coach-confirmed supplements and mandatory reasons.
2. Exact source timestamps and explanations from ReadySix for calendar, court load and travel, linked to the authoritative data entry.
3. Unified player history and cycle comparison cards, with the coach's decisions and measured outcomes visible together.

## Production release evidence

- Exact archive c26efac built on the existing Russian server with the pinned Node base. Image sha256:826690920976113d0b55753b3d0d7b5df38c4d8bbe483bc94ed8c04898cce3e2. Worker-disabled, read-only candidate had no public port and was removed after verification.
- Candidate and production checks passed: health/storage/auth, new JS/CSS bundle, no fixture route, identical 15/3 roster identities across readiness/list/week/load, exact week/load planned and factual tonnage plus evidence parity (26 Zarechie / 2 NK current-week sessions compared), and both barbell/trap 73-value ladders preserved.
- Only gym recreated. Rollback compose: /srv/readysix-ru-production/apps.private.compose.yaml.before-coach-overviews-c26efac, retaining 4cf8fc1. Runtime transport, secrets and other services preserved. Worker healthy; no pending or failed publication runs. Original NK three drafts remained unsaved/unreviewed; Zarechie old preparation incident remains visible, NK active incidents zero.
- Real production Safari Today/Week/Load checked in both spaces. ReadySix missing-source/revalidation reasons visible, load plan/fact and incomplete weekly totals visible, data filter and shared draft navigation verified. No athlete generation/save/completion/review/publication was performed for QA.
- Production proof: /private/tmp/coach-overviews-production-today-zarechie.png, /private/tmp/coach-overviews-production-week-zarechie.png, /private/tmp/coach-overviews-production-load-zarechie.png and matching NK files.

- Legacy queue observation: the three original NK drafts use `whoop_`-prefixed player IDs while the authoritative roster exposes the corresponding numeric IDs. Exact-ID individual shortcuts deliberately omit those rows; the common queue link works. No identifiers or drafts were rewritten during deployment. Before publishing these old drafts, regenerate against the current roster/inventory; future work should use the existing verified identity alias mechanism for legacy read-only navigation.
- Safari restored to Zarechie gym home on 13 October. ReadySix tab and its in-progress form were not reloaded or changed.
