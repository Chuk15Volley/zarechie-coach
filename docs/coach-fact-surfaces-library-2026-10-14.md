# Today/week facts and premium technique atlas — 2026-10-14

## Requested scope

Both workspaces: missing factual kg/repetitions/exercise RPE and exact input navigation in Today and Week; premium library with video, technique descriptions and convenient program substitutions. Verify Safari and provide the next grouped plan. Production baseline is `1bb6151`.

## Implementation

- Today reuses the authoritative team fact overview for the last 28 inclusive days, with an optional period disclosure. Week uses only its selected seven-day range, capped at today's Moscow date. Future weeks explicitly await execution and do not request/invent factual results.
- Compact summaries show missing fields, stale additions and awaiting execution separately; player/field tasks expand on demand. Exact exercise/set/field navigation uses the existing history editor, validated completion, original-source fingerprints, local recovery, mandatory reason and supplement CAS. The shared `inseason_strength` fact scope is unchanged; other methods are not newly inferred as comparable strength evidence.
- A shared technique atlas serves both the coach shell and the standalone `/library` page. Graphite/jade/ivory palette, restrained type, large selected exercise/video/instruction panel and bounded result list. Search combines words, with movement and video-availability filters, reset/empty/error/retry states and 12-row pagination. Unknown movement names remain Other rather than acquiring a medical classification.
- Video links use the existing catalogue's stored/automatic URL. Validated YouTube hosts/11-character IDs are converted to privacy-enhanced frames only on an explicit play action. Missing videos are labelled. No videos are searched, uploaded, replaced or labelled coach-verified by this package. Existing local `replacementTechnique` provides explicitly labelled basic technique when a card has no description; individual dose/tempo/instructions remain in the player's program.
- Program replacement opens the same atlas, initially filtered by the current movement, with technique inspection before selection. Existing coach bans, the legacy incline-push-up exclusion and known player restriction matching exclude candidates. Selection uses the existing replacement path: old kg/actual fields cleared, description refreshed and replacement reason/history preserved. No automatic program save or unsupported claim of clinical equivalence.
- Sidebar library navigation stays inside the coach app. Returning to the program retains parent editor state and unsaved substitutions. Standalone catalogue maintenance (images/renaming/categories/deduplication) remains available through an explicit separate management mode. Existing storage/API and ReadySix permission/publication policies are unchanged.
- Catalogue reads are abortable and bounded to 25 seconds; errors never become an apparently empty successful catalogue. No new API mutation, readiness assessment, external model transfer or athlete result writes.

## Validation

- 916 tests: 915 passed, one existing skip. Six additional checks cover selected-week/past/future calendar bounds, exact YouTube host/ID validation, compound search and filters, bans/restrictions and unchanged weight-reset/replacement behavior in both spaces, and in-app navigation wiring.
- Final production webpack build and whitespace checks passed. No additional plotting/media dependency.
- Safari desktop both spaces and 320×667 used a separate localhost fixture with fictional 15/3 rosters. Today showed 90/18 missing fields respectively. The selected current week had zero eligible missing fields; the previous week showed 90/18; the future week displayed its explicit awaiting-execution message. Today C2 RPE and Week C2 set-2 repetition links focused the exact corresponding input without typing facts.
- Library displayed 19 eligible fictional candidates while excluding a deliberately banned candidate. Video poster/privacy-enhanced YouTube player and basic technique loaded; exact external YouTube link retained. Missing-video candidate, search, movement selection, bounded results and standalone maintenance-mode toggle checked. A simulated 503 displayed a visible error and retry, then restored the catalogue.
- Desktop NK replacement: set old A1 plan to 80 kg locally, inspected DB Romanian Deadlift, selected it; old kg cleared and the reason control appeared. Opening the atlas in the shell and returning retained the unsaved replacement. Mobile Zarechie replacement also applied the chosen variant with blank old kg and reason control. Programs were not saved.
- Final mobile layout stacks filters so labels fit, keeps selected technique above the result list, and gives embedded video at least 200px height. Both spaces' compact fact summaries were rechecked. Responsive mode exited; only the owned local test tab closed; original real tabs/unsaved user program untouched. Both local servers stopped and the fixture error flag restored.
- Fixture counters: program saves 0, factual supplements 0, video writes 0, six read-only progression calls. No production program/result/decision/draft-review action occurred.
- Proof: `/private/tmp/fact-library-today-z.png`, `/private/tmp/fact-library-mobile-today-nk.png`, `/private/tmp/fact-library-mobile-final.png`, `/private/tmp/fact-library-mobile-swap.png`, `/private/tmp/fact-library-standalone-final.png`.

