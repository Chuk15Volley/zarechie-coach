# Fact periods, team completeness and legacy-link completion — 2026-10-14

## Requested scope

Both workspaces: graph date periods, team overview of missing factual kg/repetitions/exercise RPE, direct links to their exact input fields and accessory strength charts. Fresh opening must use the current Moscow calendar date. Investigate Voronkova's completed 14-Oct workout without manufacturing completion or overwriting athlete facts.

## Implementation

- Shared period controls: 28/90/180 days and explicit inclusive dates, at most 366 days. Player history defaults to 90, team tasks to 28. History reads the whole selected period in bounded pages, with cancellation, response-scope guards and a 25-second total deadline. Incomplete indexed records produce an explicit error rather than a silently truncated chart.
- Team tasks use the authoritative workspace roster and bounded date indexes. The endpoint distinguishes awaiting completion, missing eligible fields and stale supplements; source failure never becomes an empty success. It returns exact exercise/set/field targets, not health information or invented performance values.
- Team and chart links open the correct player/date and focus the exact missing input after server validation. Moving between fields in one day's focused editor preserves current typing. Existing local recovery, mandatory reason, completion rules, missing-only validation, reconfirmation and atomic source checks remain in force.
- Strength history charts and supplementation now include accessory exercises. Series remain isolated by exact slot/name/chain, implement count and per-side units. Timed work never becomes repetitions, inapplicable unloaded kg cannot be filled, missing observations stay gaps, recorded zero is preserved, session RPE never substitutes for exercise RPE. Cycle charts retain their established main-movement scope.
- Opening and workspace switches use today's Moscow date. A recovered queue from an older date is offered explicitly; it no longer silently changes the opening date. On day rollover, a blank coach view updates when Safari returns; an open program/history/editor is preserved.
- Shared `selectGymEdition` chooses the newest program edition, then the newest fresh original athlete evidence only among identical mirrored editions. It never combines different editions or mutates stored records. Gym load, history, strength progression/cycles and supplement source selection use the same policy. Supplement CAS protects every numeric/WHOOP alias, including a concurrent undo on the other alias.
- Coach program status and history expose verified completion for all workout methods. Team status reads original evidence/feedback from the selected owner. Repeated manual completion is refused for already confirmed workouts; its legacy write endpoint still has a read-before-write check rather than a new full atomic-write protocol.

## Confirmed Voronkova cause

Read-only production inspection: numeric ReadySix ID and the historical WHOOP link had the same latest saved 14-Oct program, but the numeric copy had no log/actual. The legacy owner retained all 37 expected completed set keys and matching feedback for all 13 exercises. The log completed at `2026-10-14T03:03:30.671Z` (06:03 Moscow); feedback was saved at `03:03:48.971Z`.

The old equal-edition selection preferred the numeric mirror and omitted execution. The new selection, run read-only against those exact server records, selected the legacy owner and confirmed 37 planned sets / full completion. No program, log, result, token or coach decision was written. The latest user-edited program is authoritative; older 35-set snapshots must not be used as a baseline.

## Validation and release status

- 910 tests: 909 passed, one existing skip. Added period/date validation, accessory/per-side supplement/chart targets, both-space mirrored completion/undo/edition isolation, team scope/auth/source failure, current-date queue recovery, repeat-completion protection, execution endpoint and incomplete history checks. Atomic supplement races against the other alias are checked in both workspaces.
- Final production webpack build and whitespace checks passed. The 25 targeted period/completion/fact-recovery checks also passed.
- Safari QA is pending: the Mac was locked and the native UI tool could not unlock it. A separate localhost fixture is prepared with fictional 15/3 rosters, old queue metadata, period-separated history, accessory gaps and completion. Original real Safari tabs must remain untouched.
- Nothing transferred or published. Production remains `510a44b`. New source-transfer/candidate/publication approval is required only after final candidate validation. Server checks must compare raw storage fingerprints; API display fingerprints are expected to change when previously omitted legacy execution/accessories become visible.

## Next grouped work

1. Finish Safari desktop/320px validation in both spaces, then publish the exact approved candidate and verify Voronkova's completion/old link, team tasks and unchanged raw data.
2. Make fact completeness visible in Today/Week, with a single route to unresolved fields and reconfirmations; retain separate awaiting-execution counts.
3. Add coach-approved exact-variant videos and premium library/substitution browsing; preserve all bans and rationale/history.
4. Evaluate period/cycle outcomes only where exact exercise, dose and actual units are comparable, with explicit uncertainty for insufficient facts.
