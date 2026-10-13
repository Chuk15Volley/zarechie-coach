# Player history, missing facts and decision outcomes — 2026-10-13

## Scope

Both Zarechie and NK Performance share a new player History view. It separates actual and planned tonnage, shows exact main-exercise kg/repetitions/exercise RPE, filters strength sessions and missing facts, and paginates saved dates without duplicating alias dates. Date links from Today/load can open History directly. A second section exposes the existing factual adjacent-cycle comparison, historical coach decisions, volume-reduction reason and outcome, and the next-cycle decision editor.

Missing-fact entry reuses the existing completion/edition/source checks, atomic supplement API, required reason, stale-source reconfirmation and explicit browser-local edit recovery. Only absent applicable A1/B1/B2 fields can be supplemented on fully completed strength sessions. No planned kg, session RPE, or another exercise's load becomes an actual. Saved supplements trigger refresh of History, cycle review and existing load/progression consumers. Original athlete responses and execution times remain intact. History and cycle reads use cancellable 25-second requests; UI displays errors rather than a successful empty history.

The coach program read also checks numeric ReadySix and historical WHOOP aliases and picks the newest saved/draft edition. It performs no migration, token rotation, or writes. This makes a program stored for an old player link visible from the current numeric roster. Existing player write identity policies are unchanged.

## Validation

- 887 tests passed; one existing skipped test. Tests cover completion vs undo, absent fields, planned/session-RPE exclusion, applied/stale supplements, date pagination and both workspaces' alias reads. Existing supplement/CAS/replay/progression/load/cycle tests pass.
- Full Next webpack production build passed; `git diff --check` passed.
- Safari fictional local fixture: NK 3/3 and Zarechie 15/15 rosters; history/gap filters; required reason; kg/reps/RPE entry; explicit recovery after reload; successful confirmation removes gaps. Zarechie adjacent-cycle review reflects the supplemented values and 3 → 2 sets with the saved reason, without claiming a strength gain. Desktop and 320 × 667 layouts inspected.
- No real player actuals or coach decisions entered during tests. Local synthetic program save count remains zero; only synthetic supplement entry was exercised.

## Explicitly requested live actions, completed on c26efac

1. Refreshed the three old NK Pro 2026-10-13 team drafts with the original development/posterior-chain request and current numeric roster IDs. Queue 56fedc9e-4f1a-4258-8991-2ae214c044b5: all three ready, unreviewed, unsaved. No group publication performed.
2. Generated and saved Irina Voronkova's 2026-10-14 camp/eccentric/posterior-chain program under the existing old-link owner WHOOP ID. Shared reviewed catalogue, conservative 47-minute estimate, 13 exercises, 35 sets, main eccentric tempos 5-0-X-0. Valid quality review, no blocking medical hold or prohibited exercises, no invented kg. Initial async submission returned a generic 503; the normal synchronous generator succeeded with the same inputs. This action does not claim the asynchronous error was fixed.
3. Existing player token and mapping hashes were unchanged. Old link returned HTTP 200, SSR loaded the requested date/program, and session-detail returned the saved session. Bearer token was never printed or committed.

## Release status

Published as 076a052 after explicit source-transfer/candidate/publication authorization. Production image is 02aa304707885da577a7a1ec3c1ae6cf8c57d9b91cf29690ece9ab027d1f7c3c. Rollback baseline is c26efac (image 826690920976113d0b55753b3d0d7b5df38c4d8bbe483bc94ed8c04898cce3e2); recreate only gym, preserve Valkey/secrets/server transport and other containers.

## Next grouped package

- Make legacy player-link identity and canonical roster identity consistent across future program saves, player logs, feedback and histories, with alias/edition collision tests; retain old tokens.
- Add a compact player trend view using comparable exact-exercise actuals and completeness markers, with direct links to source sessions.
- Improve async preparation diagnostics and bounded retry UX for transient ReadySix failures; verify camp and strength team-day generation in both spaces without publishing test programs.

## Production release evidence

- Exact source archive SHA256 733e8d98703d2a5fecc4da7093758488d8c8e1b911b6caa950163a88e41062a8 built with the pinned Node image. Read-only isolated candidate, no public port or background worker, removed after successful release.
- Candidate and production: all 18 real rosters/history/cycle APIs passed; 121 Zarechie / 19 NK strength history rows checked, 113 / 17 rows have applicable factual gaps (not a claim about missing kg alone); four editor/history parity comparisons; both inventory ladders preserved. Coach alias reads return Voronkova camp program for both IDs.
- Only gym recreated. Health/storage and worker healthy; no pending/failed publication runs. Existing one active technical incident in each space retained, no false resolution. Rollback compose /srv/readysix-ru-production/apps.private.compose.yaml.before-player-history-076a052.
- Production Safari: both spaces History/gaps/forms opened read-only; NK absence of new-version cycles explained; Lazarenco current cycle shows 1/4 actual completion, comparison requires adjacent completed cycle. Three refreshed NK drafts appear ready with unchecked review and no publication. Voronkova 14-Oct program loads in numeric coach card. Old link HTTP/SSR/date/program and token hash reverified after publication. No real results/decisions entered for QA.
- Found an existing workspace-history navigation defect during final Safari: switching spaces clears player but leaves History active, hiding the home. A separate local one-line fix returns the destination space to Program; Safari verified both directions and 887 tests/build passed. This follow-up is not part of 076a052 and has not been transferred/published.

## Workspace navigation follow-up published 2026-10-14

The user explicitly authorized source transfer, candidate verification and publication of 27f5ba2. The one-line Program-tab reset on workspace change is now published in both spaces, superseding the pending follow-up above. Image: sha256:23cd26019a228f9e6b949300a71538d6b8a3eb0b1105d964b28335d4f0d5da56; source archive SHA256: fefbe306c19516deee0180a543d21c1a46b1b309f23bc3532e0d8e2ffd4c1f5b.

Candidate and production health/auth/bundle, 15/3 rosters, history, both inventory ladders and Voronkova program alias reads passed. Production Safari verified NK History → Zarechie home and Zarechie History → NK home; both show the destination roster and Working Day immediately. Real results were not entered. Old Voronkova link remains unchanged and opens the 14-Oct camp program; three refreshed NK 13-Oct drafts remain ready/unreviewed/unsaved. Existing technical incidents retained rather than falsely resolved.

Only gym recreated. Rollback to 076a052: /srv/readysix-ru-production/apps.private.compose.yaml.before-history-navigation-27f5ba2. Isolated candidate removed after verification. Local baseline validation: 887 tests passed, one existing skip, full build and fictional Safari both directions passed. Safari left on Voronkova 14-Oct program; original ReadySix tab preserved.
