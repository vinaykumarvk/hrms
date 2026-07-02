# PH-11 Cutover Control Board

Marker: `GO_LIVE_HUMAN_APPROVAL_PENDING`

The cutover control board is the human authority for production release, rollback execution, and acceptance of release-day risk. PH-11 prepares the evidence packet and rehearses the control sequence; it does not make the board decision.

## Board Membership

| Role | Named owner | Responsibility | Date |
|---|---|---|---|
| Board chair | release-chair | Final go/no-go decision after UAT sign-off | 2026-07-19 |
| Business owner | business-owner | UAT acceptance and operational readiness acceptance | 2026-07-19 |
| Operations lead | ops-lead | Deployment window, rollback readiness, incident bridge | 2026-07-19 |
| Security lead | security-lead | Auth, RLS, PII, secrets, and audit evidence | 2026-07-19 |
| Migration lead | migration-lead | Reconciliation, coexistence, and exception disposition | 2026-07-19 |
| Compensation lead | compensation-lead | Payroll/pension readiness and risk acceptance | 2026-07-19 |

## Required Decision Inputs

| Input | Required evidence | State |
|---|---|---|
| UAT outcome | PH-11 UAT journal plus signed business minutes | `UAT_SIGNOFF_HUMAN_REQUIRED` |
| Defect posture | PH-11 defect triage with no unresolved S1 defects | pending board review |
| Release freeze | `RELEASE_FREEZE_CHECK` and artifact snapshot | pending board review |
| Rollback authority | `ROLLBACK_AUTHORITY_ASSIGNED` and bridge roster | pending board review |
| Local rehearsal | `CUTOVER_REHEARSAL_COMPLETED` and `PH11_LOCAL_RELEASE_SMOKE_GREEN` | evidence-ready |
| Production guard | `NO_PRODUCTION_MUTATION` during PH-11 | evidence-ready |

## Board Rules

- The board may approve go-live only after human UAT sign-off is recorded outside the agentic pipeline.
- The board may require a new rehearsal if any release artifact changes after the freeze.
- The board may accept or reject S2/S3 residual risk, but each accepted risk must include owner/date and business rationale.
- Rollback execution is a release-day human decision even when the authority has been assigned.
- The status after PH-11 remains `GO_LIVE_HUMAN_APPROVAL_PENDING`.

## Rehearsal Minute

PH-11 records that the release-control evidence is ready for the board. It does not record approval. The board meeting must replace this minute with signed attendance, decision, and action log before production deployment.

