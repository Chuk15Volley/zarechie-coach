# Coach audit improvements — 14 October 2026

Baseline: published premium-shell checkout `6d61eeb` (application `4ae2a0c`). Branch: `codex/coach-audit-improvements`. Implementation is local; no production transfer/publication has been performed.

## Boundaries

No migrations, real program regeneration/saves, results, tokens, catalogue/video writes, inventory changes or production requests. ReadySix remains the source of symptoms and permission. Generation, medical holds, local adaptations, movement prohibitions, healthy-region dose, four-completed-session cycles and exact-exercise progression are unchanged. Display facets are name-based search aids, not clinical classifications. Original historical text and missing target RPE are never rewritten.

## Priority checklist

1. Today distinguishes baseline source status from local constraints. The manual restrictions pane is explicitly labelled coach bans; no claim that upstream restrictions are absent.
2. Week labels the completion percentage as completed sets; missing kg/reps remain separate evidence badges.
3. Unknown, missing and incomplete zero evidence displays as no fact. No program and recorded zero remain distinct. Uncalibrated individual budgets display insufficient history, not 0%.
4. Completed plans automatically open read-only, with editor/save/reschedule disabled. Factual supplements remain in history. Original completed editions are locked rather than rewritten as new versions; a future prescription is a separate draft/date through existing workflows. Save and reschedule APIs use the shared original-evidence completion rule across numeric/WHOOP aliases. Atomic exact-byte guards prevent a concurrent execution/edition change from being overwritten; rescheduling additionally protects an occupied destination. Save request replay remains idempotent. Existing publication CAS remains binding.
5. Saved assessment has an explicit save timestamp and a read-only side-by-side comparison with current ReadySix when available. This is a textual comparison, not an inferred change in medical status; old programs lacking comparable source metadata are not assigned fabricated revisions.
6. Today moves full repeated source prose into disclosure, retaining verbatim symptom/constraint highlights. Red-source details start expanded. Original safeguards/reasons remain accessible.
7. Team factual task overview counts sessions to check and sessions eligible for filling, with field count secondary and exact-field links retained.
8. Week explains planned utilization, history calibration, reference sets/tonnage and recorded week facts. All calculations are unchanged; historical plan fallback is openly described, not relabelled confirmed evidence.
9. Week has a conflicts-only filter and direct buttons to both adjacent sessions for dense-loading alerts.
10. Exercise plan prescription comes first; videos and detailed load editing disclose on demand. Pure duplicate kg comments are omitted in preview, preserving compound load instructions.
11. Explicit structured RPE remains authoritative. If absent, a literal RPE from the old comment is labelled “from comment”; no field is inferred/persisted.
12. Missing exercise videos use a compact placeholder, including warmup; real players' video mappings are unchanged.
13. Shared atlas adds equipment/region/exact-name facets, browser-local favorites/recently inspected cards, expanded obvious movement name matching, and preserves bans/restriction/replacement weight-reset behavior.
14. LIVE sorts alerts and pending commands first, filters attention, moves unplanned players into a compact disclosure and links preparation.
15. Home no longer duplicates its roster in the desktop sidebar until a player is selected; day navigation remains. Display dates use Russian day/month; calendar accessible labels retain full dates/year.
16. Coach-only secondary text contrast, reduced desktop spacing, prescription-first responsive layout; athlete skin unchanged.
17. Active generation incidents include opaque task code and recovery guidance; HTTP details disclose separately. No claim that an unlinked incident was resolved, or that old programs were changed.
18. Service condition failures are counted separately from 24-hour event counters; backup/recovery timestamps are readable in Moscow time.
19. Display-only title normalization removes repeated “program” and translates known legacy recovery labels. English exercise identities remain exact.
20. “Generation quality” becomes “Program structure checks”, listing individual checks and the remaining coach review responsibilities; no approval implication.

## Verification

