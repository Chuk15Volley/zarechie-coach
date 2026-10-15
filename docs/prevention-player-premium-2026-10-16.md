# Player Prevention: mobile execution

Based on published `1e66e27`, in `/private/tmp/gym-prevention-release` on `codex/prevention-courses`. User requested the premium mobile player experience and clarified that players only see coach assignments, with gym-style exercise cards, sets, repetitions/time and video.

- Compact identity header scoped to Prevention; a picker switches only the player's personal assignments. Empty state has no library or self-assignment action. Main course is preferred to its supplemental Daily Routine when no valid remembered choice exists.
- Exercise cards use the gym's visual set rows, English source names, explicit prescribed dose, separate RIR/RPE, tempo, per-side reminder, source adaptations and technique details. Shared video preview and modal now serve both gym and Prevention; source links stay exact. The modal keeps the prescription/cue beside the video, original-video fallback, Escape, focus return, scroll lock and mobile bounds.
- Persistent bottom controls show the current prescribed approach and allow marking it, opening the work timer or returning to the exercise. Block navigation follows actual circuit order. Pauses, sides and repeated holds retain existing source semantics; no timer marks a set or completes a lesson automatically. Existing pending-save receipts, CAS, source safety and local timer/progress restoration are preserved. An ambiguous final-course save can still be retried after reload.
- Course progression remains completion-driven, with full set completion and a separate confirmation before advancing. Completed/history records remain read-only. No scheduling, readiness assessment or new reaction form. Medical holds and coach bans remain binding; source unavailability stays explicit. Existing real assignments/results are not rewritten.
- Selection popup height allows multi-line course names and subtitles without treating each as a short single-line option.

## Local validation

1121 tests passed, one pre-existing optional local-Valkey test skipped; production build passed. Added behavior tests cover prescribed-key status/circuit selection, source display units and token-only access boundaries. The player without assignments receives an empty list even with spoofed player/workspace/course query parameters; coach catalogue/assignment endpoints reject the share token, and the player endpoint rejects self-assignment.

CUA checked fictional players in isolated local storage: mobile 320/390/430 widths without horizontal overflow, desktop layout, individual approaches, floating rest/pause/+15 seconds, paused reload, independent course selection, exact timer bounds, bilateral work/side pause/explicit mark, five separate 2-second holds with explicit final mark, complete lesson/next lesson/reload, read-only history, source-unavailable and medical-stop states, empty assignments, embedded video/context/Escape/focus return, and comparison with an active fictional gym workout. No real athlete records changed. Screenshot: `/private/tmp/prevention-player-review/after-mobile.jpg`.

Server candidate and publication verification are recorded after deployment below.
