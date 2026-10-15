# Prevention actual set results

User requested actual weight/repetition entry for every Prevention approach, with coach visibility, like the gym. Based on published `ffc348b`, worktree `/private/tmp/gym-prevention-release`, branch `codex/prevention-courses`.

## Data and workflow

- New `result` command atomically saves a prescribed set's actual and marks its execution. Current `results` are archived with the lesson's `history` entry on explicit full completion and cleared for the next lesson. Legacy mark-only clients and records remain valid; old completions never acquire invented weights or repetitions.
- Repetition exercises record integer actual reps; timed work records seconds per side/hold, and repeated holds record their actual count. Weight is a numeric kg value, with up to two decimal places and an explicit zero distinguished from missing weight. Free-weight exercise names use the existing gym load-entry requirement; DB/KB labels refer to one implement. Other load entry is optional and never inferred as bodyweight. No tonnage, 1RM or training progression is inferred from these facts.
- New actuals bind the assignment revision, session, prescribed key and exact source exercise identity/name/dose/set count. Stale writes, future/unperformed historical keys, incompatible units and malformed values are rejected. Idempotent receipts include actual payload and exercise identity; retries cannot duplicate a completion or silently replace different facts. Explicit source refresh preserves partial/current and completed editions, including actuals.
- Players open the same premium result sheet from a set card, the current-approach dock or completed work timer. Timer expiry itself never saves a fact. Plan and fact stay distinct; Save is disabled for an unchanged existing result, Cancel changes nothing, and explicit unmark removes the current fact. Drafts survive reload only for the same exercise identity; pending saves recover using the original request. A lost/malformed acknowledgement remains pending. Medical holds/bans still reject new execution; editing an already recorded fact does not prescribe new work.
- Coach assignment detail shows per-set Plan/Fact in the current lesson and execution history, with an explicit Refresh results button. Player history uses the same comparison and allows factual corrections to existing executions. Corrections preserve cursor, completion date, session prescription and status, including fully completed/archived history. Players still see only coach assignments; no library/self-assignment/calendar/readiness form was added.

## Validation

1130 tests passed; one pre-existing optional local-Valkey test skipped. Production build passed. Added tests cover rep/time/hold units, decimal/zero/missing weight, validation, atomic save, payload-bound replay, conflicts, exact exercise identity, undo, refresh/history preservation, completed-history correction, owner/coach access and medical holds.

CUA with fictional players checked both spaces, 320/390/430 mobile widths, mandatory kg and decimal input, no plan-to-fact prefill, unchanged Save, Cancel, draft reload, actual set save/reload, explicit full completion, coach current/history Plan/Fact, historical correction without advancing and explicit undo. A local HTTP proxy dropped exactly one successful result response: reload and retry recovered the same recorded fact without duplicate execution. Five 2-second hold cycles opened the confirmable actual-time/hold form. Final compiled app verified exact exercise-bound save/draft restore and coach Refresh results. Screenshots in `/private/tmp/prevention-results-review/`; no real athlete/program/roster/library results were changed by testing.

Publication verification is appended after deployment.
