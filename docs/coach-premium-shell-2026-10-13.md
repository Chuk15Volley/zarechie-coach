# Coach visual package 1 — 2026-10-13

Both workspaces share a scoped `coach-premium` skin and the same navigation/home components. This release is based on published application a815f6b (documentation HEAD 5f5281c). The unfinished roster/progression/inventory package in `/private/tmp/gym-rotation-chain-release` is deliberately excluded and preserved.

Changes:
- Graphite surfaces, jade primary actions, readable muted text, Manrope interface/display typography and tabular numerals. Removed the coach background watermark and ambient decorative orbs.
- Compact grouped primary navigation and secondary overview links; explicit current section and workspace/player selection states; keyboard focus outlines, reduced motion, readable disabled generation action.
- Home shows the planning date, full loaded roster and read-only transitions to Today, Week and LIVE. No invented readiness, activity or plan metrics.
- Mobile menu uses the same destinations, with an explicit return to menu/roster from every section. Tablet navigation no longer depends on hover to expose the roster. Collapsed desktop mode keeps labelled icon buttons and hides the NK sync footer.
- Existing generation, clinical decisions, queues, history, inventory storage, athlete pages and server transport are unchanged. Library redesign is a subsequent package.

Validation:
- Production build passed. Full suite: 859 tests, 858 passed, 1 existing skip, no failures. Updated the old navigation source contract after extracting the component; the hidden season planner stays unlinked in both spaces.
- Full compiled Home mounted after authentication locally. Safari checked both workspace homes on a loopback-only HTTP fixture with 15 / 3 invented players, workspace switching and desktop collapse/expand. Fixture APIs never contact production and never write athlete records.
- Additional responsive checks use the same compiled page in the in-app browser at 390px (menu and home) and tablet width. Test fixtures live outside this checkout and are not deployed.
- Screenshots: `/private/tmp/premium-shell-safari-zarechie.png`, `/private/tmp/premium-shell-safari-nkperf.png`.

Release state: PUBLISHED as 7c80d65 on gym.readysix.app in both workspaces on 2026-10-13, after explicit user approval of source transfer, candidate verification and publication. The earlier approval-review rejection was resolved by that permission.

Server build and isolated candidate passed: actual ReadySix rosters 15 / 3, inventory, original queues, monitor, compiled Home JS and CSS. Only gym was recreated. Active image: `sha256:8a886a5079f1f6e967385adfc8e0fc83020f57ee4710bad3e7eca08a0a2d2618`. Rollback to a815f6b is retained in `/srv/readysix-ru-production/apps.private.compose.yaml.before-premium-shell-7c80d65`.

Post-publication storage/worker checks passed. Both spaces have zero pending/failed publication runs; NK keeps its original three ready unsaved drafts. One pre-existing unlinked Zarechie preparation incident remains visible. No real programs/results/inventory were rewritten by verification.

Authenticated production Safari: full-page reload, both real workspace homes, 15 / 3 players, workspace switching, collapse/expand and opening Darya's card passed. Safari returned to the original Zarechie home. Proof: `/private/tmp/premium-shell-production-zarechie.png`, `/private/tmp/premium-shell-production-nkperf.png`.
