# Prevention coach workflow and premium choices

User request: complete the follow-up improvements, inspect the actual Prevention tab and make selection windows match the application. Based on the published `f666fbe` source in `/private/tmp/gym-prevention-release`; preserve the Russian deployment, transport, ReadySix authority and all course prescriptions.

## Workflow

- Coach tabs: team overview, player assignments, PDF library. Assignment order: player/region/program, source dose, exercise preview, final ReadySix review and save. Missing context is explicit; optional pause/comment controls remain folded. All assigned programs for the selected player are listed across regions, and overview links open the right player and course.
- Team overview uses authoritative workspace membership and up to four concurrent readers. Shows active courses, completion fraction, current phase/stage, partial set count and actual last completion. Search and active/review/empty/completed filters; per-player load failures remain visible. Old summaries are hydrated read-only from their assignments, without migrations or rewritten results.
- Main programs and Daily Routine remain separately assigned, completed and archived. The coach can select the companion directly; the player gets independent course cards for 2–3 active programs and a searchable picker for longer/history lists. No scheduling, missed days or time-driven advancement.
- The library exposes an actionable list of missing videos/cues, the two source names the user plans to fix manually, and retained source adaptations. Editing opens a focused modal with inline errors, Escape/focus return, body scroll lock and explicit save. Original PDF fields remain auditable. Nothing invents missing links or quietly rewrites existing assignments.

## ReadySix review

A hash compares source restrictions, observations, active injury clinical content, clinical reasons and coach restrictions. Administrative injury timestamps/IDs, calendar and readiness percentage changes alone are excluded. The hash is recorded with the coach review, without duplicating raw health data in assignment summaries. New or legacy unconfirmed context appears in the overview as requiring review; unavailable source is separate from an unchanged/cleared state. Explicit confirmation checks the current revision and source hash, verifies medical holds and exercise bans, then changes only review metadata. Course dose, completed/partial editions, results and history stay unchanged. New assignment submission rejects a changed clinical hash after the on-screen review; an acknowledged replay still returns its original assignment. The existing policy for manually reviewed assignments during source unavailability remains explicit and does not claim medical clearance.

## Selection controls

One shared component replaces native menus across existing coach/player/library screens and the former inline dashboard picker. Graphite/jade surfaces, selected checkmarks, bounded viewport-aware portals, long-list search, keyboard arrows/Home/End/Enter/Escape/Tab, disabled choices and inherited disabled fieldsets. Existing option values and native-style change handlers are preserved. Menus inside dialogs stay inside the active dialog; outside clicks close them. Reduced motion is respected. Server settings, clinical logic, gym logs and assignment progression are unchanged by the control replacement.

## Validation

- 1115 tests passed; one pre-existing optional local-Valkey test skipped. Full production build passed.
- Inspected original live Prevention tab and native region menu in Safari before editing.
- Built local app tested through CUA with fictional players in both spaces: assignment/course/phase, Knee phase 4 and optional mobility, separate Foot Daily Routine, overview-to-assignment navigation, missing-field editor/save, long-list search, keyboard selection/Escape, partial reload and explicit full completion; independent course progress and mobile overflow checked. No real athlete assignments, programs, results or library edits were made by UI verification.
- Server candidate and production evidence to be recorded after publication.
