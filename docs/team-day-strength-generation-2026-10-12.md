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
