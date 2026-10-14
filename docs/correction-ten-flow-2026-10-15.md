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
