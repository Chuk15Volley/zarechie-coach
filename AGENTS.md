
## Gym product boundaries

- The gym application is https://gym.readysix.app; player state, readiness, complaints and permitted training load come from https://readysix.app. Preserve ReadySix as the authoritative source; gym workout logs and reaction reports do not replace that assessment.
- Deploy the gym container on the existing Russian server; the former Vercel gym project is retired. Preserve the runtime secrets, isolated Valkey storage and provider gateway.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- User clarification 2026-10-05: automatic ReadySix red status/percentage may be overridden only to produce a symptom-adapted coach-review draft of any selected method. Medical contraindications and acute/systemic red flags remain binding. Development strength follows docs/strength-development-v2.md; full Green main work 40–50 min, exact-exercise completed kg/RPE, all exercises rotate weekly. Never claim a light adaptation provides a heavy development stimulus.

- User-approved manual selection policy (2026-10-05): explicit coach workout selection overrides automatic ReadySix statuses and percentage caps for every method in both spaces. Medical contraindications, pain-based regional adaptations and coach prohibitions remain binding. See docs/manual-method-selection.md. This supersedes earlier automatic strength readiness limits for manual generation only.

- User-approved strength stage 1 (2026-10-12), both workspaces: retain A1/B1/B2 by exact slot and exercise for a cycle of four saved strength session dates, separately by selected chain; rotate accessories. Manual anterior/posterior selections permit consecutive strength days with reduced overlapping work and preserved permitted primary effort. Local symptoms unload related tasks rather than all healthy regions; medical holds remain binding. Persist coach replacement reasons within workspace/player-scoped session history; unspecified/one-off edits do not create exclusions, explicit restoration can remove a learned exclusion. Both strength modes and swaps of new strength drafts use the reviewed server catalogue. See docs/strength-cycle-regional-2026-10-12.md; this supersedes all-exercise weekly rotation and the one-strength-per-week gate for this policy.

- User-approved strength stage 2 (2026-10-12), both spaces: only structured coach-confirmed deficits from the existing development plan guide accessories; no deficit inference from tests, symptoms or position. Same-exercise completed kg/reps and exercise-level RPE can propose bounded coach-reviewed progression. ReadySix match participation, court blocks, regional load and confirmed travel adjust related dose while preserving healthy permitted work; missing context prevents increases rather than replacing the manual method. See docs/strength-individual-load-2026-10-12.md.

- Published strength stage 3 (2026-10-12): revision 6d09cd1, active worktree /private/tmp/gym-rotation-chain-release. Workspace-scoped available weight ladders, explicit experience and cycles of four server-confirmed fully completed dates replace saved-plan counting. Strength logs persist beyond 60 days; saved/partial/skipped/undone plans never advance a cycle. See docs/strength-equipment-completed-cycle-2026-10-12.md.

- User clarification for stage 4 (2026-10-12), both spaces: inventory must be entered once for all players per workspace from the main screen without selecting a player. All players have coach-confirmed strength experience of 5+ years; use a shared experienced cohort setting and remove individual experience entry. Preserve symptom-based local adaptation and the completed-cycle policy. Requested work adds a coach cycle review and bounded repetition progression when the next available weight step exceeds 5%; see docs/strength-cycle-review-reps-2026-10-12.md.
