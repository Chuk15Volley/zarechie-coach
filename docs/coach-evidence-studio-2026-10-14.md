# Coach evidence studio — 2026-10-14

## Requested package

Shared premium presentation for player history, strength-cycle outcomes and team draft review in both workspaces. Add actual kg/repetitions/exercise RPE charts with explicit missing values. Preserve programs, exercise bans, medical/regional adaptations, completion rules, progression and publication guards.

## Implementation

- History: graphite/ivory/jade/champagne panels, structured chronology and fact-status badges, larger factual/planned numbers and direct saved-program navigation. Existing missing-fact confirmation/reconfirmation remains available.
- New `StrengthPerformance` presentation and pure `strengthPerformance.mjs` adapters use validated A1/B1/B2 strength evidence from existing history and cycle review. History scope explicitly describes loaded sessions; paginated history extends the series. Other methods are not represented as strength facts.
- Select exact exercise variant and working set. Identity separates movement slot, exact name, chain, implement count and per-side repetition units. Kg means one implement; repetitions mean the chosen set (per side when indicated); RPE is exercise RPE, never session RPE. Timed prescriptions do not become repetitions.
- Independent metric gaps, recorded zero retained, no planned-value fallback or 1RM estimate. Dates where that variant was not performed and unconfirmed strength sessions remain gaps in history chronology. Cycle charts retain other-variant completion dates as gaps. Missing observations and regional adaptations break lines; adaptations use a gold marker. Last known value always names its actual date. Exact values/missing reasons remain available in a table with program links in History.
- Valid coach supplements update charts using the same resolved evidence as the missing-fact editor. Stale supplements are not applied; changed/undone completion does not become a point. History API adds only the existing exercise symptom-adaptation flag to validated rows so graphs can identify adapted observations.
- On narrow charts, latest dates are shown at the right, with an explicit horizontal-scroll hint and focusable plot; ResizeObserver responds to layout changes. No plotting library, additional data fetch, external analytics or data transfer.
- Cycle review: actual completion hero (0–4), factual charts, premium adjacent-cycle comparison and delta tiles, preserved historical coach-decision reasons and reduced-volume evaluation. Existing comparison eligibility and RPE comparability rules unchanged. Full set tables moved into one disclosure. Decision editor retains save/recovery/conflict protection.
- Team drafts: preparation/review/save stages with real counts, premium player cards and explicit planned exercises/sets/review status. Existing ReadySix preflight, selection, refresh, queue controls and publication handlers preserved. Terminal rows no longer display a runtime stall alert intended for queued/generating work; server incident history remains untouched.
- Scoped styles affect only coach surfaces; athlete programs, links, timers and completion celebration remain unchanged.

## Validation

- 897 tests: 896 passed, one existing skip. Six meaningful new tests cover planned/session-RPE exclusion, independent gaps and recorded zero, confirmed/stale supplements and undo, exact variant/unit isolation, cycle missing/incomplete sets, segmentation at missing/adapted points, and timed-repetition exclusion.
- Production webpack build and diff whitespace checks passed. Safari uses an isolated localhost fixture with fictional 15/3 rosters. No production programs/results/decisions/draft reviews or exercise videos changed. Original real program tab not reloaded/saved.
- Fictional NK history: selecting set 2 showed kg/repetition/RPE gaps on 8-Oct. One synthetic supplement entered 22 kg / 6 reps / exercise RPE 8 and a reason; all three charts refreshed to those values with zero gaps, and cycle charts reflected RPE 8. Zarechie retained original gaps (workspace isolation).
- Both cycle reviews retained the saved reduced-volume decision, reason and actual 3→2-set outcome; altered dose/mixed actual sets did not claim comparable strength/RPE improvement. Decision save was not submitted.
- Final Safari 320×667: history plots/table, latest missing date 08-Oct and horizontal hint, wider nested cycle comparison, mobile NK draft prescriptions (100 kg / 4-4-4 / target RPE ≤8; paired 20 kg) inspected. Responsive mode exited. Only the owned local test tab was closed; both test servers stopped after QA. Final proof files: `/private/tmp/evidence-studio-graphs-final.png`, `/private/tmp/evidence-studio-history-final.png`, `/private/tmp/evidence-studio-graphs-mobile-final.png`, `/private/tmp/evidence-studio-cycle-mobile-final.png`, `/private/tmp/evidence-studio-drafts-mobile-final.png`.
- Fixture counters after QA: program saves 0, one synthetic actual supplement, five read-only progression calls. No production data/API used by the fixture.
- Team draft UI: filters, empty errors state, exercise prescriptions with kg/repetitions/RPE, stage counters and review toggle checked. One fictional review was set and cleared; publish stayed disabled without ReadySix check. No program publication/generation/save occurred.

## Release status

Local candidate only; not transferred to ReadySix and not published. Production remains 7ef790b. Final local checks and Safari/mobile proof are recorded above. Both spaces use the same source; a server candidate has not yet been built. Publication requires a separate source-transfer/candidate/deploy authorization for this source, then isolated server checks and gym-only recreation with rollback to 7ef790b.

## Next grouped work

1. Add date-period selection and a team fact-completeness view, with direct links to the exact missing exercise/set and decision that needs attention.
2. Extend validated fact charts beyond main strength movements to additional exercises/methods, keeping timed work, per-side counts and load units separate.
3. Complete coach-approved videos for exact exercise variants and apply the same visual system to library browsing and substitutions.
