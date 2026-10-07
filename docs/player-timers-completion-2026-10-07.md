# Player timers and completion — 2026-10-07

Timer audit covers sequential sets, exercise transitions, circuits (including uneven set counts), block transitions, skipped exercises, manually opened blocks, final completion, pause/resume, wall-clock catch-up and restored progress. Existing hold timers retain their five-second preparation, explicit second-side start, pause persistence and confirmation before a set is recorded.

Corrections:
- An explicit `после блока` / `между блоками` pause or `blockRestSeconds` applies at a completed block boundary. It does not become the pause between two exercises.
- A numeric zero is an intentional immediate transition. Missing/blank values still use normal defaults. Zero rest and completion with skipped exercises open no empty rest overlay.
- Power prescriptions such as `75–90 сек между качественными отрезками` are recognized as set/effort recovery; a separate two-minute exercise transition cannot replace that pause. Attempts and series are accepted as well.
- Fully completed programs are detected from planned set keys, rather than counting unrelated legacy log entries.

A local canvas celebration runs for up to 6.2 seconds only after the player explicitly records the last planned set. Falling paper uses gravity, drift, rotation, flipping faces and shaded reverse faces. It never starts from restored history, partial completion, skipped sets or early termination. The effect accepts no input, makes no requests, and cannot block controls. It respects reduced motion and stops on tab hiding, viewport resize, undo or unmount. Phone particle count and pixel density are bounded.

Verification uses automated regression tests and an isolated synthetic player in Safari; real athlete logs/programs are not modified.
