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
