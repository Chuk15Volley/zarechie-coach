# Strength stage 7: coach-directed movement volume

Scope: both zarechie and nkperf; maintenance/development; full body, anterior and posterior chain. ReadySix remains the source of readiness and regional restrictions.

## Coach decision and generation

The completed-cycle editor adds ordinary volume / one fewer working set for each of the existing main movement slots A1, B1, B2. Reduction requires a separate trimmed reason (1–300 characters). Legacy decisions default to ordinary volume; cancellation clears the reason. Reasons, selection, progression and comments retain workspace/player/cycle scoping and compare-and-set protection.

The decision applies only to the immediate next cycle and selected chain/slot. Ordinary A1 has three sets, capped at two; B1/B2 have two, capped at one. The final prescription is the lower of the existing ReadySix/adjacent/regional dose and this cap, with a floor of one for normal loaded work. It does not subtract another set from an already lower dose. Symptoms/unloaded work take precedence and record the requested reduction as deferred. Medical holds remain binding.

Automatic kg/repetition increases are suppressed only for the selected movement. Existing downregulation, exact-exercise weight evidence and target effort remain intact. Healthy unselected movements retain their sets, RPE and progression. No accessory padding is added to reach a time target. A specifically reduced B2 may have one fewer set than the press: the structural audit permits this only with a matching coach decision and recorded reduction, preserving press dose rather than reducing unrelated work.

The first release covers A1/B1/B2, matching the existing cycle-decision editor; accessory-specific volume decisions are a later extension. Previously saved programs and execution facts are not regenerated.

## Result review

Generated plans retain the decision snapshot and the per-exercise dose effect. The next completed cycle's adjacent-cycle comparison shows actual last-exposure set counts, exact-variant exposure counts, historical reason and kg/reps/exercise RPE. It distinguishes observed lower volume, changed variant, symptom deferral, an already reduced dose, missing plan evidence, no confirmed decrease and a changed/absent latest decision.

A lower set count changes the dose: no direct RPE delta or causal claim about strength/tolerance is made. Session RPE never substitutes for exercise RPE. Later edits to stored coach decisions do not rewrite performed plans. Both cycles must contain four confirmed completed sessions; an incomplete neighbour cannot be skipped.

## Additional coach prohibition

Machine Hamstring Curl is removed from the strength catalogue and added to the shared coach-wide prohibition, including common machine/seated/lying aliases. Both spaces and all methods use the same prohibition; alternatives, new manual saves, copying and replacement checks retain the shared guard. Swiss Ball / Slider curls remain allowed subject to symptoms and other restrictions. Existing saved plans are not silently rewritten.

Saving the first plan of a new cycle now rebuilds anchor exceptions from the workspace/player-scoped server decision and confirmed source history. A keep decision no longer fails the variety gate at the cycle boundary; client metadata alone cannot authorize repeated anchors.

## Verification

- Full suite: 754 passed, one skipped; webpack production build succeeded.
- Dedicated tests: required reason/legacy compatibility, all six mode/chain combinations with each selected slot, preserved healthy doses, no double reduction of ReadySix dose, symptom precedence, history snapshots, missing/changed decisions, actual-volume result limitations and API persistence/CAS/isolation and first-plan save with a server-authorized anchor exception for both spaces.
- Daily generation: 24 synthetic scenarios through the actual input builder, asynchronous submission and completed-result polling, spanning both spaces, all chains and both modes, with and without a volume decision. Storage and ReadySix transport are controlled test fixtures; no external model is called and no athlete results are changed.
- Browser: extracted real editor/comparison components, both spaces, mandatory reason validation, save confirmation and historical reason display using a disposable synthetic fixture. Fixture removed before final build. Screenshot: /private/tmp/strength-stage7-ui.png.
- Separately checked current production e72db5c: six unsaved synchronous day generations (maintenance anterior/posterior, development full body for each space), all HTTP 200 and valid, no medical hold in the sampled players. Exact saved session and draft bytes remained unchanged. This verifies sampled production paths, not every athlete or the unpublished stage 7 image.

Release: application revision 1a81bce explicitly approved and published on gym.readysix.app in both spaces on 2026-10-12. Image sha256:f5f5742f1a1076924a68371221d209268a58630d00636690da57f134c7f7f8b5. Server candidate passed synthetic decision round-trip, first-plan save, completed-cycle outcome and prohibition checks in both spaces; synthetic records removed. Six unsaved day-generation probes passed in the candidate and six more passed in production (maintenance anterior/posterior, development full body, both spaces), with saved plan/draft bytes unchanged. Public HTTPS, authenticated health, review and rejected keyless access passed. Only gym recreated; temporary candidate removed. Rollback baseline e72db5c retained in /srv/readysix-ru-production/apps.private.compose.yaml.before-strength-stage7-1a81bce. Detailed report: /private/tmp/strength-stage7-deployment-2026-10-12.md.

## Next grouped work

1. Release and adoption: candidate validation, publication, short coach workflow check and a completed-cycle pilot with actual kg/reps/exercise RPE recorded.
2. Complete volume control: accessory movement slots, retain/restore ordinary volume decisions, bounded restoration and expiry reminders; preserve individual reasons and local medical constraints together.
3. Improve outcome review: adherence across all four executions, missing-fact checks, per-movement total sets/reps and regional ReadySix context, explicit coach outcome rating without inferring causality.
4. Improve day planning: team overview of anterior/posterior choices and consecutive-day overlap, inventory completeness, uncertain data flags and safe per-player errors/retries; expand async contract tests for partial data and transport failures.
