# HRMS Acceptance & E2E Test Suites

Black-box acceptance and end-to-end test cases for all 14 modules, traced to the v3 BRD functional
requirements and asserted against the contracts (`docs/contracts/`): OpenAPI endpoints/status codes,
`error-taxonomy.yaml` (exact `ERR-*` code per negative case), `state-machines.yaml` (valid + invalid
transitions), and `auth-matrix.yaml` (allowed vs forbidden role, PII masking, SoD).

| Module | Suite | Cases | FR coverage |
|---|---|---|---|
| G01 | `G01-employee-profile-tests.md` | 148 | 25/25 · 0 gaps |
| G02 | `G02-personal-details-workflow-tests.md` | 96 | 23/23 · 0 gaps |
| G03 | `G03-attendance-leave-tests.md` | 157 | 23/23 · 0 gaps |
| G04 | `G04-leave-sr-integration-tests.md` | 76 | 18/18 · 0 gaps |
| G05 | `G05-transfer-relieving-joining-tests.md` | 95 | 22/22 · 0 gaps |
| G06 | `G06-promotion-posting-progression-tests.md` | 104 | 20/20 · 0 gaps |
| G07 | `G07-training-skill-development-tests.md` | 93 | 24/24 · 0 gaps |
| G08 | `G08-performance-appraisal-tests.md` | 138 | 22/22 · 0 gaps |
| G09 | `G09-disciplinary-punishment-tests.md` | 110 | 28/28 · 0 gaps |
| G10 | `G10-payroll-benefits-tests.md` | 102 | 23/23 · 0 gaps |
| G11 | `G11-retirement-pension-tests.md` | 142 | 24/24 · 0 gaps |
| G12 | `G12-digital-service-register-tests.md` | 106 | 21/21 · 0 gaps |
| G13 | `G13-document-management-tests.md` | 122 | 21/21 · 0 gaps |
| G14 | `G14-dashboard-analytics-tests.md` | 108 | 23/23 · 0 gaps |
| **Total** | | **1,597** | **all FRs · 0 gaps** |

## Test-case structure
Each case has: `TC-G##-NNN` id, **Traces-to** (FR/AC), **Type** (Functional / Boundary / Negative /
Authorization / State-Transition / Data-Integrity / API-Contract / E2E-Flow — plus module-specific types
like PII-Masking, Financial-Integrity, Natural-Justice, Reconciliation, Privacy-Suppression), preconditions,
test data, numbered steps, expected result (negatives assert the exact error code + HTTP status), priority.
Each suite ends with an FR→TC traceability matrix and a coverage summary.

## Coverage emphasis by module (the high-risk guarantees each suite pins down)
- **G04/G12** — SR exactly-once effect, dedup tuple + `fact_key`, append-only immutability, hash-chain integrity, reversal-not-delete.
- **G09** — due-process / natural-justice (disclose-before-penalty, DA≠IO/PO SoD), statutory-timeline SLA pause.
- **G10** — 3-way SoD (maker≠approver≠disburser), double-payment prevention, reconciliation tie-out, exact-paisa calc.
- **G11** — qualifying-service from leave data, pension/commutation/gratuity/family-pension exact-rupee calc.
- **G14** — P02 row-level security (no G09/G10/G11 cross-scope leak), complementary suppression, bitemporal KPI reproducibility.
- **G01/G02/G13** — PII masking by tier, IDOR/access-control, tenant isolation, effective-dated integrity.
