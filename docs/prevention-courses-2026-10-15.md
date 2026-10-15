# Separate PDF prevention courses

User request, 15 October 2026: a separate prevention section in both coach spaces and the existing athlete app. Assign the whole PDF course or a phase. Progress follows actual completion, without dates, weekdays or a prescribed schedule. The coach will manually correct missing video links and inconsistent exercise names inside the app. ReadySix remains the clinical source.

## Imported course

Low Back Resilience, E3 Rehab: all 48 sessions, four phases of twelve sessions, original block order, set/repetition/time ranges, RIR, source pages and existing video annotations. Each session has six required exercises and two optional stretches. The original week/day fields remain provenance only. No fabricated replacement videos or silent alias merging. The last source session retains two differently named variants, seven empty video fields and seven missing coaching cues, exposed for manual editing. The referenced Supplemental Information PDF was not provided. Walking/individual step goals remain described as a separate source-course component; no fixed step target or new readiness questionnaire is introduced.

## Execution

Assignments are separate from dated gym programs and results. A course contains 48 sessions; a phase contains 12. The coach explicitly selects 2–4 main sets, optional stretching with 2–3 sets, a note and rest values. A remains two sets. Each per-side set is confirmed only after both sides. Time ranges retain source bounds; the work timer accepts values inside those bounds and requires an explicit completion mark.

The player marks individual sets, then confirms a completely performed session. Partial work, undo, closing the app, elapsed days and archived assignments never advance the cursor. Finishing opens the next session; the final session completes the assignment. Server-confirmed completion times form the history. Idempotent request receipts, exact cursor/revision checks and Valkey CAS prevent double advancement and stale-device overwrites. Pending ambiguous writes survive reload locally and retry the same request ID. A failed storage response is not treated as successful completion.

Application-added rest defaults (seconds): between exercises A20/B60/C15; between rounds A30/B90/C30; between blocks60; between sides15. These are practical coach-editable defaults, **not values supplied by the PDF**. The final set has no trailing rest. Work/rest timers support pause, restored local countdowns, rest extension and explicit skipping of rest. No calendar scheduling is added. General resistance-training context: [ACSM position stand](https://pubmed.ncbi.nlm.nih.gov/19204579/) describes short rest for local muscular endurance; these exact defaults are an implementation choice for coach review, not a clinical inference from that paper.

## Editing and clinical boundaries

The workspace-scoped PDF library permits manual name, cue, HTTPS YouTube/Vimeo link and default-rest edits with revision guards. Source IDs and original names remain stable. Existing assignments keep snapshots. An explicit “Обновить будущие занятия” refreshes future exercise metadata, preserving completed sessions and the current session when any set has been performed. Existing assignment rest settings remain their own coach-selected values. Closing an assignment preserves all factual history.

Coach API requires the existing authenticated session/key and authoritative roster membership. Athlete API derives identity and workspace exclusively from the existing share token; request-supplied space/player cannot redirect reads or writes. Numeric/WHOOP identities share one scoped record, and restrictions are read across aliases. Automatic red/percentage alone does not suppress explicit reviewed assignment. Existing physician/fever/acute/neurological holds and coach bans remain binding. Source unavailability is shown explicitly, never presented as medical clearance. No added weight is inferred from the PDF or complaints, and no health data is sent to an external model.

All records use existing coach:/nkperf: namespaces and are included in the established encrypted backup scope. No storage/deployment transport, strength policies, gym sessions, execution results or real athlete assignments are migrated or regenerated.

## Validation

Behavioral tests cover all imported sessions, source anomalies, circuit order/rest transitions, partial/undo/final completion, delayed replay, stale devices, phase completion, snapshot-preserving manual fixes, URL/dose validation, API authentication, share-token scope, numeric aliases, concurrent CAS, clinical holds, readiness-red exception, restrictions and separate library editions. Local build and synthetic browser scenarios are checked before release. Production/candidate verification is recorded below when performed.

1048 tests passed, one pre-existing optional local-Valkey skip. Production build passed. Actual built main/athlete browser checks on fictional players confirmed assignment, first-session access without gym programs, partial/reload recovery, committed-but-lost completion replay with exactly one advance, mobile widths320/390/760, manual source edit and explicit future refresh, paused-rest reload/+15s, bilateral execution timer and explicit set confirmation. No browser errors. Large snapshot CAS uses the existing POST pipeline rather than URL arguments; the actual local REST-backed UI caught and verified this transport case.

Russian worker-disabled candidate application `ed41862` passed real Valkey/API checks in both spaces:48-session library, authorization, synthetic share token, incomplete completion rejection, all twelve set marks, one actual session completion, delayed replay, obsolete revision rejection and athlete page without gym sessions. All specifically owned synthetic keys were removed in finally blocks and their absence verified. No real athlete programs, results or assignments were written. The first candidate probe preceded server startup; the subsequent startup-complete probe passed. Final player chrome confines the gym sync badge and undo toast to the gym tab.
