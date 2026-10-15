# Coach visual and workflow polish — 15 October 2026

Approved: implement the next 15 proposals in Zarechie and NK Pro and publish.
Existing main layout/blocks, methodology, real programs/results and player app
are preserved. Baseline application 860b2e1; active checkout
/private/tmp/gym-premium-shell-release.

1. Exact mini-bar tooltip rendered in a coach-scoped fixed portal outside the
   statistic card; viewport-bounded horizontal position, above/below placement,
   tracked scroll/resize, same touch/keyboard/date/missing/partial semantics.
2. Existing Load table initially scrolls to recent dates. Workspace/date-scoped
   browser session view restores manual scroll, follows the right edge on size
   changes and retains sticky player header. Bounded 12 UI-only entries; no facts.
3. LIVE displayed zero and System zero error/warning counters use neutral colour;
   nonzero signal colours and all actual count/calculation/status rules retained.
4. Existing unfinished LIVE list labelled Waiting and training, matching its
   unchanged predicate; completed/attention/in-progress filters unchanged.
5. Video URL field has full address tooltip and accessible exact clip-ID hint.
6. Existing video submit says Save video; shared catalogue/both-space scope and
   exact-name save/delete/preview guards remain explicit and unchanged.
7. Existing preserve-unit bulk option says As prescribed, full semantic tooltip;
   stored values, ambiguity guards and apply behavior unchanged.
8. Existing progression retry button uses concise labels and full tooltip;
   original proposals, reasons, bounds, retry and apply handlers unchanged.
9. Closed inventory/team-fact/cycle service panels have consistent compact
   padding/type and 44 px touch area; open contents and section order unchanged.
10. Original warmup header separates Russian name, exact English variant and dose
    by wrapping within the existing exercise header. No prescribed text changed.
11. Decorative phase marks/titles are muted; clinical/status colour rules intact.
12. Closed existing conduct container is compact; original conduct/fullscreen/
    navigation, source exercises and duration text unchanged.
13. Visible fact scope/comparison/table dates use Russian dates with year;
    raw date input values, requested periods, source observation dates untouched.
14. Metric missing labels explicitly name kg/reps/RPE, original disjoint counts
    unchanged. Existing period comparison summary has a visible native disclosure
    arrow and concise label; all comparison logic/cautions/content retained.
15. System uses Russian headings/recovery labels; technical diagnostics/actions
    and existing backup/recovery/notification policies unchanged.

Screen-only coach-scoped styles and display components. No player frontend,
API, prescription/methodology/generation or real-save transport changes.
1029 tests passed, one existing skip; three semantic tests cover card-tooltip
non-overlap, horizontal viewport bounds, restoration/clamping/end-on-resize and
Russian date presentation with original inputs preserved. Local build passed.

Local fictional checks already passed: both-space save-and-next (two fake saves,
no actual/video/LIVE writes), original paired load fields and preserve-unit option,
exact video-ID/full URL/unchanged shared scope, original warmup conducting and
new bilingual header/66 px closed conduct, Russian history dates/metric-specific
missing counts/native period comparison, LIVE/System labels. Initial Load offset
400/400; manual keyboard scroll restored at 320; other workspace independently
400/400. Tooltip bottom 223.7 vs card top 231.7, card height stays 109 px.
Final mobile/publication/protected-data results are recorded after release.

Final local mobile check: 390 px viewport, 380 px document/no horizontal page
overflow, tooltip bottom 305.2 vs card top 313.2 (8 px clear), full exact readout.
Manual NK offset restores at 320 while Zarechie independently starts 400/400.
Sidebar collapse follows right edge 400/400→176/176; sticky player header stays
above scrolled dates. No browser console errors. All local servers use fictional
fixtures (two saves, no actual/video/draft/LIVE writes).

Hidden mobile panes do not overwrite the remembered table offset with a
zero-width measurement; the original offset is restored when the pane returns.
