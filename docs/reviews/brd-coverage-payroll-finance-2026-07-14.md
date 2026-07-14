# BRD Coverage — Payroll/Finance/Pension Role Validation

**Date:** 2026-07-14
**Cluster:** G10 (payroll/compensation) + G11 (pension) — `payroll_officer`, `payroll_approver`, `payroll_disburser`, `finance_admin`, `compensation_admin`, `hod` (DDO_SANCTION), `pension_officer`, `pension_sanctioning_authority`, `pension_disbursing_authority`, `medical_board`, `sanctioning_authority`, `sr_custodian`
**Path:** standard, on stable contracts — validation + thin capability-flag enforcement (per approved scope)

## Objective

Validate the money-sensitive payroll/finance/pension cluster against the real runtime, classify each
capability as **ENFORCED / DRIFT / DEFERRED**, and close the thin capability-flag gaps (`PAYROLL_APPROVE`,
`PAYROLL_DISBURSE`, `DDO_SANCTION`) that were documented but never checked. The architectural role-string
drift (pension/PDA/medical-board role specificity) is documented, not built.

## Headline finding

The cluster's **money-critical control — separation of duties — is genuinely enforced inline**:
`PAYROLL_SOD`, `FNF_SOD`, `PENSION_SOD`, `REVISION_SOD`, and the 3-way `ERR-G10-RECON-UNSIGNED`. The
gap was narrower: three capability flags documented as required (`PAYROLL_APPROVE`, `PAYROLL_DISBURSE`,
`DDO_SANCTION`) were **not checked at runtime** — the approve/disburse/loan-sanction paths relied on the
bare permission string + SoD. These are now closed with additive role checks (wildcard/system bypass,
same pattern as the existing FnF sanction gate). Several role strings (`pension_sanctioning_authority`,
`pension_disbursing_authority`, `medical_board`) remain permission-only by design — recorded as DRIFT.

## Summary matrix

| Capability surface | Enforced? | Evidence (file:line) | Verdict |
|---|---|---|---|
| Payroll run approve (PAYROLL_APPROVE → payroll_approver) | **Yes (new)** | payrollEngineService.approveEngineRun:331; payrollService.approveRun:277 | ENFORCED |
| Payroll bank-file transmit/disburse (PAYROLL_DISBURSE → payroll_disburser) | **Yes (new)** | payrollEngineService.markRunTransmitted:409; payrollService.disburseRun:299; compensationIntegration.completeDisbursement:347 | ENFORCED |
| Loan/advance sanction (DDO_SANCTION → hod) | **Yes (new)** | loanPerquisiteGlService.sanctionLoan:211 | ENFORCED |
| FnF sanction (hod/sanctioning_authority role) | Yes (pre-existing) | compensationIntegrationService.sanctionFnfSettlement:639 | ENFORCED |
| PAYROLL_SOD (maker ≠ approver) | Yes | payrollEngineService:338; payrollService:281 | ENFORCED |
| FNF_SOD (creator ≠ sanctioner AND ≠ approver) | Yes | compensationIntegrationService:646 (sanction), :626 (approve) | ENFORCED |
| 3-way recon SoD (signer ≠ maker ≠ approver) | Yes | compensationIntegrationService.signOffReconciliation:326 (ERR-G10-RECON-UNSIGNED) | ENFORCED |
| PENSION_SOD (maker ≠ sanctioner) | Yes | pensionService.sanction:428 | ENFORCED |
| REVISION_SOD (maker ≠ approver) | Yes | pensionRevisionService.approveBatch:164 | ENFORCED |
| Pension case access override (pension_officer) | Yes | pensionService.PENSION_ACCESS_OVERRIDE_ROLES:23; assertSelfOrOverride:413 | ENFORCED |
| Account-verification gate (ERR-G11-ACCOUNT-VERIFY) | Yes | pensionDisbursementService.disburse (pre-credit gate) | ENFORCED |
| Life-certificate suspension gate (ERR-G11-LC-SUSPENDED) | Yes | pensionDisbursementService.disburse; pensionerLifecycleService | ENFORCED |
| Pension sanction role-string (pension_sanctioning_authority) | **No** | pensionService.sanction:425 — permission + SoD only, no role check | DRIFT |
| PPO issue / pension disburse role-string (pension_disbursing_authority) | **No** | pensionService.issuePpo:440; pensionDisbursementService.disburse:124 — permission only | DRIFT |
| Medical-board invalidation role-string | **No** | g11.invalidation.assess — permission only, medical_board role not checked | DRIFT |
| Tax/Form-16 certify role-string | **No** | taxEngineService.generateForm16/generateForm24Q — g10.statutory.certify permission only | DRIFT |
| payroll_disburser test coverage | **Now covered** | g10-g11-payroll-finance-validation.test.cjs (was previously zero) | ENFORCED |

