# Player mobile controls and rest order — 2026-10-11

The open exercise list now scrolls in its own area during an active workout. The current set, rest/hold timer and undo controls occupy a separate bottom area; the footer respects the device safe area. Short viewports omit the identity header during active work. No program card is covered by the workout controls.

Browsing or using block navigation no longer changes the execution block. Completing, skipping or undoing a set still advances/restores the actual execution state. Only the current prescribed set opens its result editor automatically; every exercise and its set prescriptions remain visible. Removed stale references to the deleted focus-mode setter from sync, completion and undo paths.

Rest labels distinguish pauses between exercises, sets, and series/circuits. Legacy block notes with both set and exercise pauses use sequential sets unless they explicitly describe a pair, triple, circuit, arrow sequence, or carry an explicit exerciseOrder. A note that only says “between exercises” retains its previous circuit interpretation.

Regression coverage includes Voronkova's A/B/C pair/triple prescriptions (10→180 seconds; 15→90→120 seconds), D sequential sets (75 seconds between sets, 90 between exercises), and E (60 seconds). Existing explicit order, block pauses, zero-rest transitions, skipping and completion tests remain applicable.

Verification: 645 tests passed, one skipped. Production build, mobile Safari and production smoke recorded at release time. Athlete programs and results are not modified by this change; UI completion checks use an isolated disposable fixture.
