# Coach visual package 2: cards, editor and team drafts

Status: local release candidate based on published 6d6d13c (documentation 85b32c9). Server source transfer, candidate checks and production publication require approval for this revision. Both workspaces share the implementation. No production athlete data, inventory, programs or queues were edited during this package.

## Changes

- Exercise cards and team draft previews share a planned-prescription strip: kg (per implement when appropriate), the exact per-set repetitions/time, and explicitly recorded target RPE maximum. Missing kg stay “По RPE”; absent RPE stays “Не задан”. Never infer target effort from session/actual RPE, transfer kg across variants, or invent a 1RM prescription.
- Structured editor inputs label planned kg, each set, actual kg and exercise RPE separately. Fractional kg are supported without the former hardcoded 2 kg browser step. Main load controls appear before collapsed video and secondary descriptions. Existing overrides open their description; clinical warnings and autoregulation remain visible.
- The single existing save action is sticky through the session, with player/date context and the original save guards. Safari needed removal of the session's clipped overflow ancestor. On phones the document owns scrolling, so the main pane must not trap sticky controls; horizontal clipping uses `clip`, not a new scrolling ancestor. A compact mobile toolbar exposes printing/template/copy/reschedule via an explicit additional-actions menu. Completion remains the same explicit existing action with a descriptive accessible name.
- Strength progression cards expose manual recheck, loading, error and success states. Refresh clears old hints and uses only the authenticated read-only progression/history routes. It does not change exercises, actuals, create a generation queue or save programs. The existing exact-exercise/dose/scope/five-minute application guard stays intact. The refresh request has a 25-second bound, aborts on context changes, and never substitutes the older progression engine when strength generation is unavailable.
- Team draft review uses count tiles, readable two-column cards (one on phones), explicit status, filter empty states, compact prescription previews and collapsed technical explanations. Existing medical/ReadySix warnings stay outside hidden technical details. Opening a program is labelled “Открыть программу” and does not claim it saves. Review/publication authorization, freshness, queue revision checks and recovery remain unchanged.

## Validation

- Full suite: 876 total, 875 passed, one existing skip. Production build passed. New regression cases cover read-only refresh in both spaces, HTTP failure/retry, incompatible-engine rejection, timeout and cancellation, optional-history errors and exact planned RPE/implement metadata in previews.
- Safari full application with fictional 15/3 rosters, both spaces: simulated 503 followed by manual recheck success; edited 102.5 kg and reps; changed dose invalidates old proposal; one explicit fixture-only save persisted kg/reps after reload. Rechecks performed zero program saves. No real credentials or athlete records were used by the synthetic fixture.
- Safari team drafts: new count/status layout, exact kg/reps/RPE previews, filter empty state and review mark. Publication remained disabled without a fresh ReadySix preflight even after marking a draft reviewed.
- Safari desktop deep scroll and Responsive Design Mode 320×667: save remained visible; compact mobile menu exposed print/template/copy/reschedule. Responsive mode was exited and the temporary local tab closed, restoring the user's original production Zarechie home.
- Proof files: /private/tmp/premium-editor-safari-zarechie.png, /private/tmp/premium-editor-safari-nkperf.png, /private/tmp/premium-editor-safari-team-drafts.png, /private/tmp/premium-editor-safari-mobile.png.
- Local fixture/proxy and its synthetic records live only in /private/tmp/premium-editor-ui-fixture.mjs; no fixture route or key is included in the source checkout or deployment.

## Release checks after approval

Build the exact committed source on the existing Russian server, with isolated candidate/worker disabled and no public port. Check health, unchanged 15/3 roster identities, inventory 73-value ladders, preview RPE metadata, read-only progression and original queue integrity. Check authenticated main UI in Safari after publication; do not save/complete/publish real athletes' records for tests. Recreate only gym, preserve rollback to 6d6d13c and all runtime transport/secrets.

## Next package

After this release, improve Today, weekly planning and load tables together: consistent visual density, visible missing facts/freshness, and fast navigation from an attention item to the relevant player or draft. Keep ReadySix the only source of readiness/medical permission.
