# PH-10 Coexistence Plan

Marker: `MIGRATION_EXCEPTION_OWNERS`

The coexistence plan handles legacy approvals, external cases, and migration exceptions that are not imported into P01 at cutover time.

## Exception Register

| Exception | Disposition | Owner | Date |
|---|---|---|---|
| Pending legacy leave approvals | Keep in legacy workflow until completion; import final SR fact through G04/G12 only after certified | workflow-lead | 2026-07-15 |
| External disciplinary cases | Track as coexistence references; do not auto-import confidential case material without legal approval | legal-lead | 2026-07-15 |
| Payroll bank return files | Keep X.3 sandbox until bank certification completes | compensation-lead | 2026-07-15 |
| Pension PDA authorization | Keep as external case reference until PDA integration certification | pension-lead | 2026-07-15 |
| Unmatched legacy employee identity | Block migration promotion; owner must resolve source record or accept legal disposition | migration-lead | 2026-07-15 |

## Controls

- No exception can silently bypass P02 or G12.
- Every exception has an owner and date.
- Legal/business acceptance is required for unresolved exceptions.
- Analytics excludes unresolved exceptions unless a certified source fact exists.

Markers: `MIGRATION_EXCEPTION_OWNERS`, `RISK_OWNER_DATE`.
