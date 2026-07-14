# BRD Coverage — Statutory-Authority & SR-Custodian Role Validation

**Date:** 2026-07-14
**Cluster:** G02 (personal-details), G05 (transfer), G09 (disciplinary), G12 (service-register)
**Roles:** `appointing_authority`, `transfer_authority`, `disciplinary_authority`, `sanctioning_authority`, `sr_custodian`, `sr_second_custodian`, `dpo`, `icc_member`, `medical_board`, `appellate_authority`, `inquiry_officer`, `presenting_officer`, `vigilance_officer`
**Path:** standard — validation + drift documentation only (no production changes this pass)

## Objective

Validate the regulated statutory-authority and SR-custodian cluster against the real runtime and
classify each capability as **ENFORCED / DRIFT / DEFERRED**. Per the agreed scope, this pass is
validation only: the cheap capability-flag gaps in this cluster were already closed by the hr_admin
audit, and the remaining gaps are an unbuilt feature (second-custodian corrigenda/extract) and
permission/resolution-driven role-string drift — documented, not built.

## Headline finding

The cluster's statutory controls are **largely enforced**: the P01 identity gate makes statutory
authorities (appointing/transfer/disciplinary) the *resolved assignees* of the workflows they sanction,
and inline actor-conflict SoD (`ERR-G02-SOD`, `ERR-G09-ACTOR-CONFLICT`) plus custodian override sets
are real. The one structural gap is the **`sr_second_custodian` second-custodian SoD** — the matrix
mandates maker≠checker≠second-custodian for SR corrigenda and FULL_SR extracts (`g12.correction.approve` /
`g12.extract.certify`), but `ServiceRegisterService` exposes no corrigenda/extract method at all; the
capability is **unbuilt**, so the SoD cannot fire. Everything else is permission/resolution-driven
(manager-style drift): correct if grants follow the matrix, with no role-string backstop.

## Summary matrix

| Capability surface | Enforced? | Evidence (file:line) | Verdict |
|---|---|---|---|
| G02 personal-detail approve — maker≠checker (ERR-G02-SOD) | Yes | personalDetailsService.assertMakerIsNotChecker:368; approve:151 | ENFORCED |
| G02 personal-detail approve — P01 resolved-assignee identity | Yes | personalDetailsService.approve:152 (workflow.actOnInstance APPROVE) | ENFORCED |
| G02 elevated change → appointing_authority routing | Yes (resolution) | changeGovernanceService:560 (roleCode "appointing_authority" for FAMILY_PENSION/STATUS_ELEVATED) | ENFORCED (via resolution) / DRIFT (no role-string backstop) |
| G02 fraud review (fraud_reviewer flag) | Yes | changeGovernanceService.reviewRiskSignal:236 (hr_admin audit) | ENFORCED |
| G02 grievance handle (grievance_officer flag) | Yes | personalDetailsService adjudicateDataSubjectRequest (hr_admin audit) | ENFORCED |
| G05 transfer sanction — P01 resolved transfer-authority identity | Yes | transferService.approve:418 (workflow.actOnInstance) | ENFORCED |
| G05 clearance / estate (g05_clearance_officer / g05_estate_officer flags) | Yes | transferService:539/559/1629/1658/1703 (hr_admin audit) | ENFORCED |
| G05 handover SoD (relinquisher≠acceptor/disputer/certifier) | Yes | transferService:1288/1312/1348 | ENFORCED |
| G09 PI officer ≠ charged ≠ DA (ERR-G09-ACTOR-CONFLICT, DI-2) | Yes | disciplinaryService.orderPreliminaryInquiry:418 | ENFORCED |
| G09 penalty authority ≠ respondent ≠ initiator (ERR-G09-ACTOR-CONFLICT) | Yes | disciplinaryService.imposePenalty:1178 | ENFORCED |
| G09 disciplinary_authority case-access override | Yes | disciplinaryService DISCIPLINARY_ACCESS_OVERRIDE_ROLES:148 | ENFORCED |
| G09 penalty: DA ≠ complainant/witness/IO/PO (full DI-2) | **Partial** | imposePenalty checks ≠ charged ≠ initiatedBy only; not ≠ IO/PO/witness | DRIFT (partial SoD) |
| G09 vigilance (vigilance_officer role) | **No** | vigilanceRegisterService — permission-only (g09.vigilance.*), role not checked | DRIFT |
| G09 POSH ICC (icc_member + icc_external_member) | **No** | constituteIcc records members; icc_member role / icc_external_member flag not runtime-checked | DRIFT |
| G12 SR timeline — sr_custodian override | Yes | serviceRegisterService SR_TIMELINE_OVERRIDE_ROLES:7; getTimeline:244 | ENFORCED |
| G12 SR ingest (g12.sr.ingest, single custodian) | Yes | route-layer permission gate (g12.sr.ingest); ingest:103 | ENFORCED |
| G12 corrigenda approval — second custodian (sr_second_custodian) | **No (unbuilt)** | no approveCorrigendum method on ServiceRegisterService | DEFERRED |
| G12 FULL_SR extract certify — second custodian (sr_second_custodian) | **No (unbuilt)** | no certifyFullSrExtract method; certificate rows exist in srAdmissibilityRepository but no custodian SoD | DEFERRED |
| g12_sr_custodian flag (legacy promotion / bulk corrigendum / §65B) | **No (unbuilt)** | flag grantable on sr_custodian; capabilities not implemented | DEFERRED |
| DPO governance (dpo_governance flag) | Yes | BiometricGovernanceService (hr_admin audit) | ENFORCED |
| medical_board invalidation role | **No** | g11.invalidation.assess permission-only; role not checked | DRIFT |
| sanctioning_authority (G03 special-leave / G10 FnF) | Yes | leaveService.sanctionSpecialLeave; compensationIntegrationService:639 | ENFORCED (covered in prior passes) |