- Full Node tests: 923 total, 922 passed, one existing skip. Previous manual-save test doubles now provide snapshot GETs and atomic write success, retaining their methodology assertions. Added semantic display tests, alias-completion protection, unchanged original records and completed-save API rejection in both spaces.
- Production webpack build passed. Whitespace validation passed.
- Separate empty localhost Valkey 8.1.10, persistence disabled: both prefixes verified completion-during-save rejects with exact original bytes preserved, unexecuted save succeeds, and concurrent occupied-destination reschedule rejects. Only synthetic keys were used and removed.
- Isolated localhost HTTP fixture with fictional 15/3 rosters; no real data or remote API requests. In-app browser verified Today factual tasks, completed program read-only/save/editor disabled, week conflicts-only/paired dates/100%-sets-plus-missing-fields, atlas favorites/filtering and workspace switching. Width 320 checked: no horizontal page overflow and equipment filter returns the expected two fictional DB cards.
- Safari validation is not claimed: automatic UI approval rejected reading its unrelated private active window. No further Safari reading/interactions attempted. Browser QA used an independent in-app tab.
- Preview: `artifacts/coach-audit-2026-10-14/library-preview.png`.

## Release note

This checkout is reviewable and built, but production is unchanged. Before a later release, validate the isolated server candidate with the existing deployment process and confirm unchanged real-program/result fingerprints. The immutable-completed-plan change intentionally rejects edits of executed dates; use factual supplements or a separate future draft, never rewrite historical results.

## Published release — 14 October 2026

Explicit user authorization covered source transfer, publication and verification of both spaces. Final application revision **ecfe26d**, image `sha256:5d593ad5567058bc94372ba0f4bd7451dcfa22457c469fc2d593edf47c6029d3`, is published on https://gym.readysix.app, superseding the local-only status above. Initial package `df64105` was followed by a display-only correction found in real Week QA: zero source-capped budget is now “Percentage not calculated”, not a false claim that history is missing; set-based bodyweight budgets retain their valid percentages. Budget calculations and training prescriptions are unchanged.

- Final local suite: 924 tests, 923 passed, one existing skip. Local and both exact-source server builds passed. Archives checked by SHA-256; existing Node 24.16.0/server Dockerfile, secrets, transport, isolated Valkey and deployment configuration preserved.
- Separate server candidates used a read-only filesystem, no external ports and disabled background generation. Candidate and final production checked 15 Zarechie / 3 NK Pro players, all 564 period-history records (467 / 97), cycle routes, current fact tasks, week/load, original equipment ladders, catalogue and original ready/unreviewed/unsaved NK draft trio. No generation, review, publication of player programs, saves, factual supplements or completion actions submitted during QA.
- All **2424** protected raw program/actual/log/supplement/index/share hashes and the **2105-card catalogue fingerprint** matched before candidate/publication, after initial publication and after final publication. Old Voronkova link responds HTTP 200 with unchanged token/mapping/program. Both aliases and UI retain 37/37 completed sets; editor/save disabled and reschedule absent.
- Real production UI verified in a new authenticated in-app browser tab, preserving original user tabs. Zarechie Today: 65 factual tasks / 1072 missing individual fields; NK: 10 / 159. Week distinguishes 100% completed sets from missing kg/reps, conflicts-only filter and adjacent-session links work. Final zero-base label verified. NK history and LIVE open, 37/37 visible. Library has equipment/region/exact-name controls and preserves the Machine Hamstring Curl ban; NK search/filter shows the expected three Romanian-deadlift variants. At 320px page width stays within the viewport; final UI console has no errors.
- Health/storage and background worker checks passed; pending/failed publication runs remain zero in both spaces. Existing technical incident counts remain 0 Zarechie / 1 NK; no historical incidents were falsely resolved. Existing backup/service warnings remain visible separately from event counters.
- Only `gym` was recreated. Automatic health-failure rollback was armed; previous image/configuration retained. Rollback configuration before all improvements: `/srv/readysix-ru-production/apps.private.compose.yaml.before-coach-audit-df64105`; immediate intermediate rollback: `.before-coach-audit-ecfe26d`. Both temporary candidate containers removed; no other services or secrets changed. Temporary login-key file removed after authentication.
- Final proof: `artifacts/coach-audit-2026-10-14/production-final-library.png`, `production-nk-mobile.png`. New QA tab left on NK Pro library; viewport override reset.
