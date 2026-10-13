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

## Published verification

Published application revision **0e58e73** to https://gym.readysix.app on 2026-10-13 for both spaces. Live image: `sha256:0dab3adff505aa929da9dbd7906f01d5c35bf542a6ab7d7bf016e8aa2bc8b691`. Only gym was recreated. Rollback compose: `/srv/readysix-ru-production/apps.private.compose.yaml.before-coach-operations-0e58e73`, retaining application 827417c / image `sha256:5baf1c622011746f29ecbaa4c00317d715a376b2ba7a79c1cee7d34f3b86c936`.

- Real candidate batch API + strict stored execution history passed in both spaces on disposable synthetic player ids. Real Valkey Lua verified all-group CAS, lost-response replay without extra versions/events, stale individual revision preserving another player, individual decision journaling, ordinary save/alias/version audit and guarded publication receipt/audit atomicity. All exact synthetic keys/events removed afterward.
- Candidate overviews loaded all 15 Zarechie and 3 NK Pro players. Actual day queues generated valid unsaved posterior/development drafts for both spaces; existing programs unchanged. All coach-wide exercise bans preserved.
- Production worker autonomously generated separate unsaved probes and completed durable ReadySix preflight in both spaces. Original queue pointers/drafts restored; no real programs were published by tests. Final audit: healthy worker/storage, zero active incidents, zero pending/failed publication items, authenticated new journal route; no synthetic journal records or fixture route remaining.
- Production browser loaded 15/15 + 3/3 players with zero overview errors. Missing-data/group-decision/journal sections rendered correctly. No new completed cycles were fabricated: real players without four current-cycle completions correctly have no eligible batch editor. Original NK Pro queue restored to 3 ready, 0 reviewed, 0 saved, 0 errors. Existing 11 Zarechie date programs and Safari edits preserved.
- Evidence: `/private/tmp/coach-operations-production-0e58e73.png`; synthetic editor interaction evidence: `/private/tmp/coach-decisions-ui-fixture.png`. Own browser tabs and local dev server closed; temporary candidate removed, rollback images retained.
