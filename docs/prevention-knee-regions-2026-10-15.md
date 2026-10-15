# Knee prevention and regional program library

User scope: Knee now, remaining PDFs will be supplied later. Both coach spaces and the existing player prevention section. Progress remains completion-driven, with no scheduled dates.

## Source transfer

Knee Resilience.pdf (40 pages) and Supplemental Information.pdf (16 pages), E3 Rehab. All 48 sessions / four phases of 12, 480 exercise rows, 46 distinct names and every original video annotation are included. Program tables: pages 18–21, 23–26, 28–31, 33–36. Original week/day remain provenance only. Exact source names, set/repetition/time ranges, RIR, page numbers and English cues are retained; Russian cues are additive. A full row comparison with the extracted source passed. No other directory PDFs imported.

Knee A has two exercises with two sets; B has four exercises with 3–4 sets. Optional C stretching and optional D knee mobility each have two exercises / 2–3 sets and are enabled independently. Low Back retains its original 2–4 main-set range and legacy storage key. Ten five-second Quad Set holds remain ten separate work intervals, with explicit next-hold confirmation and set confirmation after the tenth interval. Ordinary range/bilateral timers retain their behavior.

Application-added, coach-editable rest defaults: A20/B60/C15/D20 seconds between exercises; A30/B90/C30/D30 between rounds; blocks60, sides15. PDF does not specify these pauses. Last set has no trailing rest. No new medical prescriptions, step target or readiness assessment is generated.

## Coach and player behavior

Region and program selectors are shared between assignments and the PDF library. Only the chosen program's assignments are listed for the selected athlete. Selecting another region resets review, preview and assignment detail; in-flight catalogue reads are aborted, and mutation/pending/editor states prevent switching the source of a save. Each program has independent manual name/cue/video/rest edits and library revision in each workspace. The original Low Back key and assignment replay signatures remain compatible.

Coach can assign a full course or phase, main set dose, independent optional blocks, rests and a note after checking composition and existing ReadySix restrictions. Player sees region, original exercise order, doses, cues, video, timers and per-set confirmation. D sets are included in completion validation; missing optional mobility marks prevent progression. No date elapse or reload can advance the course. Existing CAS, share-token identity, delayed receipt replay and medical/coach restrictions remain binding. Refresh loads the assignment's own course and preserves completed/current partially executed sessions. It cannot replace one course with another.

Supplemental guidance is available to coach and player with source document/page attribution: functional changes and optional human-reviewed repetition (p6), medical assessment (p7), pain/dose discussion (p9–11), activity/recovery (p13–15); knee mobility source p15–16. The PDF pain chart is not an automatic permission threshold and no competing symptoms questionnaire is added. ReadySix remains authoritative for complaints/clinical restrictions. Supplemental guidance is stored in new assignment snapshots.

## Verification before server candidate

1054 tests passed; one existing optional local Valkey test skipped. Production build passed. Synthetic REST-backed browser checks passed for the existing Low Back assignment, partial/reload, lost completion response/replay, edit/refresh, paused-rest reload/+15 seconds and bilateral timer. New Knee scenarios passed: region/program selection; 3–4 main range; D without C; C without D; phase12 and course48; scoped manual correction; future refresh; ten separate five-second holds; no premature timer completion; partial/reload; all 20 prescribed sets and one actual session advance; coexistence with Low Back in player selection; mobile coach navigation and player 320/390/760 widths. No browser errors; screenshots inspected. These tests write only fictional local identities.

Server candidate and publication evidence will be appended after verification. No real athlete assignment, program or result is migrated or regenerated.

## Server candidate and publication

Application commit `422f444` built successfully on the Russian server. Worker-disabled, read-only candidate with no published ports passed actual Valkey/API checks for both courses in both workspaces: complete libraries/region metadata, authorization and unknown-course rejection, legacy-shaped Low Back assignment reads with byte-identical stored assignment, incomplete completion rejection including unfinished D sets, full prescribed set confirmation, one completion, delayed replay without second advance, stale writes rejected and player route without gym programs. Each scenario used unique owned synthetic identities and deleted its exact four keys in a finally block; absence was verified. No real athlete writes.

Repeated-hold browser follow-up also passed: reload preserved hold 3/10, paused countdown remained frozen, resume opened hold 4/10 and no set was automatically marked.

Published 15 October 2026 at 19:47 MSK (`2026-10-15T16:47:20Z`), image `sha256:1aa9414e1e7dd8971365a39a38aaa93f2c2a37f011b45d10cad5b44190478e1e`. Only Gym recreated. Existing 1GB limit, runtime secret, Valkey/server transport, worker configuration and unrelated services retained. Guarded rollback compose: `/srv/readysix-ru-production/apps.private.compose.yaml.before-prevention-422f444`, previous application `6b33f8d`.

Post-publication read-only checks passed: exact revision, health/storage, fresh backup and recovery, both independent 48-session courses in both spaces, Knee 480 rows, original compound hold dose, supplemental guidance and D rest default, deployed region/program/mobility controls, keyless coach rejection, invalid athlete token rejection and public HTTPS 200. No real athlete assignments/programs/results were migrated, regenerated or written by verification. Owned candidate and local synthetic servers were removed/stopped; production and rollback remain. Application source is on `origin/codex/prevention-courses`.