## Release status and next grouped work

Local candidate only; source has not been transferred or published. Production remains `1bb6151`. Obtain exact-source transfer/candidate/publication permission once this revision is committed, then verify server candidate, unchanged original records/old Voronkova link, both real rosters and Safari before/after the approved gym-only deployment.

1. Publish this tested package, repeat real Today/Week/library checks and preserve rollback to `1bb6151`.
2. Add coach-confirmed exact-variant media/descriptions, favourites and recently used substitutions as one library workflow; keep basic/automatic material distinct from confirmed instructions.
3. Compare periods and adjacent cycle outcomes using completeness and exact exercise/dose identity; add a concise coach action list without turning missing facts into estimated performance.

## Published release

Exact authorized source **4ae2a0c** published on 2026-10-14 after explicit source-transfer/candidate/publication approval, superseding the local-only status above. Image `sha256:36ea6870c53ec3e248db53382bc6a52827567e9088e66749aa31123366c708f9`; archive SHA-256 `d6bc23ed6878b1defb5eb981dbc630fb32576199dd10311d112d2173c0dccafa`. Only gym recreated; rollback to `1bb6151` retained at `/srv/readysix-ru-production/apps.private.compose.yaml.before-fact-library-4ae2a0c`.

- Server build and isolated read-only/no-port/worker-disabled candidate passed. Candidate and production both verified all 18 roster members, 564 period sessions, 627 accessory series, preserved 73-value barbell/trap inventory and original NK three ready/unreviewed/unsaved drafts.
- Selected-week facts match history: 12–14 Oct Zarechie 283 missing fields / 1 awaiting execution, NK 8 / 0; 5–11 Oct Zarechie 338 / 0, NK 55 / 0. Today 28-day totals remain 1072 Zarechie / 159 NK, separately identifying awaiting execution. These are recorded historical gaps, not generated or inferred facts.
- Full production catalogue: 2105 eligible cards with validated available video URLs. Banned catalogue candidates absent; catalogue response fingerprint identical before/after/final. No video, technique, category, image or card metadata writes. Runtime bundles and authenticated data routes verified.
- All 2424 storage hashes for original programs/actual/log/supplement/index/share records matched before publication, after publication and final verification. Old Voronkova public link HTTP 200 with unchanged program/token; both aliases/history/LIVE retain her 37/37 completed 14-Oct workout.
- Worker healthy; publication pending/failed zero in both spaces. Zero active Zarechie technical incidents and one existing NK incident remain; none were manually resolved by this release. Temporary candidate removed; old image/config retained for rollback.
- Real Safari both spaces: Today and selected-week counts, authoritative 15/3 roster and current date; NK week link opened Brovkina's 12-Oct A1 exercise-RPE input without typing. Library loads the full catalogue; searching Machine Hamstring Curl returns no candidates. Inspected DB Romanian Deadlift (Two-Hand) with existing video poster and basic technique in both spaces; NK real catalogue also verified at 320×667. No real substitution, save, completion, fact confirmation or publication action submitted during QA.
- Proof: `/private/tmp/fact-library-production-week-link-nk.png`, `/private/tmp/fact-library-production-today-z.png`, `/private/tmp/fact-library-production-library-z.png`, `/private/tmp/fact-library-production-mobile-nk.png`, `/private/tmp/fact-library-production-library-final.png`. Responsive mode exited. Separate new production QA tab remains on NK's technique atlas and the selected Romanian deadlift; pre-existing user tabs were neither reloaded nor saved.

Next package: coach-confirmed exact-variant video/description status, favourites and recent substitutions together. Follow with period/cycle comparison using completeness, comparable dose and historical coach decisions.
