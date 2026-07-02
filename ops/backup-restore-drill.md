# PH-10 Backup and Restore Drill

Marker: `BACKUP_RESTORE_DRILL`

Scope: non-production drill plan and evidence checklist. This document does not execute a live restore.

## Drill Steps

1. Freeze writes on a sandbox clone.
2. Capture logical backup of PostgreSQL schemas, document vault metadata, and workflow configuration.
3. Restore into an isolated database namespace.
4. Run smoke checks:
   - Employee count matches source.
   - Service Register hash chain count matches source.
   - G13 document metadata count matches source.
   - G14 mart refresh returns `MART_REFRESH_IDEMPOTENT`.
5. Record reconciliation as `RECONCILIATION_CERTIFIED`.
6. Destroy the sandbox restore after evidence capture.

## Guardrails

- No production credentials in the drill file.
- No restore into production.
- No destructive operation against operational HRMS.
- Restore authorization is a human operations approval.

Owners and dates:

| Item | Owner | Date |
|---|---|---|
| Backup capture | ops-lead | 2026-07-15 |
| Restore validation | dba-lead | 2026-07-15 |
| Security observation | security-lead | 2026-07-15 |

Exit evidence must include source backup identifier, restore target identifier, row-count reconciliation, SR hash-chain count, document count, and the G14 mart refresh hash. Any mismatch becomes a release exception with owner and date.

Markers: `BACKUP_RESTORE_DRILL`, `MIGRATION_DRY_RUN`, `RECONCILIATION_CERTIFIED`.
