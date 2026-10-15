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
