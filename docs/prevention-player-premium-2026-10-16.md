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

## Publication verification

Final application `ffc348b` published 16 October 2026 at 00:33:25 MSK (`2026-10-15T21:33:25.477032Z`), image `sha256:1f7e4ca72b1c1e94f6db52b9f90d6bdc3a54a18562c91e3d41a24cceae56ae92`. The dock is bounded to the 540px athlete canvas (508px desktop control width) and half the viewport height, with reserved content space and scrollable exceptional states.

Both final local/server builds passed. Isolated worker-disabled candidate checks passed for both authoritative rosters (15 + 3 players, zero overview load errors), all 15 courses/eight regions, six disposable API/Valkey execution cases, empty assignment list/token-only access restrictions, partial rejection, exactly-once completion/replay and stale writes. Exact candidate test keys were removed and verified absent.

Post-publication checks passed: exact release, both overview/catalogue spaces, authenticated coach-only access, storage ping/read-write, fresh backup/recovery, HTTPS 200, running production container with zero restarts. CUA inspected published mobile screens in both spaces with two fictional unlisted identities: only their two assigned courses appeared; set/rest/pause/reload, embedded video/context/Escape and course popup worked. The 12 exact temporary keys (TTL safety net) were removed and absence verified; no real athlete, roster, library or gym-program writes. Production screenshot: `/private/tmp/prevention-player-review/production-mobile.jpg`.

Only Gym was recreated. Existing Russian transport, isolated Valkey, runtime secrets, networks, worker and 1GiB memory retained. Rollback compose `/srv/readysix-ru-production/apps.private.compose.yaml.before-prevention-ffc348b` retains `1e66e27`. Owned candidate and local test servers were cleaned.
