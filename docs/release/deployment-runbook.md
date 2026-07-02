# PH-10 Deployment Runbook

Marker: `CUTOVER_HUMAN_APPROVAL_REQUIRED`

Scope: release-readiness runbook for HRMS. This document prepares deployment, but it does not approve UAT, production cutover, or rollback execution.

## Preconditions

| Check | Evidence | Owner | Date |
|---|---|---|---|
| Full API regression | `npm run check` GREEN | release-lead | 2026-07-02 |
| Full web regression | `npm run web:check` GREEN | ui-lead | 2026-07-02 |
| G14 read-only analytics | `G14_READ_ONLY` and `MART_REFRESH_IDEMPOTENT` tests GREEN | analytics-lead | 2026-07-02 |
| Migration dry run | `MIGRATION_DRY_RUN` and `RECONCILIATION_CERTIFIED` evidence GREEN | migration-lead | 2026-07-02 |
| Backup restore drill | `BACKUP_RESTORE_DRILL` checklist prepared | ops-lead | 2026-07-02 |
| Security evidence | `SECURITY_SCAN_NO_SECRETS`, P02/RLS, PII suppression evidence prepared | security-lead | 2026-07-02 |

## Deployment Steps

1. Confirm change window, approvers, and rollback owner.
2. Freeze release branch and record artifact checksums.
3. Apply configuration using environment variables only; no secrets in repository.
4. Deploy API and web artifacts to staging.
5. Run smoke checks for P01, G01, G12, G13, G10, G11, and G14.
6. Refresh G14 mart and record refresh hash.
7. Confirm monitoring, audit, and backup jobs are active.
8. Park before production cutover until the human release authority records approval.

## Human Gate

Production deployment, UAT sign-off, cutover, and rollback authorization require explicit human approval. The marker is `CUTOVER_HUMAN_APPROVAL_REQUIRED`.
