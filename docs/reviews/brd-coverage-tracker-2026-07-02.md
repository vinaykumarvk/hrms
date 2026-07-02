# BRD Coverage Tracker

Date: 2026-07-02
Authoritative BRD set: `docs/brd/v3/G01-*.md` through `docs/brd/v3/G14-*.md`

## Current State

The PH-00 through PH-14 pipeline created a strong platform and proof-slice implementation, and the current automated suites are green:

- `npm test`: 125/125 API tests passed.
- `npm run web:test`: 32/32 web tests passed.

However, green phase tests are not equivalent to BRD completeness. The first four evidence-based coverage reports show that implemented runtime behavior is materially narrower than the signed BRDs and OpenAPI contracts.

## Audit Register

| BRD | Coverage Report | Status | Summary |
|---|---|---|---|
| G01 Employee Profile Management | `docs/reviews/brd-coverage-g01-employee-profile-management-2026-07-02.md` | **FAIL** | 25 FRs; runtime covers profile/list/masking/governed identity-change spine only. |
| G02 Personal Details Modification Workflow | `docs/reviews/brd-coverage-g02-personal-details-modification-workflow-2026-07-02.md` | **FAIL** | 23 FRs; runtime covers change-request proof slice only. |
| G03 Attendance and Leave Management | `docs/reviews/brd-coverage-g03-attendance-and-leave-management-2026-07-02.md` | **FAIL** | 23 FRs; runtime covers leave approval, cancellation, attendance regularisation, overtime, payroll-signal, and G04 SR handoff proof slices. |
| G04 Leave-SR Integration | `docs/reviews/brd-coverage-g04-leave-sr-integration-2026-07-02.md` | **FAIL** | 18 FRs; runtime covers G03-to-G12 relay, DLQ replay/discard, count reconciliation, and proof UI only. |
| G05 Transfer Relieving Joining Workflow | Pending | Not audited | Run `$brd-coverage`; PH-06/PH-08 likely partial. |
| G06 Promotion Posting Progression | Pending | Not audited | Run `$brd-coverage`; PH-08 likely partial. |
| G07 Training Skill Development | Pending | Not audited | Run `$brd-coverage`; PH-08 likely partial. |
| G08 Performance Appraisal Management | Pending | Not audited | Run `$brd-coverage`; PH-08 likely partial. |
| G09 Disciplinary Cases Punishment | Pending | Not audited | Run `$brd-coverage`; PH-08 likely partial. |
| G10 Payroll and Benefits | Pending | Not audited | Run `$brd-coverage`; PH-09 likely partial. |
| G11 Retirement and Pension | Pending | Not audited | Run `$brd-coverage`; PH-09 likely partial. |
| G12 Digital Service Register | Pending | Not audited | Run `$brd-coverage`; foundation is stronger here but full BRD still unverified. |
| G13 Document Management Secure Storage | Pending | Not audited | Run `$brd-coverage`; foundation is stronger here but full BRD still unverified. |
| G14 Dashboard and Analytics | Pending | Not audited | Run `$brd-coverage`; PH-10 likely partial. |

## Program Decision

The next phase is **not PH-15**. The next phase is a BRD-completion loop:

1. Finish coverage reports for G04-G14.
2. Build a prioritized gap backlog from all failed reports.
3. Remediate by risk and dependency, not by phase number.
4. Re-run each BRD coverage report until it passes.

Recommended first remediation target: **G01 canonical master**, because G02-G14 all depend on G01 as the system of record. Start with:

- `FR-EPM-001` create employee profile on hire.
- `FR-EPM-019` consumption API and real change-feed backbone.
- `FR-EPM-022` governed statutory-field change beyond display-name proof path.
- `FR-EPM-013` privacy/break-glass controls needed by the profile and consumption APIs.
