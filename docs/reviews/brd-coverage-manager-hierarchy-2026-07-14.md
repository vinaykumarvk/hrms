# BRD Coverage — Manager-Hierarchy Role Validation

**Date:** 2026-07-14
**Roles:** `l1_manager`, `l2_manager`, `l3_manager`, `l4_manager`, `l5_manager`, `hod`, `uag_head`, `skip_level_manager`, `dotted_line_manager`
**Path:** standard, on stable contracts — validation + drift documentation (no enforcement build this pass)

## Objective

Validate every manager-hierarchy role capability against the **real runtime** and classify each cell
as **ENFORCED** (runtime matches auth-matrix intent), **DRIFT** (runtime diverges — documented), or
**DEFERRED** (architectural feature not present — recorded for a separate standard-path goal). Scope
is validation only, per the agreed plan.

## Headline finding

The auth-matrix (`docs/contracts/auth-matrix.yaml:169-214`) specifies **distinct L1–L5 scopes**,
**read-only skip/dotted-line subtrees**, and a **UAG-head hard ceiling**. The runtime implements
**none of the level/subtree/dotted-line model**. `AuthorityResolutionService.resolveReportingChain()`
(`apps/api/src/platform/authority-resolution/authorityResolutionService.ts:189-219`) resolves a
**single** `reportingManagerId` per subject — never the chain above, with no level distinction. Manager
identity is enforced in exactly **one** place: the P01 `workflow.act()` identity gate
(`apps/api/src/platform/workflow/hrmsWorkflowService.ts:107-114`), and only for the **direct**
manager. Only `hod` appears as a runtime role string (g10 FnF sanction).

This is **product-feature drift, not defects** — the subsystem works; it does not implement the
matrix's hierarchical model. The validation suite (`apps/api/test/manager-hierarchy-validation.test.cjs`,
6/6 pass) proves each classification below against the live runtime with a seeded 5-level chain
(`apps/api/src/seed/managerHierarchySeed.ts`, opt-in via `seedManagerHierarchy`).

## Summary matrix

| Capability surface | l1 | l2 | l3 | l4 | l5 | hod | uag_head | skip | dotted | Verdict basis |
|---|---|---|---|---|---|---|---|---|---|---|
| Decide P01 workflow (leave/transfer/training approve/reject) | ENFORCED | DRIFT | DRIFT | DRIFT | DRIFT | ENFORCED* | DRIFT* | DRIFT | DRIFT | direct manager resolves; others not the assignee |
| Attendance regularise (G03 FR-05) | DRIFT | DRIFT | DRIFT | DRIFT | DRIFT | — | — | — | — | permission + SoD only, no L1-only gate |
| APAR reporting officer (`g08.apar.report`) | DRIFT | DRIFT | DRIFT | DRIFT | DRIFT | — | — | — | — | permission-only; no level, no RO-identity |
| APAR reviewing officer (`g08.apar.review`) | — | DRIFT | DRIFT | DRIFT | DRIFT | — | — | — | — | permission-only; no L2-L5 distinction |
| Team / reporting-subtree visibility | DRIFT | DRIFT | DRIFT | DRIFT | DRIFT | DRIFT | DRIFT | DEFERRED | DEFERRED | no subtree model exists |
| HOD-only sanction/decision (FnF sanction, loan, statutory change, legal hold, dashboard, report) | ENFORCED (denied) | denied | denied | denied | denied | ENFORCED | ENFORCED (denied) | denied | denied | permission-gated; role-string for sanction |
| Workflow-approval grant (`hod_workflow_approval`) | — | — | — | — | — | DRIFT | ENFORCED (ceiling) | — | — | not enforced at runtime; UAG never grantable by config |
| Self-approve SoD | ENFORCED | ENFORCED | ENFORCED | ENFORCED | ENFORCED | ENFORCED | ENFORCED | ENFORCED | ENFORCED | never own resolved assignee |
| Org-wide override (hr_admin/leave_admin/hrbp/sanctioning/transfer) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ENFORCED (excludes all 9 manager roles) |

\* `hod`/`uag_head` can decide a workflow **only where they are the resolved assignee** (e.g. their own
direct report) or via an explicit statutory-authority resolution — never as an override role.

## Findings by surface

### 1. P01 workflow decision — ENFORCED at direct-manager level; DRIFT for the rest
`HrmsWorkflowService.act()` enforces that APPROVE/REJECT/SEND_BACK
(`IDENTITY_ENFORCED_ACTIONS`, `hrmsWorkflowService.ts:15`) be performed by the resolved
REPORTING_CHAIN assignee (`isResolvedAssignee`, `:27-33`) or an override role
(`APPROVAL_OVERRIDE_ROLES`, `:12` — no manager role is a member). Because the resolver returns only the
direct `reportingManagerId`, **only L1** ever resolves for a given subject. L2–L5 carry
`g03.leave.approve` yet are FORBIDDEN (test 1). `hod`/`uag_head`/`skip`/`dotted` likewise hold no
override power (test 4). **Verdict:** identity enforcement is real and correct; the L2–L5/skip/dotted
*participation* the matrix describes is drift.

### 2. Attendance regularise (G03 FR-05) — DRIFT (no L1-only gate)
`LeaveService.regulariseAttendance()` (`leaveService.ts:659-692`) checks `g03.attendance.regularise`
plus a maker≠regulariser SoD (`:669`). There is **no** L1-only / manager-level check — any actor with
the permission (and distinct from the capture-maker) can regularise. The matrix's "attendance approve =
L1 only" is not enforced. **Verdict:** DRIFT.

