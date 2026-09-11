# Training history incident — 2026-09-09

## Cause and recovery

A destructive ReadySix storage cutover replaced shared Redis contents with a
different storage snapshot. Coach training history was collateral damage;
the July records did not represent the full training history.

For Zarechie, recovery used the September 4 morning encrypted archive and the
newest verified pre-migration evening snapshot. Missing keys were inserted
atomically; existing plans were preserved. Historical indices were merged
without overwriting existing members. A subsequent three-way reconciliation
updated 99 old metadata values only when the current value matched the earlier
snapshot or was demonstrably older. Concurrent differences were not overwritten.

Verified inventory: 277 workout plans and 162 actual reports. Recovery inserted
2,716 absent keys across two passes. Before/source/after encrypted incident
archives are kept in private Blob under `operations/incidents/history-2026-09-09/`
outside ordinary backup retention. No player records or secrets belong in Git.

NK Pro restoration is pending separate authorization; do not initialize its
baseline from the incomplete current store.

## Prevention

- The external Blob session baseline survives replacement of Redis.
- Backups validate both plan records and discoverable date indices.
- Missing history or an absent baseline causes a quarantined archive, not a new
  healthy baseline; retention is not applied on integrity failure.
- Every new archive is downloaded, byte-compared and decrypted before success.
- Backup listing paginates fully before selecting the newest archive.
- System health and the existing five-minute SLO job check history integrity.
- The unsafe source migration is retired in the ReadySix companion change.

## Safe recovery workflow

Use a protected environment file, never command-line secret literals. Obtain
workspace-specific approval before production writes. Begin with a dry run:

```sh
node --env-file=/protected/env scripts/recover-missing-history.mjs zarechie operations/backups/zarechie/EXPLICIT-ID.backup
```

Review discrepancies and archive provenance before adding `--apply`. This is an
additive recovery, not a wholesale restore. `reconcile-recovered-history.mjs` is
specific to this incident, not a generic migration tool. Bootstrap a missing
baseline with `initialize-history-baseline.mjs` only from an audited archive
after verifying the live records. Then create a fresh encrypted backup, run the
isolated recovery drill and `smoke-history-recovery.mjs` against production.
Keep incident archives until recovery and retention requirements are reviewed.
