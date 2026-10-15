# Five final player presentation improvements, 15 October 2026

Baseline application8c63faa, source6ab4ae1. Shared player UI in Zarechie and NK Pro.

1. Video modal is portalled into the existing player shell, outside the animated
   workout main that previously became its fixed-position containing block. It
   stays within the viewport, with safe-area padding and internal overflow; exact
   trainer clip, original cue/warning, fallback, focus restoration, Escape and
   body-scroll lock retained.
2. Completed workouts retain status/date in the hero, exact set count/time in the
   existing overview and all block navigation/sync alerts. Remove duplicate100%
   progress, overview status/date and settings-summary date. Active workout
   controls and completion/pending-correction guards unchanged.
3. Existing history facts use aligned accessible definition-list metrics with
   Russian labels, exact original counts/time/RPE and separate original comment
   and early-completion reason. Missing facts are not invented.
4. Previous results group only identical target/kg facts, retaining sides, custom
   units and explicit per-implement kg. Mixed sets remain in original order. No
   change to retrieval, identity matching, exercise variation or recorded values.
5. Empty prevention no longer tells the player to perform an unassigned course.
   Instruction remains when assignments exist; API/course methodology unchanged.

No API, timer/order/tonnage engine, sync/feedback hook, methodology, real program
or result changes. The only prevention change is conditional header copy.

Validation before publication:1083 tests passed/one existing skip, local build
passed. Synthetic browser checks for both spaces: desktop/mobile video within
viewport, focus/Escape/close, unchanged Save disabled/Cancel, read-only history
metrics/full warnings/custom targets and empty prevention. Final deployment and
protected narrow record verification appended after publication.

## Publication and final verification

Application90598c1 published2026-10-15 at21:39:16MSK /18:39:16.310327Z,
image sha256:e05808718255de66334213553c5c874d990be216bc7a1373f7d7c05dfc9a6b7b.
Rollback compose:/srv/readysix-ru-production/apps.private.compose.yaml.before-player-finish5-90598c1.
Only Gym recreated. Runtime secrets, transport,1GiB memory, Valkey, worker and
backups retained. Running with zero restarts; temporary candidate removed.

Local/server builds,1083 tests/one existing skip, candidate and final production
smoke passed. Both spaces' exact stored trainer videos and all four prevention
catalogues retained (48/48/56/48), zero player writes by smoke.

Public browser checks: desktop video bounds Zarechie45–675px, NK Pro36–684px
within720px viewport. Mobile video bounds Zarechie199–645px, NK Pro202–642px
within844px viewport; neither space has horizontal overflow at390px width.
Original cues/warnings/fallback visible, Escape/close work. Real correction
Cancel-only, unchanged Save disabled, original50kg and2.5kg retained. History
metrics22/39min/3 and12/34min/3 unchanged; full original comment retained. Previous
identical facts compacted with exact kg/reps/sides, empty prevention instruction
absent. Active controls separately verified using a fictional local player only.

Eight narrowly scoped protected program/log/actual/feedback hashes for the two
reviewed players are identical before/final verification. No broad private export
or broad hash claim. No real program or result was written. Temporary browser
tabs closed, viewport reset, local fictional servers stopped, dependency symlink
removed, original coach/Safari tabs preserved. Proof screenshot:
/private/tmp/gym-player-final5-production-2026-10-15.jpg.
