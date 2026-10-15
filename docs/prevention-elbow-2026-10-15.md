# Tennis Elbow prevention courses

User request: import only the supplied Tennis Elbow PDF into a separate body region, with whole-course or individual-phase assignments, completion-driven advancement and no schedule. The four existing Low Back/Knee/Shoulder programs remain available. Current source incorporates the latest live player changes 90598c1 and its documentation b76b8ca.

## Source and mapping

E3 Rehab, 59-page Tennis Elbow.pdf. All 52 source templates / 216 exercise rows imported: Daily Routine (page33, four two-exercise phases); Dumbbell Basic (pages37–38, 12 two-exercise sessions); Band Basic (pages40–41, 12 two-exercise sessions); Dumbbell Comprehensive (pages45–48, 12 sessions / 80 rows); Band Comprehensive (pages50–53, 12 sessions / 80 rows). Names, set/repetition/time ranges, RPE/RIR, rests, original English cues, source pages/days and all 216 video annotations are retained. Russian technique cues are additive. Hyperlinks are matched to the exercise-name table cell; each match must have exactly one URL. Rendered pages33/37/45/51 visually checked. A layout example on page35 is not imported as another workout.

One new region «Локоть» offers five separately assignable programs. Each strength variant has four phases, with three source session types repeated for four cycles: 12 completions per phase, 48 per course. Days/weeks identify source templates; no date/frequency gate, missed slot, automatic completion or calendar-based advancement is created. Original three-per-week / recovery advice stays explanatory. Dumbbell and band variants are alternatives, not a combined eight-phase course.

Daily Routine has its own independent assignment and progress. One completion means both source exercises, one set each. The source's three times daily for four weeks maps explicitly to 84 actual short completions per phase, 336 per whole course; the application does not require three per calendar day. Source Basic calls for Daily Routine in addition to strength work; its visible warning/guidance tells the coach to assign the companion separately. It is optional for Comprehensive. No Daily Routine completion counts toward a strength session, and its phase selection remains explicit.

## Doses, pauses and execution

Basic: both exercise groups required, 3–4 coach-selected sets, all A sets before B. Comprehensive: both W/U rows retained with unique W1/W2 execution keys (original W/U labels preserved), 1–2 preparation sets, main A–D groups mandatory at 3–4 sets. A1/A2 are paired; single-exercise B/C/D groups finish their sets before moving on. Source-range prescription now accepts the course's preparation range rather than assuming 2–3; existing Shoulder doses and assignment signatures remain unchanged. Fixed one-set Daily Routine has no misleading set selector. Re-selecting the same program is a no-op.

Source strength rests are exactly 120 seconds, including block transitions. Unspecified warmup/Daily Routine pauses default to editable 30 seconds; side changes to editable15 seconds. No rest follows the last set. Coach pause help uses the selected course's own explanation. Slow eccentric lowering at three seconds per repetition stays a repetition/tempo instruction and never becomes a three-second work timer. Isometric 30–45-second holds retain their work timer; RPE7–9 is distinct from RIR. No weights/1RM/automatic progression inferred.

Existing WRIST prohibition on support/push-ups now recognizes the source spelling “Push Up” as well as “push-up”; its clinical meaning is unchanged. No new questionnaire or numerical pain-permission/diagnostic flowchart is implemented. ReadySix remains the complaints/clinical source; physician holds and existing coach exclusions remain binding. Guidance covers choice, source load principles, reassessment/repeating/easier phases, total gym/court load and clinician-prescribed treatment. At a new phase's first session the player must agree suitability with the coach; completion count is not a medical clearance. Separate phase assignment supports repetition/change. Saved real assignments/programs/results are not regenerated or migrated.

Storage, token/workspace/player scope, idempotent assignment receipt signatures, revision/CAS, set validation and explicit completion remain unchanged. Partial/complete sessions retain their edition on an explicit future refresh. Edits remain specific to the selected program and workspace; refresh cannot swap equipment/programs. No timer/order/tonnage engine outside prevention is changed.

## Validation

1091 tests passed, one existing optional local-Valkey test skipped. New tests cover all variants/source rows, four-cycle sequence and phase boundaries, fixed Daily Routine independence, mandatory warmup/C/D, set-range rejection, isometric RPE versus eccentric tempo, source rests/order/final rest, actual full-course and Daily phase completion, stale/replay behavior, scoped edits/refresh and prohibitions. Local production build passed.

Fictional browser checks passed in both Zarechie and NK Pro: region/five choices, assign all four strength phases and full Daily Routine, source-dose controls/review invalidation, 12/336 counts, independent progress, manual edit/future refresh, 30-second isometric followed by120-second rest, paused reload, eccentric no-work-timer, partial completion disabled, lost completion response/retry advancing exactly once, 320/390/760px responsive layouts. No page errors; desktop/mobile screenshots inspected. Prior Low Back/Knee/Shoulder UI regression matrix is checked against the final build before deployment. Only owned fictional players/tokens and isolated local stores are used.

Publication evidence will be recorded after the guarded server candidate checks and switch.
