# Done Report — Statutory-Authority & SR-Custodian Role Validation

**Date:** 2026-07-14
**Path:** standard — validation + drift documentation only (no production changes)

## Objective

Validate the statutory-authority and SR-custodian role cluster (G02/G05/G09/G12) against the real
runtime, classify each capability as ENFORCED / DRIFT / DEFERRED, and document the gaps. Per the
approved scope this is validation + drift docs only: the cheap capability-flag gaps in this cluster
were already closed by the hr_admin audit, so no production changes were needed — the enforceable
statutory SoD is already in place.

## Scope decision

**Validate + drift docs only.** Unlike the payroll/finance pass (which closed one-line flag gaps), this
cluster had no remaining cheap flag fixes — `fraud_reviewer`, `grievance_officer`, `dpo_governance`,
`g05_clearance_officer`, `g05_estate_officer`, and `g08_dual_control` were already enforced by the
hr_admin audit. The remaining gaps are an **unbuilt capability** (the `sr_second_custodian` corrigenda/
extract SoD) and **permission/resolution-driven role-string drift** — both documented, not built, per
the manager-hierarchy precedent (defer architectural/unbuilt work to separate goals).

## Summary

The cluster's statutory controls are largely enforced and now regression-guarded: the P01 identity gate
makes statutory authorities the *resolved assignees* of the workflows they sanction (G02 personal-detail
approve, G05 transfer approve), and inline actor-conflict SoD (`ERR-G02-SOD`, `ERR-G09-ACTOR-CONFLICT`)
plus the `sr_custodian` timeline override are real. The one structural gap is the `sr_second_custodian`
second-custodian SoD — the matrix mandates maker≠checker≠second-custodian for SR corrigenda and FULL_SR
extracts, but `ServiceRegisterService` has no corrigenda/extract method, so the capability is unbuilt.
Recorded as DEFERRED for a thin-build follow-up.

## What was built

1. **Validation suite** — `apps/api/test/g02-g05-g09-g12-statutory-authority-validation.test.cjs`
   (5 tests, 5 pass), each tagged ENFORCED/DRIFT:
   - G02: a perm-holding maker is blocked by `ERR-G02-SOD`; a non-assignee is blocked by the P01
     identity gate; the resolved reporting authority approves.
   - G05: a transfer order can only be approved by the resolved transfer authority
     (`POSITION_AUTHORITY` `G05_TRANSFER_REVENUE`), not any holder of the permission.
   - G09: `ERR-G09-ACTOR-CONFLICT` (DI-2) — the PI officer must be distinct from the charged officer
     and the disciplinary authority.
   - G12: an `sr_custodian` can view any employee's SR timeline; a non-override/non-self actor cannot.
   - DRIFT G12: asserts `sr_second_custodian` corrigenda/extract methods do not exist (the second-
     custodian SoD is unbuilt), and the single-custodian ingest path has no second-custodian sign-off.
2. **Drift/coverage report** — `docs/reviews/brd-coverage-statutory-authority-2026-07-14.md` (role×
   capability matrix with file:line evidence and the deferred list).

## Files changed

- **New:** `apps/api/test/g02-g05-g09-g12-statutory-authority-validation.test.cjs`,
  `docs/reviews/brd-coverage-statutory-authority-2026-07-14.md`, this report.
- **No production code changes** — validation + docs only. No seed changes (the suite reuses ph03 +
  `seedTestEmployees` substrate; the G05 test uses a pre-delegation orderDate to resolve the seeded
  transfer authority).

## Bugs found

None. No production defects. The findings are: one unbuilt capability (`sr_second_custodian` corrigenda/
extract), one partial SoD (`g09.penalty.impose` checks ≠ respondent ≠ initiator but not the full
DI-2 distinctness set), and permission/resolution-driven role-string drift — all documented, not defects
in existing code.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/g02-g05-g09-g12-statutory-authority-validation.test.cjs` — 5/5 pass.
- Full `npm run check` (typecheck + build + backend suite) — **722/723 pass** (1 pre-existing unrelated
  skip). Baseline before this goal was 717/718; +5 are this suite, all passing — zero regressions.
- `npm run web:check` — **153/153 pass**.

## Remaining risks / caveats

- **`sr_second_custodian` corrigenda/extract SoD is unbuilt.** The matrix's maker≠checker≠second-
  custodian rule for SR corrigenda and FULL_SR extracts cannot fire today (no method exists). This is
  the cluster's most material gap and the natural thin-build follow-up.
- **Role-string drift is deferred.** Statutory authorities are enforced via P01 resolution + permission,
  not role-string backstops. Correct if grants follow the matrix; a future defense-in-depth pass could
  add role checks.
- **Partial G09 penalty SoD:** `imposePenalty` checks `passedBy ≠ respondent ≠ initiator` but not the
  full "DA ≠ complainant/witness/IO/PO" set the matrix describes.
- **The G05 test uses a pre-delegation orderDate** (2026-06-15) so the seeded July acting-charge
  delegation (Ananya→Kiran) doesn't redirect the resolved authority — documented in-code.
- **`icc_external_member`** mandatory-external-member enforcement for POSH HARASSMENT cases is not
  runtime-checked (constitute-only); recorded as deferred.
