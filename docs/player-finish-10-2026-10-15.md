# Player app: ten final clarity improvements, 15 October 2026

Baseline production e94a651 (shoulder prevention merged with player53bebf0).
Merged current published source fbb926c before editing. Original shoulder Basic
56 / Comprehensive48, Knee48 and Low Back48 courses and selected-course restore
are retained exactly; this change does not edit any prevention or data API source.

1. History uses the same compact set comparison component as completed workouts,
   with no edit handlers or result inputs.
2. History separates explicitly logged zero kg from an absent/derived legacy zero.
   Raw log values are authoritative; fallback actuals require exact name, block,
   implement identity and set targets. Recorded reps retain per-side units; missing
   numeric reps are labelled absent, custom time/distance targets stay intact.
   An authoritative undone log cannot be resurrected by an older completed actual.
3. Original per-exercise autoReg warnings are visible in historical cards, outside
   the technique disclosure. Existing block rest/clinical text is unchanged.
4. Removed redundant global correction mode. Direct result action opens the same
   local Save/Cancel form; only done sets can be corrected on a completed workout.
5. One explicit pair/one-implement legend accompanies compact kg in set rows.
   Stored kg, loadUnits, summary facts and tonnage calculations are unchanged.
6. One completion surface contains original metrics and feedback confirmation;
   repeated completion headings/emoji removed. Feedback behavior remains unchanged.
7. Media loading/error/missing/preview share a reserved aspect-ratio container.
   Retry, exact clip selection, fallback, privacy and modal behavior are retained.
8. Cancel and Save form one aligned action group; unchanged Save stays disabled.
9. Full original history technique text is in a native disclosure. Warnings stay
   visible; the text is never rewritten, shortened or discarded.
10. Video prescription groups only identical targets; mixed sets retain ordered
    individual labels and exact custom units. No change to prescribed dose.

Validation: final tests/build recorded below. Local four new fictional tokens use
an in-memory store only. Both-space explicit Save preserves done/completedAt,
startedAt and elapsed time; Cancel/history cause zero log/feedback/other writes.
Media slots measured 220px during loading and after preview/missing; mobile390px
has document width380px. History has no correction buttons, preserves full
technique/warnings and custom3m/6 without false zero kg. Paired kg label, one-line
video prescription and aligned44px action buttons were checked in the browser.
No actual athlete program or result was saved by verification.

Production protection uses eight narrow program/journal/actual/feedback hashes
for the two reviewed players, never a broad private export. Runtime publication
will change only Gym image/release metadata, with rollback and transport/secrets,
Valkey, worker, backups and1GiB memory preserved.

## Published release and final verification

Application `8c63faa` published 15 October 2026 at 21:16:41 MSK
(18:16:41.271777Z), image
`sha256:c97fb6ae47c947f4f70a3125d56df5070fd06e65ddd7c1413490efcaefcecaa2`.
Rollback compose: `/srv/readysix-ru-production/apps.private.compose.yaml.before-player-finish10-8c63faa`.
Only Gym recreated; runtime, transport, mounts, Valkey, worker, backups and1GiB
retained. Production running, zero restarts. Candidate container removed.

1082 tests passed, one existing skip; final local/server builds passed. Candidate
and production smoke passed health, authentication, storage, backup/recovery,
both player pages/exact stored videos and all four course libraries (48/48/56/48).
No player writes by the smoke checks. API, methodology, timer/order/tonnage,
sync/feedback hooks and prevention source diff against published e94a651 is empty.

Published UI: both spaces retain 22/22 and12/12 completion with original dates,
saved times and actual values. Direct correction opens5 reps/50kg and8 reps/2.5kg,
with unchanged Save disabled; Cancel-only real checks, no real input/save.
Global correction button absent. Video shows2 identical sets compactly with the
same original clip, cue/warning/fallback. Both-space history is read-only with
zero correction buttons, original per-exercise warnings outside closed full-text
details and unchanged distance/repetition targets. The false legacy0kg display
is gone from the reviewed locomotion cards. Pair legend/compact facts verified.
Both spaces at390px have380px document width; no horizontal overflow.

The eight narrow protected keys have identical before/final hashes. No global
private export or global-hash claim; real programs/results were not written.
Original user Safari/coach tabs retained, temporary tabs closed, viewport reset,
synthetic local servers stopped. Screenshot:
`/private/tmp/gym-player-finish10-production-2026-10-15.jpg`.