## What was closed (thin flag enforcement)

Six additive role checks, all using the established `!actor.permissions?.includes("*") && !actor.roles?.some(...)`
pattern with a `system`/wildcard bypass — identical to the existing `sanctionFnfSettlement` gate
(`compensationIntegrationService.ts:639`). Each throws `FORBIDDEN` with the capability named:

1. `payrollEngineService.approveEngineRun` — requires `payroll_approver` (PAYROLL_APPROVE).
2. `payrollService.approveRun` — requires `payroll_approver` (PAYROLL_APPROVE).
3. `payrollEngineService.markRunTransmitted` — requires `payroll_disburser` (PAYROLL_DISBURSE).
4. `payrollService.disburseRun` — requires `payroll_disburser` (PAYROLL_DISBURSE).
5. `compensationIntegrationService.completeDisbursement` — requires `payroll_disburser` (PAYROLL_DISBURSE).
6. `loanPerquisiteGlService.sanctionLoan` — requires `hod`/`sanctioning_authority` (DDO_SANCTION).

No existing test broke: every existing G10/G11 test actor (ph09/ph09b/ph09d/ph15a/ph15b/ph16f/route tests)
and every seed actor uses `permissions: ["*"]`, which bypasses the new checks. Confirmed by re-running the
full affected set (56/56) and the seed-driven suite.

## DRIFT (documented, not built — permission-driven by design)

The cluster is **permission-driven**: role specificity lives at the auth-grant layer, and runtime trusts
the grant to give each role only its permissions. So `pension_sanctioning_authority`,
`pension_disbursing_authority`, `medical_board`, and the tax-certify role are never checked as role
strings — the permission + SoD suffice. This is internally consistent and behaves correctly *if* grants
follow `auth-matrix.yaml`'s `allowed_roles`. It is recorded as DRIFT because the matrix frames these as
role-scoped capabilities; enforcing the role strings would be a larger, behavior-changing hardening pass
(deferred). The clearest live demonstration: a `pension_officer` (not the sanctioning authority) holding
`g11.pension.sanction` and distinct from the maker **can sanction** a pension case (test 6).

## DEFERRED (separate standard-path goals)

- Runtime enforcement of `pension_sanctioning_authority`, `pension_disbursing_authority`, `medical_board`
  as role strings (defense-in-depth beyond permission + SoD).
- `g10.overpayment.adjudicate` DDO role gate (currently permission-only; the FnF/loan sanction paths are
  now gated, overpayment adjudication is not).
- The matrix's blanket claim (line 1532) that "SoD is enforced by P01/P02, not re-coded per module" is
  *partially* true: SoD is real, but it is enforced **inline per module** (PAYROLL_SOD/FNF_SOD/PENSION_SOD/
  REVISION_SOD markers), not via a central P01 mechanism. Functionally equivalent; documented nuance.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/g10-g11-payroll-finance-validation.test.cjs` — 6/6 pass.
- Affected G10/G11 suites (ph09/ph09b/ph09d/ph09-comp-int/ph15a/ph16f/ph09-g11/ph15b + route tests) —
  56/56 pass, zero regressions from the new gates.
- Full `npm run check` + `npm run web:check` — see the consolidated done report.

## Verdict

**GAPS-CLOSED.** The three documented-but-unenforced capability flags (PAYROLL_APPROVE, PAYROLL_DISBURSE,
DDO_SANCTION) are now runtime-enforced with tests. The money-critical SoD controls were already solid and
are now regression-guarded. Role-string drift for pension/PDA/medical-board/tax roles is documented as
permission-driven design, deferred for any future defense-in-depth hardening.
