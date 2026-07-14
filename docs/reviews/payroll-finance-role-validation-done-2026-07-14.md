# Done Report — Payroll/Finance/Pension Role Validation

**Date:** 2026-07-14
**Path:** standard (validation + thin capability-flag enforcement on stable contracts)

## Objective

Validate the payroll/finance/pension role cluster (G10 + G11) against the real runtime, classify each
capability as ENFORCED / DRIFT / DEFERRED, and — per the approved scope — close the thin capability-flag
gaps that were documented but never checked. The architectural role-string drift is documented, not built.

## Scope decision (user-confirmed)

**Validate + close the flag gaps.** Unlike the manager-hierarchy pass (where drift was architectural and
deferred), the payroll/finance drift was thin capability-flag enforcement — the same shape the hr_admin
audit fixed — on a money module. So the three documented-but-unenforced flags were closed additively, and
the remaining role-string drift was recorded as deferred design.

## Summary

The cluster's money-critical control — separation of duties — was already genuinely enforced inline
(`PAYROLL_SOD`, `FNF_SOD`, `PENSION_SOD`, `REVISION_SOD`, 3-way `ERR-G10-RECON-UNSIGNED`) and is now
regression-guarded. The real gap was three capability flags documented as required
(`PAYROLL_APPROVE`, `PAYROLL_DISBURSE`, `DDO_SANCTION`) that the runtime never checked — the
approve/disburse/loan-sanction paths relied on the bare permission string + SoD. Six additive role
checks close those gaps; a 6-test validation suite proves both the new gates and the pre-existing SoD
controls; and the role-string drift (pension sanction/PDA/medical-board/tax) is documented as
permission-driven design.

## What was built / changed

1. **Six thin role-check gates** (additive, wildcard/system bypass, identical pattern to the existing
   `sanctionFnfSettlement` gate at `compensationIntegrationService.ts:639`):
   - `payrollEngineService.approveEngineRun` → `payroll_approver` (PAYROLL_APPROVE)
   - `payrollService.approveRun` → `payroll_approver` (PAYROLL_APPROVE)
   - `payrollEngineService.markRunTransmitted` → `payroll_disburser` (PAYROLL_DISBURSE)
   - `payrollService.disburseRun` → `payroll_disburser` (PAYROLL_DISBURSE)
   - `compensationIntegrationService.completeDisbursement` → `payroll_disburser` (PAYROLL_DISBURSE)
   - `loanPerquisiteGlService.sanctionLoan` → `hod`/`sanctioning_authority` (DDO_SANCTION)
2. **Validation suite** — `apps/api/test/g10-g11-payroll-finance-validation.test.cjs` (6 tests, 6 pass),
   each tagged ENFORCED/DRIFT: PAYROLL_APPROVE gate, PAYROLL_SOD, PAYROLL_DISBURSE gate, DDO_SANCTION
   loan gate, FNF_SOD (creator can't sanction or approve), PENSION_SOD + the pension-sanction
   role-string drift (a non-sanctioning-authority actor with the permission can sanction).
3. **Drift/coverage report** — `docs/reviews/brd-coverage-payroll-finance-2026-07-14.md` (role×capability
   matrix with file:line evidence and the deferred list).

## Files changed

- **Edited (surgical, additive):** `apps/api/src/modules/g10/payrollEngineService.ts`,
  `apps/api/src/modules/g10/payrollService.ts`, `apps/api/src/modules/g10/compensationIntegrationService.ts`,
  `apps/api/src/modules/g10/loanPerquisiteGlService.ts`.
- **New:** `apps/api/test/g10-g11-payroll-finance-validation.test.cjs`,
  `docs/reviews/brd-coverage-payroll-finance-2026-07-14.md`, this report.
- **No** seed changes (payroll/pension state is built inline in the suite; the pension test reuses the
  `seedTestEmployees` Arjun substrate). **No** web changes.

## Bugs found

None. No production defects were introduced or discovered beyond the documented flag-enforcement gaps,
which are now closed. The SoD controls were already correct.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/g10-g11-payroll-finance-validation.test.cjs` — 6/6 pass.
- Affected G10/G11 suites (ph09/ph09b/ph09d/ph09-comp-int/ph15a/ph16f/ph09-g11/ph15b + the three route
  tests) — 56/56 pass; the new gates broke nothing because every existing test/seed actor uses
  `permissions: ["*"]` (wildcard bypass).
- Full `npm run check` (typecheck + build + backend suite) — **717/718 pass** (1 pre-existing unrelated
  skip). Baseline before this goal was 711/712; +6 are this suite, all passing. One existing test
  (`payslip-self-service.test.cjs`) was corrected: its lifecycle "approver" actor was typed
  `payroll_officer` (the drift this goal closed) and is now `payroll_approver`, matching the matrix.
- `npm run web:check` — **153/153 pass**.

## Remaining risks / caveats

- **Role-string drift is deferred.** `pension_sanctioning_authority`, `pension_disbursing_authority`,
  `medical_board`, and the tax-certify role are not enforced as role strings — runtime trusts the
  permission grant. Correct if grants follow the matrix; a future defense-in-depth pass could add the
  role checks.
- **`g10.overpayment.adjudicate`** is not role-gated (the FnF sanction and loan sanction paths now are).
  Recorded in the brd-coverage report as a deferred follow-up.
- **The new gates bypass on `permissions: ["*"]` and `system`.** Any actor holding the wildcard (all
  existing tests, seeds, and the production bootstrap/migration escape hatch) is unaffected — by design,
  matching the existing `sanctionFnfSettlement` gate. Production must continue to grant the wildcard only
  to trusted bootstrap/admin contexts.
- **Matrix-vs-code nuance:** the matrix claims SoD is "enforced by P01/P02, not re-coded per module"
  (line 1532). In reality SoD is enforced **inline per module** via marker checks. Functionally
  equivalent; documented in the brd-coverage report.
