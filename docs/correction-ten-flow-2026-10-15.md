# Ten correction-workflow improvements — 2026-10-15

User authorized implementation/publication in both spaces with existing block positions, design, methodology and real records preserved.

1. Saved queue status no longer disables a deliberate correction: the existing primary button becomes “Сохранить изменения” when the loaded saved baseline differs. Completed-session and clinical/day-plan guards remain binding.
2. Add exercise reuses the exact server catalogue, eligibility/bans, variants, description and existing video lookup. Original manual-add defaults remain three × eight, no assigned kg, one implement; the coach confirms dose. Existing cards are not renumbered.
3. Enter/Shift+Enter traverse planned numeric fields; bulk Enter retains its explicit apply action. Cmd/Ctrl+S saves, Shift adds save-next. Existing native text undo remains inside inputs. Legacy global roster shortcuts cannot act underneath the modal.
4. Replacement begins in the current movement group, allows All, preloads/caches the catalogue, and supports arrows/Enter. Player/date/slot-scoped search filters survive closing the picker.
5. Existing expanded comparison area embeds a candidate's exact YouTube video without a new tab or automatic playback.
6. Local session-only view state restores player/date-scoped scroll anchor, focused field and open disclosures. The field retains its screen offset while asynchronous hints settle; user interaction stops anchoring. It neither saves nor publishes a program.
7. Existing header distinguishes changed local program, server draft and program saved to the player.
8. Replacement closes the picker and focuses planned weight for a loaded variant, otherwise RPE. Existing replacement logic clears inherited kg/history; no load transfers between variations.
9. Existing set-count text is editable. Counts 1–20 match the existing draft API; retained assignments preserve exact units/format, appended rows copy the last assignment. Invalid counts reset; no 21st set is added.
10. Bounded local complete-session undo/redo covers replacement, loads, addition/removal of sets and blocks, alongside existing per-exercise undo. Histories scope workspace/player/date/saved revision; server loads and saves are not new undo edits. Completed sessions cannot be restored/edited through undo.

Initial validation: 969 tests passed, one existing skip, production build passed. Fictional Zarechie: numeric navigation, count 2→4 with original /side units, undo/redo, exact keyboard replacement and cleared kg, inline 260 px candidate video, catalogue add with cue, Cmd+S, saved-program repeat correction (22.5→24.5 kg), structural undo/redo. Fictional NK Pro: 21.5 kg/one implement and four /side sets saved with Cmd+Shift+S, next player opened. Filters and open commentary restored; focused D2 field returned at exactly the same 265.515625 px screen offset. Mobile 390 px retained 42 px set rows, 186 px existing-style header and no horizontal overflow.

Publication and final checks recorded below after deployment. No real save/review/video/result writes are used for QA. The separately requested four-draft date move is documented in four-draft-date-move-2026-10-15.md.

Published source `af250fd` on gym.readysix.app, 2026-10-15 01:30:51 MSK (2026-10-14T22:30:51.004Z), image `sha256:850d7781082d821a54c873c636380dafe7f2b92f119a59e7826d100c56038927`. Final local/server production builds passed; 969 tests passed, one existing skip. Final computed direct-count font is 16 px, including inherited-style override.

Actual API/worker checks ran on the exact image with physical network isolation and a disposable loopback Valkey: both spaces generated two fictional players, corrected/saved/reopened drafts, blocked stale clients and invalid RPE, preserved save idempotence and recognised separately saved copies. Repeat saving an already saved program with changed DB weight/count and a catalogue exercise persisted correctly, with unchanged methodology and no actual-result writes. Fictional NK browser repeated save also reopened at 23.5 kg.

Candidate and production read-only checks passed for 18 players, all 564 historical sessions through 14 October, 2118 catalogue cards, both 73-value equipment ladders, completed legacy aliases/37-set result, original three unsaved NK drafts, authenticated access and worker/storage. No pending/failed publication runs or active incidents. Public production UI checked Zarechie 15 October and NK Pro original 13 October correction cards: original block layout, 260 px existing video, 16 px count fields, correct draft status, exact movement default, catalogue addition picker and inline nocookie candidate video without autoplay. No real program fields, reviews, video mappings or results were written for QA; Safari tabs were untouched.

All 2504 protected program/result/index/token hashes and the catalogue fingerprint matched immediately before deployment, after deployment and after final UI checks. The separately authorized four-draft date correction was already complete before the deployment baseline, and was reverified afterward: all four on 15 October, no queue/programs on the 16th. Perova's saved original fingerprint remained 833d00dcda217e5bdbcfbbdbfbf4548d008544289d715db6ec59e5762fd2aa88 and her queue row is savedOutsideQueue.

Only Gym was recreated; 1 GB memory, runtime secrets, transport, isolated Valkey and publication/clinical guards preserved. Restart count zero. Rollback compose `.before-editor-workflow-af250fd` retained. Owned local servers, dependency symlink and three temporary QA containers removed.
