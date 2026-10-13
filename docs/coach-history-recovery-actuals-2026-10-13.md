# Coach history, recovery and verified missing actuals — 2026-10-13

Both Zarechie and NK Pro use the same implementation. ReadySix remains the only source of current state, symptoms and permission. This package neither introduces a competing readiness score nor changes physician holds, regional adaptation, healthy-region dose, equipment/experience, coach prohibitions or four-confirmed-completion cycles.

## Journal and version comparison

The existing workspace journal now filters by player, action type and Moscow action-date range across the retained 2000 events. Read pages of 50 with a bounded 100-row scan and an opaque cursor tied to exact filters/workspace; newly inserted events do not restart a subsequent page. An expired cursor requests an explicit refresh. The journal also includes coach-confirmed actual-data additions with reason, original execution time and saved revision.

A read-only program comparison selects the player/date and any two available saved editions (current plus up to ten retained versions), either directly or from a publication event. Responses contain prescribed exercise/implement/set/kg/RPE summaries and historical coach decision snapshots, not clinical source text or credentials. Hash identities remain stable across wrapping timestamps. Replacements/implement changes never get an across-variant kg delta. These are comparisons of prescriptions, explicitly distinguished from actual cycle progress. No program restore or publication action is added to this panel.

## Browser recovery

The team review remembers selected chain, mode and expanded state per workspace. Pending group decisions persist locally per workspace/date/chain for 14 days, without credentials, ReadySix responses or execution records. Recovery is explicit, keeps the original decision revision and preserves an ambiguous pending request UUID/body; it never silently rebases onto a newer server decision. Exact local revisions/storage events stop another tab from overwriting a pending copy. Confirmed saves clear only an owned copy. The existing individual decision editor and new missing-actuals form have equivalent explicit local recovery scoped to their player/cycle or player/date. Stale source revisions cannot be restored over updated records. Browser storage failure is visible.

## Missing actuals and progression

“Что не записано” opens an inline coach form for an exact completed strength session. The server independently validates complete execution, exact program and current player log/feedback. Only missing main-movement kg/reps/exercise RPE can be filled; recorded values, skipped/partial status and medical holds cannot be overwritten. Kg are per implement, reps are entered per side where specified, and exercise RPE is mandatory only where absent; session RPE is never invented/substituted. A source/reason is required. Explicit zero kg is a recorded fact, never evidence for an increase.

Additions live in a separate workspace/player/date supplement with immutable base fingerprint, coach actor, confirmation time, revision and up to 20 supplement versions. Original program, player feedback and live log are untouched. A Lua compare-and-set checks all source/alias/program/log/supplement raw editions, then commits supplement + factual-update marker + audit together. An identical ambiguous request replays without extra events; changed content or stale sources fail closed.

Server session history applies a supplement only while every underlying source edition still matches and the original session remains fully completed. Later athlete edits, feedback, undo or program revisions invalidate it. Materialized evidence is explicitly labelled coach_verified, preserves original execution/feedback timestamps and source completion, and never makes an old workout recent. Both team preview and strength generation consume the same fresh exact-exercise evidence; bounded weight/rep progression remains subject to ReadySix context, inventory, coach holds and medical/regional adaptation. The completed-cycle counter still derives its completion from original server execution facts.

After a confirmed addition the team overview reloads and recalculates the proposed next-session kg/reps. Previously saved programs are unchanged. Older unsaved team drafts are blocked at preflight, their review is cleared, and the coach must refresh them. A final atomic publication guard checks the factual-update marker again to reject a change between preflight and save.

## Verification

- 846 tests passed, one existing skip; full application build passed.
- Focused unit/integration coverage: cursor filtering/pagination and Moscow boundaries; scoped read-only version endpoint; local TTL/revisions/ambiguous identity; exact missing-field validation, per-side conversion, original timestamps, zero kg, partial/undo/program change invalidation, aliases/CAS, unchanged raw player facts, strict history joining, and genuinely recalculated bounded progression.
- Local synthetic UI: mode and grouped reasons survived reload; kg/reps/RPE/reason form recovered and cleared after confirmation; missing list and 20→21 kg proposal refreshed; filtered pagination and version comparison rendered in both spaces. Fixture removed before packaging. Original Safari Jelena draft was left open and untouched during these checks.

## Next combined package

1. Show why a supplemented result became stale and offer deliberate reconfirmation of still-missing fields after source changes.
2. Carry verified coach additions into all load analytics with explicit completeness/provenance labels.
3. Improve per-job failure identity and deliberate incident resolution for individual generation, preserving the original technical history.
