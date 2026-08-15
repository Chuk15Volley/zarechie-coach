# Match-day primer: control acceptance

## Scope

The game-day generator is accepted against five positional profiles and the full set of readiness modes. These are control examples, not fixed templates: the generator remains free to select another approved combination when history and readiness support it.

Every normal control primer has exactly three pairs:

- A: one lower-body strength movement plus one lower-body ballistic movement;
- B: one upper-body strength movement plus one upper-body ballistic movement;
- C: one trunk strength/isometric movement plus one trunk ballistic movement.

The full profile uses two rounds, 20–25 minutes of main gym work, work-set RPE 6 and session RPE 3–4. The athlete stops a set when velocity, landing quality or pain worsens.

## Position controls

| Position | A: lower body | B: upper body | C: trunk | Coaching rationale |
|---|---|---|---|---|
| Setter | Trap Bar Deadlift + Lateral-to-Vertical Jump | Single-Arm DB Bench Press + MB Chest Pass | Pallof Press ISO + MB Shot-Put Throw | Lateral transition, rapid force transfer and whole-body stiffness without extra jump volume. |
| Middle blocker | Hang High Pull + CMJ | Chest-Supported DB Row + MB Chest Pass | Copenhagen Adductor Plank + MB Overhead Slam | Vertical impulse and short block-cycle readiness, with adductor and landing-chain support. |
| Outside hitter | RFESS + Approach Jump | Single-Arm DB Bench Press + MB Rotational Throw | Pallof Press ISO + MB Shot-Put Throw | Approach-jump specificity, unilateral force and rotational transfer. |
| Opposite | Trap Bar Deadlift + Loaded Jump Squat | Push Press + MB Overhead Throw | Half-Kneeling Pallof Press ISO + MB Rotational Throw | Vertical and hitting power; overhead pair is allowed only with low shoulder load and pain-free motion. |
| Libero | Goblet Squat + Lateral Bound | One-Arm DB Row + MB Chest Pass | Suitcase Carry + MB Shot-Put Throw | First-step/lateral readiness and trunk transfer, without unnecessary vertical jump exposure. |

Loads in these controls are not fixed. The generator uses the athlete's last three successful exposures; without comparable history it prescribes manual selection to RPE 6 and does not invent kilograms.

## Readiness controls

| Input condition | Required mode | Dose behavior |
|---|---|---|
| Current morning data, no red flags | `full` | 6 exercises, 12 total sets, 4–8 jump contacts. |
| Previous morning plus previous evening | `full` | Normal primer remains available. |
| Second consecutive match | `reduced` | 6 exercises, 8–10 total sets, 2–6 jump contacts. |
| Third consecutive match | `minimal` | 6 exercises, one round, no more than 4 jump contacts. |
| Incomplete or stale readiness | `minimal` | Only isometric plus ballistic pairs; no dynamic strength work. |
| No readiness plus active injury | `modified` | One safe round, affected chain excluded, prominent warning and mandatory coach review. |
| High shoulder load or shoulder pain | `adapted` | No Push Press or overhead medball movement; use horizontal press, row or safe medball throw. |

## Deterministic safety acceptance

The generator output is rejected before persistence when any of the following occurs:

- an exercise or alternative is outside the match-day library;
- a movement is placed in the wrong pair or body-region block;
- a full Olympic lift with a catch is used;
- overhead work remains when the shoulder flag is active;
- dynamic strength is used with stale readiness data;
- the set, duration or jump-contact ceiling is exceeded;
- the three-pair structure is incomplete.

Batch auto-save is disabled on match day. A coach must inspect and manually save every generated primer.

## Repeatable validation

- `npm test` validates the deterministic position, readiness, structure and safety matrix.
- `npm run test:match-day-live` performs five non-persistent model generations when a valid `OPENAI_API_KEY` is available locally.
