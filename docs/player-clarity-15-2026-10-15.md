# Player clarity: 15 approved improvements, 15 October 2026

Baseline application 6aa414b, source 4a18463. Shared player frontend serves
Zarechie and NK Pro. Only player presentation, local form/navigation state and
tests changed. No program/result persistence API, training generation, clinical
policy, rest/order engine, prevention course or actual-volume calculation changed.

1. Generic historical weight-planning instructions ask the athlete to clarify kg
   only when the existing exercise policy requires an external load. For other
   exercises that generic label is omitted; bodyweight is never inferred. Full
   original notes remain in the existing details.
2. Short cues quote complete original sentences; semicolons no longer cut the
   action in half. Source instructions and safety warnings remain unchanged.
3. A recorded feedback result suppresses the stale invitation to rate it again.
   The existing confirmation and explicit edit action remain.
4. Completed cards compare set number, plan and fact in aligned compact rows.
   Actual values/custom units and skipped/not-done states remain factual.
5. One-implement kg and pair identity are consistent in prescription, inputs,
   comparison, factual disclosure and summary. Decimal comma is a display/input
   normalization only; no stored record rewrite or tonnage change.
6. Explicit per-set correction opens directly from the fact row. Completion is
   never removed; Save remains the only commit action and Cancel/close/Escape
   discard local inputs. Immutable custom prescriptions do not get a fake editor.
7. Completed-result Save is disabled until editable input changes. Equivalent
   decimal spellings do not count as edits and do not stamp an unchanged weight.
8. Existing video modal adds its exact prescription, original short cue and
   existing safety warning. Original clip, fallback, focus/scroll and privacy
   behavior remain; no video catalogue changes.
9. Offline copy status distinguishes not prepared, unavailable, stale, failed,
   checking/preparing and verified ready. Video still requires internet.
10. History has month/year headings without filters or reordered records.
11. Returning from details restores the clicked row, focus and scroll position.
    State stays local to the current player/page; stale detail reads are ignored.
12. Open-today link is absent when already on today's program.
13. Mobile tabs keep one-line labels and compact history count, with full
    accessible labels preserved.
14. Supporting dates/rest/cues have stronger contrast; aligned numbers and
    restrained graphite/jade palette remain, including reduced-motion behavior.
15. Repeated fixed footer branding and normal read-only/saved badge are removed.
    The sticky progress badge remains; pending/error/offline alerts retain the
    persistent footer. Splash uses the same Russian product label.

Validation: 1069 tests passed, one existing skip. Local production build passed.
Fictional in-memory records only: both-space direct correction, disabled no-op
Save, Cancel zero journal/feedback/other writes, two explicit Save transactions
preserve done flags, completedAt, startedAt and elapsed time. History month
groups and return scroll/focus passed (870px before/after). Mobile 390px NK Pro
comparison rows have no horizontal overflow. Video context and full original
warning passed. Final compiled UI and production checks follow before release.

Production protection is narrowly scoped to eight program/journal/actual/feedback
keys for the two reviewed players, with hashes only and no private export.
Real browser verification will use read-only views and Cancel, never Save.
