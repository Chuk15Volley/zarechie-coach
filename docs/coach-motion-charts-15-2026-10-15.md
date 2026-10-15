# Fifteen coach chart and motion refinements — 2026-10-15

Both coach workspaces only; existing main blocks/columns/order and video sizes
retained. No new API request, readiness assessment, generation/load algorithm,
methodology, actual/result/program write or athlete frontend change. New helper
`coachVisualCharts.mjs` derives read-only display rows from already-loaded data.

1. Chart date ticks retain endpoints with at least 56 SVG px between labels;
   edge labels align inward. All original observation dates remain in the table.
2. Single observation is a dated point with no invented trend; empty metric has
   an honest in-place placeholder. Missing/unperformed/adapted breaks preserved.
3. Seven-day actual and plan mini-bars in the original load metric cards.
4. Daily planned-tonnage mini-bars inside the original weekly-volume card.
5. Two proportional plan/fact strokes inside the original history dose row.
6. Original A–F set bars become compact vertical strokes inside existing dialog
   navigation buttons; no added rows. Zero sets have zero bar height.
7. Original Today planned/roster count gains a thin ratio in the same metric card.
8. Shared quiet grid/line/dot styles; existing golden adaptation meaning retained.
9. Pointer/touch guide and exact readout; arrows/Home/End/Escape on a keyboard-
   focusable chart. Exact chain/slot/name/implement/rep-unit identity unchanged.
10. 160 ms opacity-only dialog and loaded correction content appearance.
11. 140 ms background/border selected-state transitions in existing controls.
12. Short refreshed-status/data appearance; no counting up from zero or fake data.
13. Existing progress line 240 ms and row/check feedback only on confirmed saved
   false→true in the same queue. Initial restore, review or other scope never
   produces a save confirmation; original actions/guarded saving flow retained.
14. Poster opacity after image load; short iframe appearance. Playback, URL
   identity, availability/save and pinned/expanded dimensions unchanged.
15. Static waiting contours inside existing loading areas, no sweeping shimmer.

Motion is one-shot (140–240 ms), not blocking; coach-scoped reduced-motion rules
remove all animation/transitions/smooth scrolling. Miniature overlays do not
increase card height and are hidden in print. Original numbers and text retained.
Mini-bars label missing/no-program/partial observations; only known recorded zero
is drawn as zero. Partial actual sums are explicitly marked, never a full dose.

Validation before server candidate: 1024 tests passed, one existing skip; build
passed. Seven new semantic tests cover collision-free ticks, keyboard/pointer
bounds, recorded zero vs missing/unperformed, partial sums, exact-date weekly
plans, plan/fact separation, immutable source inputs and confirmed queue changes.
Existing strength identity/geometry/adaptation tests retained.

Local fictional browser checks: both spaces save-and-next (two fake programs,
zero actual/video/LIVE writes), confirmed counter/check/next-player; dense graphs
with Home/End/arrow readout, single-point/no-line and empty-RPE/no-point states,
missing-point readout, exact sparse date labels without overlaps; daily load/week
mini-bars and original block navigation. 390 px document 380 px/no horizontal
page overflow; video 260 px desktop/220 px phone. No browser console errors.
Production publication and protected-data results are recorded below.

Final display-count check: recorded exercise RPE stays known even when the
selected set was absent on that date. Known/missing/unperformed counters are
disjoint and never negative; original RPE points/geometry/results unchanged.

Public finishing check: the active-value readout moves to the opposite half of
its chart so it does not cover the selected upper line/point. Scrollbars use a
quiet narrow graphite/jade thumb. Source values and chart geometry unchanged.

## Published release and final checks

Final application `fd28cdd` (includes `2a67e87` and `0be69ee`) published on
2026-10-15 at 14:00:09 MSK to the existing Russian Gym container. Image:
`sha256:f0f893f0f963d9b7a215f1d89c6cb619af534526d35656057f37ef23b409fd4a`.
Only Gym was recreated; runtime secrets/access key, server transport, Valkey,
team worker, backups and 1 GB memory limit retained. Production running with
zero restarts. Rollback compose retained at
`/srv/readysix-ru-production/apps.private.compose.yaml.before-coach-motion15-readout-fd28cdd`.
The preceding `0be69ee` release and original `3f9f960` image remain available.

Final local/server builds and candidate/production smoke passed: authentication,
health, 15 Zarechie/3 NK players, original 14 saved Zarechie programs and 3
unsaved/unreviewed NK drafts, 2124-card catalogue/prohibition, original week
directions and exact weekly mini-bar source parity. 1024 tests passed, one
existing skip. Athlete sources and methodology/data API source diff empty.

Production browser checks covered both spaces: Today ratio, Load daily bars,
Week daily plan, original completed Perova program protected (22/22, C1 50 kg
2×5), original 260 px video, history plan/fact strokes, sparse Perova graph,
NK Darya exact 17.5 kg observation, missing RPE and keyboard readout. Final
readout stays clear of the selected line. At 390 px no horizontal page overflow;
original 220 px mobile video retained. No browser console errors. Reduced-motion
CSS verified; OS media preference was not emulated. Desktop viewport restored.
Proof: `/private/tmp/gym-motion15-production-2026-10-15.jpg`.

Read-only protected snapshots before work, before each publication and after
final public UI checks are identical: all 2540 protected keys (1929 non-live,
611 player journal keys), 1155 original catalogue/photo assets and 2124-card
fingerprint. No live journal changes during this release. No real program,
result, readiness, video or LIVE writes were used for validation; fake saves
ran only on the local fictional fixture. No athlete-facing code was changed.

Owned QA tabs/local fixture servers and both worker-disabled candidate
containers cleaned up; the production review tab retained. User Safari tabs
were left untouched. Active checkout: `/private/tmp/gym-premium-shell-release`.