## What is enforced (positive, now regression-guarded)

- **P01 identity gate** on G02 personal-detail approve and G05 transfer approve: only the resolved
  statutory authority (reporting manager / transfer authority / appointing authority) or an override
  role can decide — proven by the suite (non-assignee FORBIDDEN, resolved authority APPROVED).
- **ERR-G02-SOD**: a perm-holding maker still cannot approve their own change request.
- **ERR-G09-ACTOR-CONFLICT (DI-2)**: PI officer distinct from charged officer and disciplinary authority.
- **sr_custodian override** for cross-employee SR timeline reads; non-override/non-self FORBIDDEN.
- Capability flags already closed by the hr_admin audit: `fraud_reviewer`, `grievance_officer`,
  `dpo_governance`, `g05_clearance_officer`, `g05_estate_officer`, `g08_dual_control`.

## DRIFT (documented, not built — permission/resolution-driven by design)

The statutory authorities (`appointing_authority`, `transfer_authority`, `disciplinary_authority`,
`sanctioning_authority`) are **not** checked as role strings at runtime — they participate as resolved
P01 assignees (via REPORTING_CHAIN / POSITION_AUTHORITY / NAMED_ROLE resolution), so the identity gate
enforces their involvement without a role-string backstop. `vigilance_officer`, `icc_member`,
`medical_board`, `appellate_authority`, `inquiry_officer`, `presenting_officer` are permission/constitute-
only. This is internally consistent and behaves correctly *if* grants follow `auth-matrix.yaml`'s
`allowed_roles`; it is recorded as DRIFT because the matrix frames these as role-scoped capabilities.

One partial SoD: `g09.penalty.impose`'s matrix intent ("DA ≠ complainant/witness/IO/PO") is only
half-enforced — runtime checks `passedBy ≠ respondent ≠ initiator`, not the full distinctness set.

## DEFERRED (unbuilt capabilities — separate standard-path goals)

- **`sr_second_custodian` corrigenda / FULL_SR-extract SoD** (`g12.correction.approve`,
  `g12.extract.certify`): no corrigenda-approval or extract-certify method exists on
  `ServiceRegisterService`. Building a thin append-only corrigendum flow with maker≠checker≠second-
  custodian SoD is the natural follow-up (mirrors the hr_admin thin-build pattern). This is the
  cluster's single most material gap.
- **`g12_sr_custodian` flag** capabilities (legacy-batch promotion, bulk corrigendum, §65B issuance):
  unbuilt.
- **Full DI-2 distinctness** for `g09.penalty.impose` (DA ≠ IO/PO/witness/complainant).
- **`icc_external_member`** mandatory-external-member enforcement for POSH HARASSMENT cases.
- **Role-string backstops** for the statutory authorities (defense-in-depth beyond resolution+permission).

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/g02-g05-g09-g12-statutory-authority-validation.test.cjs` — 5/5 pass.
- No production code changed this pass (validation + docs only); full `npm run check` + `npm run web:check`
  run as the final pass — see the consolidated done report.

## Verdict

**ENFORCED-and-DRIFT-DOCUMENTED.** The statutory SoD and P01 identity controls are real and now
regression-guarded. The cluster's one structural gap — the unbuilt `sr_second_custodian` corrigenda/
extract SoD — is recorded as DEFERRED for a thin-build follow-up; the role-string drift is documented
as permission/resolution-driven design.
