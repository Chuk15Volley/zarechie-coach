# Strength facts, reconfirmation and generation recovery

Both spaces use the same implementation. ReadySix remains authoritative for readiness, symptoms, court/match/travel context. No real player programs or execution records are rewritten by this migration.

## Source provenance and explicit reconfirmation

New coach supplements store SHA-256 fingerprints for the original program, player feedback and progress log independently, plus exact exercise/block/code/implement-count/target-set signatures. Any original-source change invalidates the supplement. The coach sees the changed source(s), the previous values and whether each is eligible for reuse. Reuse is opt-in per field, with a reason and a separate acknowledgment that unselected previous additions are dropped. A changed variant, implement count or target layout requires fresh entry rather than an automatic carry. Already recorded source values cannot be overwritten. A coach can explicitly discard obsolete additions by reconfirming the current sources without carrying any previous patches.

Undo, skip, medical hold or incomplete execution disables reconfirmation; the form explains why. The team overview lists stale supplements even when they no longer appear among completed-cycle missing facts. Original completion timestamps are retained. A separate supplement revision/history and coach audit event record the previous revision, stale reasons and chosen fields. Source/alias CAS, idempotency, local edit recovery and the publication factual-change marker remain active.

Legacy version-1 supplements still apply when their original combined fingerprint matches. Once stale, their exact changed source and old exercise mapping cannot be reconstructed; they show that limitation and require fresh input. Their original idempotent requests remain compatible.

## Consistent factual load

A shared server reader resolves numeric/WHOOP aliases to one newest saved program per date and joins only that edition's own feedback, log and supplement. Actual strength tonnage uses completed sets with recorded kilograms and recorded repetitions; it multiplies per-side repetitions and implement counts once. It never uses planned repetitions to fill factual gaps. A current log can remove undone/skipped sets even when an older feedback/cache still contains them. Unknown or partial actual data are exposed in load metadata.

Consumers: individual session tonnage/history, team tonnage, weekly load/budget plan-fact, daily team plan-fact, athlete session detail, gym EWMA load chart and exact-exercise weight sparklines. Planned tonnage is returned separately. Bodyweight/adapted or timed work does not acquire fictitious loaded-repetition tonnage. Coach supplement confirmation triggers an in-page refresh of affected charts/history. ReadySix court sRPE charts remain separate.

## Generation incidents

Individual submit/result events now share an opaque hash of the same generation inputs, including space, player, day, method/mode/chain and coach instructions. Failed preparation persists a scoped job and returns its ID. A later successfully prepared result in that exact family resolves the earlier failure while retaining the event and showing the successful attempt/time. Team retries retain their explicit supersession chain. Changed inputs, another player/day/space, an older success and a quality/medical-review result do not establish successful recovery. Connection recovery alone only resolves connection/poll-timeout incidents.

Old events without a failed job or input identity remain unlinked; an unrelated nearby success must not silently close them. Monitor statistics remain bounded to the last 500 events and 24-hour incident window.

## Validation

Local: 858 passing tests, one pre-existing skipped test; production build passed. New behavioral coverage exercises stale provenance, explicit/partial/no-carry reconfirmation, source and alias CAS, undo, kg/reps and implement accounting, all main chart endpoints, exact retry recovery and legacy unlinked events for both spaces. Synthetic UI checks verified both spaces, individual field selection, acknowledgment/reason, successful save, resolution evidence and completion-undo lockout.

Server candidate and deployment results are recorded after verification. Rollback retains the previous image and compose file.

## Next package

1. Show completeness of actual kg/reps/RPE beside cycle comparisons, with drill-down from every load point to its original source and coach confirmation.
2. Add cross-tab refresh notifications for factual changes and scoped coach review of historical generation incidents whose old attempt identity is missing.
3. Add a pre-publication team checklist combining incomplete facts, regional adaptations, current ReadySix changes and inventory/progression limits, with selective regeneration of affected drafts.

## Production verification

Published application revision `4d7a106`, image `sha256:0f94c6313eca52ccf1cccd95e8d36beeb71e8e7719b18f4afb24971d3f9f7d63`. Candidate verified original-source CAS/reconfirmation/replay, actual-history + daily team + EWMA tonnage agreement, individual failure/success recovery, audit pagination/version comparison and real publication-marker race guard using disposable synthetic identities in both spaces. All 18 roster players' next-cycle overviews and one unsaved day-generation check per space passed; existing saved programs were preserved. Synthetic records/events were cleaned and original queue pointers/drafts restored.

Only the gym container was recreated. Production storage read/write and worker checks passed; no pending/failed publication. Original NK queue remains three unsaved ready rows; Zarechie has no day queue. One historical Zarechie preparation failure has no original failed-job/input linkage and remains explicitly unlinked, rather than being closed by an unrelated success. NK has no active incidents. Rollback compose: `/srv/readysix-ru-production/apps.private.compose.yaml.before-strength-facts-4d7a106` (previous `d608677` image). Temporary candidate removed after verification.

## Immediate client-render correction

A Safari audit after publication exposed a client-render failure on returning to the main page: the new facts-refresh effect evaluated its `workspace` dependency before the state declaration. API/build/isolated-component checks did not execute the authenticated main component and missed this error. Production was immediately rolled back to `d608677`. The effect is now after the workspace declaration. The actual production build was tested through local synthetic authentication in the browser: the full main page mounted successfully (with expected unavailable external data in the isolated local runtime). All 858 tests and the production build passed again. The corrected candidate must receive an authenticated full-page browser check as part of the final production verification.

Corrected revision `a815f6b` published with image `sha256:2fdaca7460b5f713cfb5f39b91f3b4879461a58a5234eff74724b69eda7f79ca`. The full candidate checks passed again for both spaces, followed by production worker/storage/publication checks. Authenticated Safari reload confirmed the actual main page mounts successfully after publication. Rollback: `/srv/readysix-ru-production/apps.private.compose.yaml.before-strength-facts-a815f6b`, preserving `d608677`. Temporary candidate and local UI server removed/stopped. Real player feedback arriving during the audit was observed read-only and was not rewritten.
