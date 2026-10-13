# Team cycle decisions, audit and missing execution facts — 2026-10-13

Applies identically to Zarechie and NK Pro. ReadySix remains the authoritative state/complaints/permission source; no new readiness score, health inference or auto-publication is added. Existing regional adaptations, healthy-region dose, physician holds, exercise prohibitions, equipment/experience and four-completed-session cycles are unchanged.

## Coach workflow

On the main team next-cycle overview, choose the chain, inspect the missing actual-data list and open “Решения по завершённым циклам · группой”. Select players whose latest cycle has four server-confirmed completions. Choose one exact exercise variant per A1/B1/B2 task, keep/rotate, automatic factual progression/hold, normal volume/minus one set. Each movement has an individual mandatory reason; a volume reduction also retains its separate reason. Explicit save commits only selected players and the selected chain, preserving other chains' decisions. Existing individual decision editing remains available.

The batch endpoint re-reads strict server execution history, validates the latest completed cycle, checks each stored decision revision and commits the whole group plus audit events in one Valkey Lua script. No write occurs for a stale revision, partial cycle, missing reason, unavailable history or invalid selection. Validation uses two concurrent readers, at most 30 players, a 45-second pre-commit budget and a 128 KiB body bound. UUID request identity + fixed group/chain manifest + normalized entries recover an ambiguous committed response without adding decisions or audit events. An identical pending request can be retried. Changed membership/content with that id is rejected. The browser preserves inputs on failure, prevents duplicate clicks, cancels detached requests and resets selection on workspace/date/chain changes. “Перечитать решения и снять выбор” explicitly reloads after a version conflict.

## Missing facts

The overview lists date, exact main exercise, set numbers and missing kg/reps/exercise RPE from confirmed cycle executions. Prescribed numbers and overall session RPE never fill missing actual fields. Unloaded symptom adaptations/bodyweight work do not demand external kg; timed targets do not demand rep counts. An empty list distinguishes no facts / load errors from fully populated evidence. Incomplete sessions are not promoted into completed cycles; the coach can open the player to inspect them.

## Audit

Workspace-isolated sorted sets retain the latest 2000 events; the UI reads the newest 50. Start collecting at deployment; older actions are not fabricated. Events include timestamp, player, source revision, exact decision/program version, previous version, before/after normalized coach decisions or prescribed exercise summaries. No ReadySix questionnaire answers, credentials, IPs or full clinical snapshots are copied into the journal. Coach-supplied reasons stay in the same existing Russian storage.

The existing shared trainer access does not identify a person. Signed coach sessions are labelled with an irreversible opaque nonce fingerprint; direct credentials are labelled “общий ключ”. Neither is claimed to be a named coach. Review marks and review actors/events commit together. Background publication retains its coach initiator, exact review evidence and fresh ReadySix-check time rather than attributing it to the worker. Program saves (individual and group), versions, aliases and journal event commit in the same Lua write; repeat save receipts do not add extra events. Individual cycle decisions also append their before/after event inside the existing compare-and-set.

This is a coach operational journal, not tamper-proof legal identity/audit certification. Historical publication runs lacking actor data remain labelled as legacy rather than inferred.

## Validation

- 820 tests passed; one existing skip. Full application build passed.
- Meaningful tests cover both spaces, strict history/auth/date validation, preserved other-chain decisions, per-player reasons, stale/concurrent CAS, ambiguous-response replay, changed group/content, partial completion and storage failure, exact missing-data list, bodyweight adaptation, exercise-vs-session RPE and background initiator/reviewer attribution.
- Disposable localhost UI fixture verified reasons, volume reason, conflict preserving inputs, successful group save and refreshed audit in both spaces. Fixture removed before packaging; no real player decisions or results were changed.

## Following package

1. Workspace/player/date filters and pagination for the audit, with an explicit comparison between selected program versions.
2. Save the trainer's selected chain/mode and pending decision edits locally per workspace, and explicitly recover after reload.
3. Add a focused data-completion workflow for the exact historical session, preserving actual execution timestamps and invalidating dependent progression when a recorded fact changes.
