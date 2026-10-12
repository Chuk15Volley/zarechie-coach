# Team day strength generation repair — 2026-10-12

Applies to zarechie and nkperf, including the selected 2026-10-13 posterior-chain development session.

## Failure and correction

The asynchronous server correctly returned HTTP 200, status done, a valid strength_training_draft and autoSaved false. The team client accepted other coach-review drafts but omitted strength_training_draft, incorrectly reporting every successful strength result as an error. The primary day result list also hid the server message and offered no way to open the draft.

The shared client now recognizes all four coach-review draft kinds. Ready strength drafts count as prepared and can be opened from the team day result list; ordinary failed autosaves remain errors. Strength drafts still require coach review and explicit saving. ReadySix restrictions, exercise selection, regional dose, equipment settings, medical safeguards and saved athlete programs are unchanged.

## Queue resilience

- Three concurrent players; one failure does not stop the others.
- Capture workspace/date/method at submission. Changing workspace/date or closing the batch aborts polling and prevents stale updates or further submissions. Already accepted server jobs may finish.
- Poll immediately, with a 45-second request deadline and bounded recovery for transport errors and HTTP 429/502/503/504. Respect Retry-After; long deferrals remain available for manual resumption.
- Retry polling an existing job after exhausted transient errors or polling timeout. Never automatically replay an ambiguous submission. Terminal generation failures may be explicitly regenerated.
- Show the actual failure message and offer retry for failed players. Draft opening uses its original workspace/date.

## Verification

Full suite: 763 passed, one skipped (764 tests total). Final webpack production build and diff whitespace check passed.

Nine dedicated client tests cover both spaces with ten strength drafts each on 13 October, accepted draft kinds, real autosave failures, temporary status failures, Retry-After, resuming existing jobs, terminal errors, one-player failure, maximum concurrency, captured date and cancellation.

The actual daily input builder and asynchronous API handlers additionally run two ten-player teams through the actual client, alongside the existing 24 generation scenarios (44 fixture scenarios total). Storage and ReadySix transport are synthetic; no external model or real athlete results are involved.

Native Safari checked the actual result component and queue in a disposable local fixture: ten prepared, zero errors in each workspace, including a recovered temporary 503 and opening a strength draft. Screenshot: /private/tmp/team-day-fix-ui.png. Fixture removed before the final build.

A separate authenticated production reproduction for a selected athlete on 13 October confirmed HTTP 200 submission and done/valid strength draft with autoSaved false. This generated a review draft only; saved athlete plans and performed results were not edited.

## Follow-up work

1. Restore a team queue after browser reload without creating duplicate jobs; show pending/ready/failed separately and retain submission context.
2. Add a team review screen with anterior/posterior overlap, regional adaptations, missing data and explicit coach approval of selected drafts.
3. Extend deployment checks to the browser client contract, partial-team failures, slow ReadySix responses and expired tasks; add privacy-safe error monitoring.

## Production release

Application revision ede55bb published on 2026-10-12 at gym.readysix.app for both spaces in response to the coach's request to repair the live Safari team-generation failure. Image sha256:09d43d3ee6bc893f1a4c43dae0be973293ea6b59f81abc74e1dfcb023656a8a3. Exact source archive built with the existing pinned Node digest in /srv/readysix-gym-build/team-day-fix-ede55bb. Only gym recreated; rollback to 1a81bce retained in /srv/readysix-ru-production/apps.private.compose.yaml.before-team-day-fix-ede55bb.

Candidate checked authentication, Valkey health, the served client assets, actual asynchronous posterior-chain development generation for 13 October and draft opening in both spaces using the reviewed client helper. Saved programs remained identical. The first asset probe was adjusted for the minifier's escaped middle dot; application source did not change. One NK Pro submission returned a transient generic 503; a separate unsaved synchronous diagnosis succeeded, then a full candidate pass succeeded for both spaces. The underlying transient cause was not established; ambiguous submissions are intentionally not automatically replayed.

Production authenticated health, public HTTPS, rejected unauthenticated access and cycle review/comparison passed for both spaces. The original ten Zarechie players were selected again in native Safari on 13 October, development/posterior chain. All ten completed as prepared drafts, zero errors. The actual generated strength draft opened from the team result button. Screenshot /private/tmp/team-day-fix-production.png. A saved-program hash comparison for all 18 roster entries across both spaces confirmed no saved programs on that date changed. No athlete performance logs were edited. The coach remains responsible for reviewing and saving the generated drafts.
