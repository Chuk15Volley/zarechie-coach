# Team day queue, coach review and generation monitoring — 2026-10-12

Applies to both `zarechie` and `nkperf`. ReadySix remains the source of player state, symptoms and medical restrictions; no new readiness questionnaire or automatic clinical clearance is introduced.

## Queue contract

- Coach/date/workspace-scoped manifests live in the existing isolated Valkey for seven days. Each player receives a reserved job ID before any generation call. Requests use the manifest's method/date/chain, manual selection and `autoSave:false`.
- Submissions are idempotent by reserved job ID. A 90-second preparation lease prevents concurrent tabs from preparing the same player twice. Expired preparation can be re-entered once automatically with the same identity; further failure remains visible and requires coach retry. Model/provider polling retains its existing locks.
- Reload recovers the latest queue for the selected date and resumes queued/pending jobs. A local hint stores only queue ID/date per workspace, restoring the previous queue date on initial entry unless an explicit assigned date is present. Browser closure pauses remaining work until reopening; this stage does not introduce an independent background worker.
- Failed player retry uses a new reserved ID with compare-and-set; successful neighbours are reused. Network ambiguity resumes existing work. An unfinished queue cannot be replaced by another queue for the same workspace/date. A completed queue may be replaced; earlier queues remain available by ID until expiry.
- Existing single-player API behaviour and legacy one-hour job retention are preserved. Team jobs retain results for seven days, never auto-publish. Saved programs and athlete workout logs are not regenerated.

## Common review

The workout screen shows the team queue even without a selected player. Filters expose all/ready/unreviewed/failed rows, exact exercise/set/weight previews, medical warnings and individual opening. `Проверено тренером` persists separately from saving. A saved badge requires matching queue-job lineage, not merely another program on the same date. Opening uses the selected job's record (or its saved edited version), never a newer unrelated draft. The individual editor remains the publication path.

## Monitoring

Authenticated submit/poll instrumentation records allowlisted outcome codes, job identity, phase, duration and HTTP status in the current workspace. It never records symptoms, prompts, questionnaires, names or free-text errors. Duplicate phase/code/job events are suppressed for 24 hours (ready results deduplicate across submit/poll); immediate server results are recorded before browser polling, and page closure/reload cancels local work without reporting an incidental network failure; the last 500 events are retained for 14 days. The screen shows counts for the last 24 hours within that bounded sample. Temporary client connection interruptions and recovery are reported only for a job belonging to that queue. The system health screen includes the same summary. Historical failures continue to appear as failures for their time window, even after recovery; this is not an unresolved-alert counter. No external notification or recurring automation is added.

## Coach prohibitions

Globally prohibit `Supine Glute Set`, `Supine Diaphragmatic Breathing` and `Side-Lying Short-Lever Adductor Raise`, including spelling variants and alternatives. Existing bans (including Machine Hamstring Curl) remain. The manual replacement library also excludes the shared banned exercises. The reviewed strength catalogue uses existing unloaded clamshell/hip abduction/bent-knee march options in affected regional tasks. Healthy upper-body dose is preserved; no loaded exercise is introduced for a painful region.

## Verification

- 774 tests: 773 passed, one existing skip. Production webpack build passed.
- Both-space API fixtures cover lost submission response, canonical request snapshot, concurrent submissions/manifest creation, expired preparation recovery, seven-day retention, scoped retry/review, exact record opening, saved-lineage badges and metadata-only monitoring.
- Additional structured calf-symptom tests cover all chain/mode combinations in both spaces, unloaded affected tasks and unchanged healthy upper-body sets/RPE. Shared bans cover alternatives and bank/custom manual replacement entries.
- Browser fixture used the actual hook and review/monitor components with disposable synthetic storage. Reload during preparation kept three existing jobs, then prepared the fourth; one failed row alone was retried (five total preparations for four final results). Review persisted across reload. NK Pro independently restored its four tasks, with no duplicate preparations. Screenshot: `/private/tmp/team-queue-nkperf-fixture.png`. The fixture was removed before the build.
- Safari was in active coach use during this stage; its unsaved editor was left untouched. UI fixture verification continued in a separate in-app browser.

## Next grouped stages

1. Server worker, explicit pause/cancel and queue expiry/archive management, preserving idempotency and workspace separation.
2. Batch review improvements: compare team foundation versus individual changes, show stale ReadySix inputs and allow deliberate checked-program publication with final validation.
3. Generation operations: latency/error thresholds, distinguish recovered from unresolved incidents, and add authorised notification routing only if requested.
4. Training follow-through: missed/partial execution reasons, dose adherence and a factual cycle summary joining coach decisions with actual kg/reps/RPE.

## Production release

Published application revision **95f0c2d** at gym.readysix.app for both spaces. Image `sha256:bf304b5f9e29fb5103c1f6058759902b367b6a12792dcdfedd116372d7893b6a`; only the gym service was recreated. Compose rollback snapshots remain for ede55bb → 8c703df → 37bdc85 → 95f0c2d; the immediate prior snapshot is `/srv/readysix-ru-production/apps.private.compose.yaml.before-team-queue-95f0c2d`. Existing secrets, networks, read-only production filesystem and isolated storage were preserved.

All exact server candidates passed real, unsaved strength generation on 2026-10-13 in both spaces, idempotent resubmission, latest-queue recovery, exact draft opening, seven-day job TTL, shared library bans and metadata-only monitoring. Saved programs of the probed players were equal before/after. Candidate fixtures restored their previous latest pointer/draft conditionally and removed only their own queue/job keys. One initial probe of the final candidate arrived before its HTTP listener was ready; rerun after startup passed.

Production HTTPS, authenticated/unauthenticated queue/monitor/health endpoints and the existing cycle-review endpoint passed for both workspaces. The disposable browser route is absent (404). The real NK Pro roster of three was generated as unsaved drafts on 13 October, with reload during preparation. Final replay of 95f0c2d: three ready, zero errors, zero reviewed, zero saved; each ready outcome appeared exactly once, with no NETWORK_INTERRUPTED/POLL_TIMEOUT event on those three jobs. An individual queue draft opened in the existing editor. No coach review marks or athlete execution logs were fabricated.

Production replay exposed two telemetry refinements during the release: immediate results needed counting before polling, and canceled requests could report a network error before `pagehide`. Ready outcomes now deduplicate across submit/poll; local work cancels on `beforeunload` as well as `pagehide`, and interruption reports wait briefly and recheck the current visible, un-aborted context. Earlier reload interruption events remain visible in the 24-hour historical journal; they are not current queue errors. Inactive candidate containers were removed after the final verification. Screenshot: `/private/tmp/team-queue-production-95f0c2d.png`.
