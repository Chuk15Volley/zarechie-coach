# ReadySix changes, durable publication and next-cycle team review

Shared implementation for Zarechie and NK Pro. ReadySix remains the clinical source; healthy-region dose, medical holds, prohibited exercises, completed-cycle counting, exact-exercise kg/RPE and existing coach decisions remain binding.

## ReadySix before publication

New generation jobs retain a versioned full digest plus section digests: permission/recommendations, questionnaires/complaints, medical annotations, calendar/court/travel history and coach prohibitions. No medical answers or extra readiness score are retained for the comparison. The existing full digest remains compatible with old jobs; old jobs can be checked for equality, but a changed old job has no invented section history. Missing baselines require regeneration.

“Проверить изменения ReadySix” starts a persisted server check of ready unsaved drafts. Each row shows the checked time and changed sections. Changes clear that exact draft's review; refresh the affected player and review again. A matching check is valid for five minutes, scoped to its exact job. Explicit group publication requires matching fresh checks for all selected reviewed drafts. Every save fetches ReadySix again; a later change blocks saving and explains the affected sections.

## Durable publication

The coach explicitly starts a run with fixed player/job identities. The existing Russian gym worker dispatches persisted work through an authenticated endpoint; closing/reloading the browser does not execute or cancel the run. Progress and per-player outcomes survive process restarts for the queue's seven-day lifetime. Steps are checkpointed before execution and after each row; each dispatch processes at most three rows.

The common save function atomically writes the program, aliases, versions, load history and a publication receipt under the existing reviewed-job/save-conflict guard. The receipt is also retained in the saved record. After an ambiguous response, recovery recognises a matching committed receipt and advances without writing another program/version. Independently saved programs remain conflicts. A new run selects only reviewed, ready, unsaved rows, so retry never repeats committed rows.

Transient row failures have three attempts with backoff; unfinished runs stop after 30 minutes. Committed receipts are reconciled before the deadline is applied. Replaced jobs, revoked review and changed ReadySix are blocked until coach action. Exact queue revisions and the date lease still serialize browser and worker mutations. New queue creation waits for an active check/publication run. Monitoring includes publication pending/error/stall counts without health contents.

## Team review before the next cycle

A main-screen team panel works without selecting a player. It lets the coach choose anterior/posterior/full-body and maintenance/development. Two bounded requests load players concurrently; one unavailable player does not erase the other results, and workspace/date switches discard old responses.

For each player the overview shows current cycle completion from actual execution, completed main sets and completeness of recorded kg/reps/exercise RPE, current ReadySix match/court/travel context, immediate-previous-cycle coach decisions with volume-reduction reasons, and an unsaved main-exercise preview from the shared reviewed catalogue. Incomplete cycles are not skipped. Current matching player feedback is the only source of prospective kg/RPE evidence; newer live edits invalidate older effort reports. Preview generation enforces the same medical hold and regional adaptation and does not save or alter programs/results. The player button opens the existing individual cycle decision editor.

## Validation

Tests cover both workspaces: checkpoint restoration, ambiguous commits and no duplicate writes, fresh and expired checks, ReadySix changes after preflight, section metadata privacy, three-error stopping, deadline recovery of committed rows, auth/workspace/run isolation, next-cycle actual execution/decisions, incomplete histories, medical holds and healthy upper-body dose under calf symptoms. Production checks must use only unsaved real probes or disposable synthetic records; never publish real athlete programs merely to test the feature.

Next package: a durable publication audit with coach/source revisions, an explicit cycle-review completion marker and targeted requests for missing execution data, plus a consolidated coach decision workflow for several players.
