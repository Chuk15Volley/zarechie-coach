# Bounded background queues and independent player refresh

Applies equally to Zarechie and NK Pro. No changes to clinical policy, prescribed regional dose, cycles, saved programs or athlete execution logs.

## Runtime policy

A background task has at most 15 minutes of active processing, 30 minutes waiting for its first submission, five consecutive temporary HTTP failures, and 80 worker requests. Paused time is excluded using a persisted queue clock. HTTP worker requests already have a 65-second timeout; coach queue reads now time out after 20 seconds and mutations after 120 seconds. A client timeout does not replay a write: the coach is asked to reload because the server may have committed it.

Temporary failures use a bounded backoff, honoring Retry-After up to 10 minutes. Terminal request errors and exhausted budgets require an explicit retry. Successful completed jobs remain readable even if a late completion follows the stop. An explicit retry allocates a fresh scoped job and fresh budget, preserving the old job's lineage.

## Coach review

“Обновить черновик игрока” refreshes only the selected completed or stopped unsaved player. It resets that player's review/publication result, keeps neighbouring jobs unchanged and never overwrites a saved program. Saved programs are edited through the individual editor. A new draft must be reviewed again before group publication and still passes the existing fresh ReadySix comparison and save conflict guard.

Monitoring now inspects pending runtime state as well as historical incidents: no progress for three active minutes, budget stops, missing worker heartbeat and worker tick failures. Runtime/event metadata has no questionnaire or complaint contents. A new processing phase clears a stall; a successful retry clears linked technical incidents. The retained watch index is separate from the runnable queue index, so stopped tasks remain visible.

## Concurrency

Mutations require an exact queue revision and acquire a per-workspace/date lease shared with queue creation. Claiming the revision before writes invalidates stale tabs even after a partially failed action. The lease is renewed during long publication requests. Creating a replacement from the current client checks both the latest queue identity and revision. Conflicts return the current view for coach review; they are never automatically replayed.

The browser uses a synchronous mutation gate and request epochs. Older polling responses, responses from an unmounted workspace/date and duplicate clicks cannot replace current state. Reads follow the latest queue for the selected date. Cross-tab storage events trigger a refresh without carrying clinical data.

Every team result writes the shared player draft through an atomic Valkey check of current job identity and latest queue identity. Superseded in-flight results may remain in their own job history but cannot replace the current player draft.

## Validation

Automated checks cover both spaces: stale and concurrent mutations, independent refresh and saved-program protection, obsolete draft writes, five-error stop, wait/processing/request limits, pause timing, worker outage/stall monitoring, bounded client HTTP waits and response ordering. Production verification must use unsaved/disposable probes and preserve existing programs and coach edits.

Next package: show what changed in ReadySix before publication, persist group-publication progress and per-player retry, and add a combined coach review of cycle progress and actual load.
