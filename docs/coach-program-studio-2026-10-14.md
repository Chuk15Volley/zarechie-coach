# Premium coach program studio — 2026-10-14

## Scope and result

User requested a more premium, convenient editor after inspecting Voronkova's open 14-Oct program in Safari, with immediately visible exercise videos/descriptions and premium graphics. Both workspaces use the same editor.

- Wide editorial exercise cards: graphite surfaces, ivory type, muted metal/jade accents, consistent spacing, readable names and deliberate controls. Block headers use the same restrained palette.
- Video preview and full editable technique are always visible, with no disclosure required. Curated/manual video selection remains authoritative; no automatic YouTube search. Playback starts only on explicit click, within a youtube-nocookie frame; an external YouTube link remains available. Manual video edits save separately to the shared exercise library and say so. Bounded requests and identity epochs reject stale video reads/writes after renaming or unmounting.
- Explicit Editor / Preview modes, available at the introduction and sticky toolbar. Preview preserves edits, shows prescriptions/technique without edit fields, and hides mutation shortcuts within exercise cards/blocks. Save stays available for previously made edits. Print/copy/template/reschedule remain in the compact actions menu.
- Clear planned kg, repetitions/time per set, target RPE cap, tempo, implement count and multiline load comment. Existing actual kg/RPE have their own disclosure. Existing progression, replacement reasons, contraindication notices, exercise bans, save/completion and player timer policies remain intact.
- Interactive planned-set chart: actual array lengths of the current program's prescribed sets, total exercises/blocks, clickable block navigation. Editing sets immediately updates the chart; it is explicitly planned volume, never a physiological/load/readiness or completion score.
- Auto-resizing text follows container width changes. Narrow layout stacks media/instruction and aligns fields; long block order/rest instructions get full width and remain complete.

## Old-link editing compatibility

Program GET now reports the selected edition's source player ID after numeric/WHOOP alias selection. The editor saves an opened legacy edition to that owner only when it is the same player's exact numeric/WHOOP identity. Foreign/malformed identities fall back to the selected player. This keeps edits to Voronkova's existing old-link program on that program's existing key, preserving its token. No migration or token creation/rotation occurs. New-date generation, other program actions and general legacy-link unification are outside this targeted fix.

## Validation

- Full suite: 891 tests, 890 passed, one existing skip. Three new meaningful save-identity tests cover both workspaces and reject foreign/malformed aliases; program-GET alias tests verify source ownership. Existing manual-video policy, set-removal, clinical/regional generation, facts/progression, queue and publication tests pass.
- Production webpack build passed. `git diff --check` passed.
- Fictional local Safari fixture, both 15/3 rosters: videos/instructions visible, Editor/Preview and sticky mode toggle, graph navigation, real-time planned set count update, extra program actions, and isolation of per-space plans. Tested kg 100→102.5, first rep 4→5, target RPE 8→7, tempo 2-0-X-0→5-0-X-0, a multiline description and fourth set. One synthetic program save persisted all values and survived reload; second space retained its original 100 kg and three sets. One synthetic manual-video save; inline YouTube player loaded, closed successfully and external fallback remains.
- Safari 320×667 inspected after final changes: full-width rest instructions, visible media/technique, aligned kg/RPE, two set inputs per row, expanding load comment, contained dose summary and sticky save. Responsive mode exited after inspection.
- Real production read-only checks confirmed existing video URLs for KB Deadlift, Single-Leg Romanian Deadlift (DB), Slider Hamstring Curl and Trap Bar Deadlift. These are existing library links, no new exercise videos chosen or saved in production. Synthetic preview used the existing Trap Bar video URL only on localhost.
- Original real athlete programs/results, Voronkova's link and user's open program edits were not changed or reloaded. Tests used a separate local tab. Closing that tab was interrupted by user Safari activity; no claim that the local tab was closed. Local servers stopped after QA.
- Proof: /private/tmp/program-studio-overview-final.png, /private/tmp/program-studio-preview-final.png, /private/tmp/program-studio-mobile-final.png.

## Release status and checks

Local only; source has not been transferred/published. Production remains 27f5ba2, image 23cd26019a228f9e6b949300a71538d6b8a3eb0b1105d964b28335d4f0d5da56. After explicit authorization: build exact committed archive on the Russian server; verify candidate auth/health, both rosters/inventory, source-identity metadata, unchanged real plans/old link and UI/CSP bundle; exercise legacy program edit persistence only with an owned synthetic fixture. Recreate only gym, retain rollback to 27f5ba2. Inspect real Safari both spaces without discarding any unsaved user edits.

CSP adds only self and https://www.youtube-nocookie.com for child frames; existing script/connect/font/object/frame-ancestor/security headers are preserved. No athlete health/readiness data is sent to YouTube; iframe URL contains only the selected public video ID and playback options.

## Next grouped work

1. Apply the same visual system to history, cycle outcomes and team draft review; use factual graphs with explicit completeness/source markers.
2. Finish legacy-link identity consistency for future-date generation, player logs/feedback and all coach actions, with edition/collision protection.
3. Review the remaining library video gaps using coach-approved exact exercise variants; do not auto-select look-alike exercise videos.
