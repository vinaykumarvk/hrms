# PH-10 UAT Scripts

Marker: `UAT_ACCEPTANCE_PACK`

These scripts prepare UAT execution. They are not UAT sign-off.

## Script 1: Executive Analytics

1. Sign in as analytics viewer.
2. Open G14 dashboard.
3. Confirm `G14_READ_ONLY`, `MART_REFRESH_IDEMPOTENT`, and `P02_SCOPE_FILTER`.
4. Confirm no PAN, Aadhaar, token, or password appears.
5. Drill through employee headcount and confirm `DRILL_THROUGH_AUTHZ`.

## Script 2: Compensation Readiness

1. Verify G10 payroll run has `RULE_VERSION_SNAPSHOT` and `PAYROLL_TRACE`.
2. Verify G11 pension case has `SR_VERIFICATION_GATE`, `QUALIFYING_SERVICE_LOCKED`, and `PENSION_CALC_TRACE`.
3. Confirm PPO events appear through G12 as `PPO_ISSUED`.

## Script 3: Migration and Coexistence

1. Run migration dry-run report.
2. Confirm `MIGRATION_DRY_RUN` and `RECONCILIATION_CERTIFIED`.
3. Review exception register and verify `MIGRATION_EXCEPTION_OWNERS`.
4. Confirm unresolved exceptions are not promoted.

## Script 4: Release Controls

1. Review deployment runbook.
2. Review `ROLLBACK_PLAN`.
3. Confirm `CUTOVER_HUMAN_APPROVAL_REQUIRED` is still open.
4. Confirm residual risks include `RISK_OWNER_DATE`.

UAT sign-off must be recorded by the business owner after these scripts run in the agreed environment.

## Capture Template

| Script | Result | Evidence link | Owner | Date |
|---|---|---|---|---|
| Executive Analytics | PENDING | To be captured during UAT | business-owner | 2026-07-15 |
| Compensation Readiness | PENDING | To be captured during UAT | compensation-lead | 2026-07-15 |
| Migration and Coexistence | PENDING | To be captured during UAT | migration-lead | 2026-07-15 |
| Release Controls | PENDING | To be captured during UAT | release-lead | 2026-07-15 |
