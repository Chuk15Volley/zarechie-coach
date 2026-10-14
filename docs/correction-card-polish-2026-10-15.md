# Correction-card finishing — 2026-10-15

User requested an audit of both spaces and a more orderly, compact correction card, with the same design and block positions. Read-only production inspection found wrapped repetition/unit/delete controls (82 px per cell), oversized generic link/button styles in the video panel, inconsistent field/button baselines and oversized header/section gaps.

Added a narrowly scoped correction stylesheet after the existing coach theme. Original block/card order, left-load/right-technique columns, responsive section order, palette, borders and functionality remain intact. Repetition cells now form a single 42 px row; numeric, unit, delete and add controls align. Weight, 1/2 implements and RPE share 40 px controls and aligned labels. Bulk editing adapts to available section width. Video URL fields/buttons and links have consistent local sizing instead of inherited oversized styles. Header, block, progression and regulation gaps are denser, without removing warnings, history or content. Shortened the visible YouTube label; its title retains the shared-both-spaces scope.

No program, result, catalogue, methodology, authentication or API changes. Existing autosizing handles long text and viewport changes. Fictional UI checks in both spaces: all eight cards/five headers retained, all 17 planned set rows 42 px, decimal-comma kg and implement edits saved, per-side repetition units preserved, save-next removed saved player, video save succeeded on fixture only. At 390 px there was no document/card/control horizontal overflow; an open long comment grew to fit text. 964 tests passed with one existing skip; build passed.

Publication/read-only verification recorded after deployment below.

Follow-up during publication: user explicitly requested videos always at the expanded or slightly smaller optimal size. Default video frame is now 260 px on desktop / 220 px on phones (formerly 150/130); optional expanded view remains 300/260. Pinned video uses the same sizes. Missing-video placeholder remains compact to avoid a large empty window. Position, playback and saved URLs unchanged.