### 3. APAR reporting officer (`g08.apar.report`) — DRIFT (permission-only, no level, no RO-identity)
`AparService.openForm()` (`aparService.ts:110-143`) takes **explicit** `reportingOfficerId`/
`reviewingOfficerId` and checks only `g08.apar.form.open` + an appraisee≠officer SoD (`:128`). It starts
a REPORTING_CHAIN workflow but the assessment methods **bypass `workflow.act()`**.
`recordReporting()` (`:216-227`) checks only `g08.apar.report` + status — **not** the actor's level, the
`g08_appraiser_roles` flag, or even that the actor *is* the named reporting officer. Test 5 has an L3
actor (not the named RO L1, no appraiser flag) record the assessment successfully. **Verdict:** DRIFT.

### 4. APAR reviewing officer (`g08.apar.review`) — DRIFT (no L2-L5 distinction)
`recordReview()` (`aparService.ts:229-236`) is permission + status only. The matrix intends the
reviewing officer to be L2–L5 (`auth-matrix.yaml:631-634` `g08_appraiser_roles`); runtime enforces no
level and no RvO-identity. **Verdict:** DRIFT.

### 5. Team / reporting-subtree visibility — DRIFT / DEFERRED
There is no reporting-subtree expansion anywhere: `resolveReportingChain` returns one manager, and
`LeaveService.listApplications()` (`leaveService.ts:850`) is tenant/entity-scoped, not team-scoped. A
manager sees direct-report context only through explicit resolution; L2–L5/skip-level gain no subtree
view. `skip_level_manager`/`dotted_line_manager` have **no read-only subtree** to exercise — and
dotted-line cannot even be seeded (`EmployeeAssignment` carries a single `reportingManagerId`).
**Verdict:** DRIFT for L1–L5/HOD/UAG (subtree absent); DEFERRED for skip/dotted (no model, unseedable).

### 6. HOD-only sanction/decision capabilities — ENFORCED
The HOD-only capabilities (legal hold, statutory change approve, loan sanction, FnF adjudicate, FnF
sanction, dashboard, report, asset-audit certify) are **permission-gated** at the route/service layer,
with `hod` mapped to those permissions in the matrix. Where a role-string matters —
`sanctionFnfSettlement` (`compensationIntegrationService.ts:637-654`) accepts only
`sanctioning_authority`/`hod`/`system` (`:639`) — an `l1_manager` or `uag_head` with the permission is
FORBIDDEN, and the maker cannot self-sanction (`:646`, `FNF_SOD`). Test 6 proves all three branches.
**Verdict:** ENFORCED. Note `uag_head` is correctly **not** an accepted role here, so the UAG ceiling
holds for sanction even though no explicit uag-head check exists.

### 7. Workflow-approval grant (`hod_workflow_approval`) — DRIFT (not runtime-enforced)
`hod_workflow_approval` (`auth-matrix.yaml:576-580`) is a per-user, per-workflow grant that is "off by
default" for HOD and "never grantable" for UAG-head. The flag is **not checked at runtime** — a `hod`
actor decides any workflow where they are the resolved assignee, regardless of grant. The UAG
"never grantable" property holds only because `uag_head` is absent from every accepted-role set
(`APPROVAL_OVERRIDE_ROLES`, the FnF sanction gate), not via a positive ceiling check.
**Verdict:** DRIFT (HOD grant not enforced); the UAG non-grant is structurally satisfied.

### 8. Self-approve SoD — ENFORCED
A manager is never their own `reportingManagerId`, so the resolver never names them as the assignee of
their own task; `act()` rejects self-decision (test 2). Holds for all 9 roles. **Verdict:** ENFORCED.

### 9. Org-wide override — ENFORCED (manager roles excluded by design)
`APPROVAL_OVERRIDE_ROLES` (`hrmsWorkflowService.ts:12`) = `hr_admin, leave_admin, hrbp,
sanctioning_authority, transfer_authority, system`. None of the 9 manager roles is a member, so they
can never decide a task by override — only as the resolved assignee. An `hr_admin` override still
decides a manager-routed task (test 3, regression guard). **Verdict:** ENFORCED.

## Deferred (recorded for separate standard-path goals, not built here)

- **L2–L5 level distinction** in `AuthorityResolutionService` — the `ResolverRule.levelId` field exists
  (`authorityResolutionService.ts:110`) but REPORTING_CHAIN ignores it. Enforcing distinct scopes needs
  resolver-level semantics + every caller audited.
- **Reporting-subtree expansion** for team visibility and skip-level read.
- **Dotted-line data model** (a second reporting relationship) + its read path; unseedable today.
- **`hod_workflow_approval` per-user-per-workflow grant** enforcement.
- **Positive UAG-head ceiling check** (today vacuous; satisfied structurally, not by assertion).
- **APAR RO/RvO identity + `g08_appraiser_roles` enforcement** (route assessment through `workflow.act()`
  or an explicit RO-identity check).

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/manager-hierarchy-validation.test.cjs` — 6/6 pass.
- Full suite + web checks — see the consolidated done report.

## Verdict

**DRIFT-DOCUMENTED.** Of the 9 manager-hierarchy roles, identity/SoD/override enforcement is real and
correct where the runtime implements it (leave workflow, FnF sanction, self-approve, override list).
The matrix's level/subtree/dotted-line/UAG-grant model is **not implemented** — classified as DRIFT or
DEFERRED with file+line evidence above, and recorded for separate standard-path enforcement goals.
