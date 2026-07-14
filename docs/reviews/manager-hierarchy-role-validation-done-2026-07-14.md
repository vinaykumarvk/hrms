# Done Report — Manager-Hierarchy Role Validation

**Date:** 2026-07-14
**Path:** standard (validation + drift documentation on stable contracts — not greenfield, no enforcement build)

## Objective

Validate the 9 manager-hierarchy roles — `l1_manager`, `l2_manager`, `l3_manager`, `l4_manager`,
`l5_manager`, `hod`, `uag_head`, `skip_level_manager`, `dotted_line_manager` — against the real
runtime, classify each capability as **ENFORCED / DRIFT / DEFERRED**, and ship a regression suite plus
a drift ledger. Scope was **validation only** (per the approved plan): test against actual runtime
behaviour, document drift, defer the architectural enforcement builds to separate standard-path goals.

## Scope decisions (user-confirmed)

- **Validation + drift docs only.** The architectural enforcement builds (L2–L5 level distinction,
  reporting-subtree expansion, dotted-line/skip-line data model, UAG hard-ceiling check,
  `hod_workflow_approval` grant, APAR RO/RvO identity) are **deferred** — they are feature-scale, not
  the thin additive methods of the `hr_admin` pass.

## Summary

A 5-level reporting-chain seed fixture was added behind an opt-in flag, a 6-test validation suite was
written that exercises the 9 roles against the live runtime, and a drift/coverage report classifies
every capability cell. The headline finding: the runtime enforces manager identity, SoD, and the
override boundary **correctly where it implements them** (leave workflow, FnF sanction, self-approve,
override list), but the auth-matrix's **level/subtree/dotted-line/UAG-grant model is not implemented**
— `AuthorityResolutionService` resolves a single direct `reportingManagerId` with no level distinction.
This is product-feature drift, not bugs; each gap is recorded with file+line evidence for a future
standard-path goal.

## What was built

1. **Seed fixture** — `apps/api/src/seed/managerHierarchySeed.ts`: a 6-person reporting chain
   (leaf → L1 → L2 → L3 → L4 → L5, L5 anchored to the PH-03 manager), idempotent, additive to the
   existing `ph03AuthorityFacts()`/`testEmployeeAuthorityFacts()` merge. Wired behind a new opt-in
   `FoundationServicesOptions.seedManagerHierarchy` flag (default off), so every existing test that
   boots `createFoundationServices()` with no options is byte-for-byte unaffected. Dotted-line is
   **not** seeded (single `reportingManagerId` schema constraint) — documented, not faked.
2. **Validation suite** — `apps/api/test/manager-hierarchy-validation.test.cjs` (6 tests, 6 pass). Each
   test asserts actual runtime behaviour and is tagged `ENFORCED`/`DRIFT`:
   - leave approval identity (L1 direct resolves; L2–L5 FORBIDDEN despite the permission — DRIFT);
   - self-approve SoD (manager can't approve own leave; own manager can — ENFORCED);
   - `hr_admin` override over a manager-routed task (regression guard — ENFORCED);
   - `hod`/`uag_head`/`skip`/`dotted` hold no override power (FORBIDDEN as non-assignees — DRIFT);
   - APAR reporting-officer assessment is permission-only, no level/RO-identity (an L3 non-RO records
     it — DRIFT);
   - g10 FnF sanction requires `hod`/`sanctioning_authority`, blocks `l1_manager`/`uag_head` and the
     maker (SoD) — ENFORCED.
3. **Drift/coverage report** — `docs/reviews/brd-coverage-manager-hierarchy-2026-07-14.md`: a 9-role ×
   capability matrix with ENFORCED/DRIFT/DEFERRED verdicts and file+line evidence per cell, plus the
   deferred-enforcement list.

## Files changed

- **New:** `apps/api/src/seed/managerHierarchySeed.ts`,
  `apps/api/test/manager-hierarchy-validation.test.cjs`,
  `docs/reviews/brd-coverage-manager-hierarchy-2026-07-14.md`, this report.
- **Edited (surgical, additive, opt-in):** `apps/api/src/platform/foundationServices.ts` — import +
  `seedManagerHierarchy` option + idempotent master creation + authority-facts merge (3 small hunks).
- **No** production service / workflow / resolver changes.

## Bugs found

None. No defects were introduced or discovered in production code. The drift findings are missing
features (the level/subtree/dotted-line model), not correctness bugs — the runtime behaves consistently
with its single-manager resolver design.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/manager-hierarchy-validation.test.cjs` — 6/6 pass.
- `npm run check` (typecheck + build + full backend suite) — **711/712 pass** (1 pre-existing unrelated
  skip). Baseline before this goal was 705/706; the +6 are this suite, all passing — zero regressions.
- `npm run web:check` — **153/153 pass**.

## Remaining risks / caveats

- **The suite asserts current (drift) behaviour.** A future enforcement build will flip some
  `FORBIDDEN`→`APPROVED` expectations (notably L2–L5 leave approval and APAR level checks). Every such
  test is tagged `DRIFT` with an explanatory comment so the change is obvious; the implementing goal
  must update these expectations.
- **Dotted-line is unseedable** without a schema change (second reporting relationship). The
  dotted-line use case is documented as DEFERRED, never faked.
- **`hod_workflow_approval` per-user grant** is not enforced at runtime — a `hod` actor decides any
  workflow where they are the resolved assignee, independent of the "off by default" grant. Recorded as
  DRIFT.
- **UAG-head ceiling** holds only structurally (the role appears in no accepted-role set), not via a
  positive runtime check. Recorded as DRIFT.
- **APAR RO/RvO assessment** bypasses `workflow.act()`, so the P01 identity gate never fires for it —
  the reporting/reviewing assessment is permission-only with no officer-identity check. Recorded as
  DRIFT and a candidate for a future standard-path hardening goal.
