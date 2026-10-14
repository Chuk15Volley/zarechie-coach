# Twelve faster coach workflows — 2026-10-15

Scope: both coach workspaces only, preserving the theme, block locations, methodology and saved programs/results. No athlete page/component/style/app-shell change. No generation, save, readiness, clinical, copy, timer or actual-result API is changed. Explicit user request also covers alignment and density of existing coach cards/dialogs.

1. Discovery-only locomotion facet and stable replacement ranking by named task, movement and known implement; eight initial candidates, more available. Canonical IDs, variants, source catalogue, prohibitions and clinical eligibility are retained. No automatic replacement. Empty-search Enter no longer applies the first arbitrary candidate. Picker cache v2 prevents an old Other filter from masking the new locomotion facet.
2. Existing previous/next controls now traverse saved rows separately from unsaved drafts, within exact workspace/date. Dirty saved corrections disable traversal until explicit save/undo; in-flight save and completed-program guards remain.
3. Existing validation strip links to weak technique and confirmed missing video as well as invalid planned inputs. Links unfold the block and focus the exact description/video field; source text is not rewritten. Video absence is reported only after bounded manual-video lookup (or a known bank video), scoped to player/date/name. Lookup failure is not reported as missing video.
4. Completed queues open Saved automatically; explicit empty/error filters remain available. One saved counter, no repeated complete counts.
5. Single-set exercises omit the redundant apply-all controls; direct count/set/unit controls remain in their existing position.
6. Remove redundant per-implement explanatory prose and exact duplicate RPE comment; retain meaningful ranges, conflicts, all non-RPE load notes and numeric values.
7. One missing-video label, URL field and explicit save; redundant meta/form labels omitted. Existing 260/220 px video, enlargement, pin, retry, preview and manual-save semantics retained.
8. History shows one completion status; nonzero kg/reps/RPE gaps only. Stale-source warnings and actual partial/completed records remain. Fact completion requirements unchanged.
9. Week omits redundant missing-fact prose for unperformed sessions, retains known/partial/completed facts, source details and all conflicts.
10. Today decision/data counters, load fact-gap counter, history missing-facts counter and week conflict counter activate their existing exact filters without mutating state at the server.
11. LIVE has a separate Currently Training filter, excluding waiting/completed/ended-early players. Attention filter remains available and composes with it. Filters reset per workspace; empty results are explicit.
12. Coach system summary separates historic journal errors from current service/history/latency/generation/latest SLO problems. API status, telemetry, journal and incident resolution are untouched.

Finishing: consistent padding/gaps, aligned headers/actions and numerical fields, compact two-value history dose, top-aligned table cells, same typography in coach overlay dialogs. Coach-only selectors and dedicated overlay class preserve athlete styles and all existing theme/grid/video choices. No fixed card height introduced. Desktop and phone will be checked before publication.

Validation so far: 979 tests (978 passed, one existing skip), local production build. Fictional browser both spaces: save-next, completion auto-Saved, saved carousel, decimal-comma kg, single-set bulk hiding, dirty traversal lock/undo, exact technique/video focus and 503 save failure/retry with edits retained. No real program/result writes used for QA.
