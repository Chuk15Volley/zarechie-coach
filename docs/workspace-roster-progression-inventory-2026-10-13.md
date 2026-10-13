# Shared roster, strength progression and inventory

Status: local release candidate; production is still 7c80d65 until explicit source-transfer and publication approval. Based on the published premium shell (59349f3 documentation / 7c80d65 application). The earlier unfinished worktree was preserved.

## Behavior in both spaces

- Main roster, NK refresh, weekly overview, team tonnage and Today/readiness membership use workspaceRoster and the ReadySix normalized roster. Numeric/WHOOP aliases resolve historical plans within the same workspace. Bridge errors do not restore a legacy subset. Team readiness cache schema v5 prevents reuse of old membership payloads. Late tonnage responses cannot cross a workspace switch.
- Strength cards call buildGenerationInputs, the same deterministic catalogue/history/ReadySix/coach-decision path as generation. Exact slot, exercise, implement count, dose and repetition targets must match. The only supported changed target is the generator's bounded +1 repetition action. Applying a proposal requires unchanged exercise basis and workspace/player/date/method scope, a valid timestamp no older than five minutes, no pain evidence and no medical hold. Unknown variants and unavailable data provide no invented kg; strength cards no longer use the separate 1RM fallback. Other methods retain their existing behavior.
- Inventory on the home screen supports an explicit list or minimum/step/maximum, including decimal commas. It shows the actual count, range and every available weight. All athletes retain coach-confirmed 5+ years' experience. Settings remain separate by workspace, with explicit local edit recovery, conflict checks, atomic persistence, audit records and idempotent replay.
- Saving inventory invalidates older team strength drafts. ReadySix preflight clears review and explains the inventory change. The final atomic save also compares the inventory marker to prevent a change between preflight and publication.

## Confirmed inventory values and release step

Coach confirmed barbell and trap bar total weights 20–200 kg in 2.5 kg steps in BOTH spaces: 73 values per implement. Do not interpret old [200] as a complete ladder. After approved publication, GET each workspace's inventory, preserve dumbbell/landmine/kettlebell lists, save only the two confirmed ranges through the CAS API, then verify all 73 values and saved range metadata. Never regenerate or publish existing real drafts automatically as part of verification.

## Validation

- Full suite: 870 tests, 869 passed, one existing skip; production build passed.
- Added coverage: exact ranges, invalid endpoints/precision, workspace isolation, roster alias history/bridge failure, inventory stale-tab/concurrent-change/replay, actual generator/card agreement, stale/invalid timestamp, edited dose, session-vs-exercise RPE, repetition progression, inventory invalidation and unavailable shared-generation inputs.
- Safari local full application with fictional 15/3 rosters: main screen, both spaces, manual comma input, 73-weight preview, inventory save and reload. Production programs, results and inventory were not changed. Screenshots: /private/tmp/gym-functional-zarechie-safari.png and /private/tmp/gym-functional-nkperf-safari.png.
- Read-only production audit confirmed the existing defect: Zarechie main 15 vs tonnage/week 13 (Bagrey and Mladjenovic absent); NK counts 3 but identity formats differ. New server candidate and real Safari checks remain required after authorized source transfer.

## Release verification

Build the exact committed revision on the existing Russian server, with worker disabled in the isolated candidate. Check all roster identities across list/tonnage/week/readiness, exact card/generator kg and targets for both strength modes/chains, inventory CAS and final publication-marker races using owned synthetic records with cleanup. Preserve all healthy-region dose, ReadySix medical boundaries and prohibitions. On success recreate only gym, retaining rollback to 7c80d65. Fill confirmed inventory ranges and check both spaces in real Safari.

## Next package

Player cards, Today and program editor: coherent premium spacing, compact video, prominent kg/reps/RPE, stable save actions and collapsed secondary instructions. Then weekly/load tables and team draft review density, with explicit missing-data and freshness states.
