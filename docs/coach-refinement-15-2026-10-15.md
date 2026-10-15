# Coach presentation refinement — 15 October 2026

Approved scope: implement all 15 proposals in Zarechie and NK Pro and publish.
Keep existing layout, blocks, methods, real programs/results and player app.
Based on published application fd28cdd; worktree /private/tmp/gym-premium-shell-release.

1. Existing prescription sets render in individual spans with separators; short
   assignments remain intact, long custom prose can wrap; source text unchanged.
2. Load table uses equal 132 px date columns, original sticky name column and
   existing horizontal scrolling; field/row/date order and values unchanged.
3. Supporting dates/rest/video/source labels use readable 12 px supporting type.
4. Existing weight/implement/RPE grid keeps its columns and aligns label/input
   baselines (36 px two-line labels only for paired implements, 18 px otherwise).
5. Existing 1–20 set-count input has a visible outline/32 px control and focus;
   count commit/cancel/new-set behavior unchanged.
6. Full exercise/variant names wrap in original title, result and detail areas.
7. Existing favorite button and catalogue metadata have separate wrapping flow.
8. Existing search/filter fields share aligned heights/labels/gaps, same order.
9. Secondary graph/program/context contours are quieter, clinical frames retained.
10. Block/set deletion has a quiet neutral control and warning hover/focus; original
    handlers/confirmations unchanged. Save remains the original primary action.
11. Existing checkbox controls keep native behavior, consistent 18 px size/focus.
12. Existing blocked-save button says Protected and describes its reason through
    existing status and tooltip; generic protection text covers both completed
    programs and restricted medical plans. No editing/save guards changed.
13. Daily mini-bars have pointer/touch and arrows/Home/End/Escape exact date/value
    readout, including known zero, missing, no-program and partial data. No API,
    data derivation, dimension or graph normalization changes; keyboard focusable
    group, associated status, print hidden. No extra animation.
14. Selected filters gain a quiet underline/border; zero-count queue filters are
    subdued but remain operable, original selected/filter logic unchanged.
15. Disclosure rows share marker/type/rhythm; warnings fully wrap in their original
    locations. All original clinical text retained.

Screen-only coach-scoped CSS. No main layout/grid/order/video dimensions changed.
Player components/pages, APIs, methodology/calculation/save transport unchanged.
1026 tests passed, one existing skip; two added semantic tests cover immutable
mini-bar labels (zero/missing/partial) and pointer/keyboard boundary access.
Local fictional save/count/pair-weight/readout and final build/release checks
will be recorded after completion.

Mobile finishing check: prescribed sets use separate lines on narrow screens;
visual separators are hidden there so a slash cannot occupy an orphan line.
The existing description list retains the full original joined prescription as
its accessible label. Desktop sets keep their separator inside one inline part.
No source assignments were changed.

## Publication and final validation

Final application `860b2e1` (includes `bdcbdec`) published on 2026-10-15 at
14:51:41 MSK. Existing Russian Gym container, image
`sha256:c83ba3772bf7a23c8c4fdf042d66813b33c60ef90ce7a4f3a15a4b407f7c8edc`.
Only Gym recreated; runtime secrets/key, worker, Valkey, server transport,
backups and 1 GB memory retained. Restart count zero. Rollback:
`/srv/readysix-ru-production/apps.private.compose.yaml.before-coach-refinement15-final-860b2e1`.
The initial `bdcbdec` release and preceding `fd28cdd` image are retained.

1026 tests passed, one existing skip; final local/server production builds,
worker-disabled candidates and public smoke passed in both spaces (15/3 players,
original 14 saved Zarechie programs/3 unsaved-unreviewed NK drafts, 2124 cards,
prohibitions, week directions and exact weekly mini-bar source parity).

Local fictional UI: three program saves across both spaces, confirmed save-next
and queue removal; set count 3→4, decimal weight 17.5, paired implements 1/2,
preview, native checkbox, library metadata and unchanged full video dimensions.
Mini-bar keyboard End/Left exact partial value, missing/no-program and Escape
clear checked. Mobile page 380 px inside 390 px viewport; table-only scrolling,
equal date columns; original statistic cards remain 109 px on desktop. No
actual-result/video/draft/LIVE writes in the fictional fixture metrics.

Public UI: both spaces verified after publication. Zarechie Perova original
22/22 completed/protected, all original assignment strings retained in aria
labels and visible set spans; 1×5 m/side assignments are one line each on the
phone with no orphan slash. NK Darya original 13 October unsaved draft inspected
read-only; weight/implement/RPE controls all 40 px and same top coordinate.
Video stays 260 px desktop/220 px phone. Library metadata below favorite with
10 px separation; checkbox 18×18. Load has seven equal 132 px date columns,
exact 15 October partial actual readout and original card heights. Temporary
existing team-queue request limit expired normally; a successful retry restored
14 saved rows, without changing/clearing the rate policy or stored records.
Final browser console error list empty; desktop viewport restored.
Proof: `/private/tmp/gym-refinement15-production-2026-10-15.png`.

Before, pre-publication, after initial release and after final public UI snapshots
are identical: 2540 protected keys (including all 611 player journal keys),
1155 original source assets and 2124-card catalogue fingerprint. Zero real
program/result/video/LIVE/review/generation writes were used for verification.
Player frontend, APIs, methods, clinical/dose rules and save transport unchanged.
Both owned candidate containers/local servers/QA tabs cleaned up; final public
review tab retained. User Safari and pre-existing tabs untouched.
