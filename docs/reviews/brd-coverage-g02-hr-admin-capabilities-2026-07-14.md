# BRD Coverage — hr_admin G02 Personal Details Change Workflow Capabilities

## Scope

Per the `hr_admin` role-capability audit's 4 named G02 capabilities and the two prior scoping
decisions (test against runtime strings; build thin/fix gaps for flag enforcement). No new web UI
was built — this is backend correctness/security work.

| Capability (user's naming) | Runtime | Status |
|---|---|---|
| `g02.change_request.review` | `g02.change.approve` (checker) + `g02.change.commit` (SR post) | Pre-existing, tested |
| `g02.fraud.review` (needs `fraud_reviewer` flag) | `g02.risk.review` | Pre-existing method; flag check was missing — fixed |
| `g02.grievance.handle` (needs `grievance_officer` flag) | `g13.dsr.adjudicate` (G13's existing DSR system) | Pre-existing method under a different module; flag check was missing — fixed |
| `g02.sr.post` | `g02.change.commit` | Pre-existing, tested |

## Findings

### `g02.fraud.review` — capability-flag enforcement gap, fixed

`ChangeGovernanceService.reviewRiskSignal()` (the fraud-queue triage/disposition action) checked
only the `g02.risk.review` permission and a maker≠checker SoD guard (reviewer ≠ requester) — the
`fraud_reviewer` capability flag named in the audit was never checked, so any `g02.risk.review`
holder (which auth-matrix grants broadly) could clear or confirm a fraud signal regardless of
whether they held the flag. Fixed: added a `fraud_reviewer`-role check (or `system`/wildcard),
consistent with this goal's established capability-flag-as-role-string modeling (see the G01
BGV report for the full rationale — `ActorContext` has no dedicated flags field).

### `g02.grievance.handle` — already substantially built under G13, not duplicated

The initial survey reported this as unimplemented in G02 — correct, but incomplete: a full DSR
(Data Subject Request) register→adjudicate→execute system already exists in
`apps/api/src/modules/g13/documentVaultService.ts` (`registerDataSubjectRequest`,
`adjudicateDataSubjectRequest`, `executeDataSubjectRequest`), which **is** the mechanism for
handling a data-subject privacy grievance — DSR and "privacy grievance" are the same statutory
concept (DPDP-style subject-rights requests), just implemented under G13 rather than G02. Building
a second, parallel G02-native grievance system would duplicate this. Instead:

1. `adjudicateDataSubjectRequest` had **zero authorization check at the service level** — it
   called `requireActor(scope)` (authentication only, not a permission check) and relied entirely
   on the route's `g13.dsr.adjudicate` permission gate for defense. Added the `grievance_officer`
   capability-flag check (same modeling convention), which required changing the method's
   parameter type from `TenantScope` to `ActorContext` (needed for `.roles`) and updating the
   route to pass `context.actor` instead of `context.scope`.
2. `registerDataSubjectRequest`/`executeDataSubjectRequest` were left as-is (out of this
   capability's scope — `grievance.handle` is specifically the *disposition* action, matching
   "triage"/"handle", not registration or execution).

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/hr-admin-g02-personal-details-workflow.test.cjs` — 3/3 pass.
- `node --test apps/api/test/*.test.cjs` — full backend suite 688/689 (1 pre-existing unrelated
  skip) — confirms no regression to the existing `ph16b-g02-bulk-risk-statusgate.test.cjs` (uses
  wildcard-permission actors, unaffected by the new flag checks).

## Verdict

**GAPS-FOUND → remediated.** Two real capability-flag enforcement gaps found and fixed. No new
implementation was needed for `g02.grievance.handle` — it was a cross-reference-and-harden fix on
an existing G13 mechanism, not a net-new build.
