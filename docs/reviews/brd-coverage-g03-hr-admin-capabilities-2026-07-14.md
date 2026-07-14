# BRD Coverage — hr_admin G03 Attendance & Leave Capabilities

## Scope

Per the `hr_admin` role-capability audit's 5 named G03 capabilities. No new web UI was built —
backend correctness/security work only.

| Capability (user's naming) | Runtime | Status |
|---|---|---|
| `g03.leave.approve_standard` | `g03.leave.approve` | Pre-existing, tested |
| `g03.leave.sanction_special` | New: `sanctionSpecialLeave()` + `requiresFinalSanction` leave-type flag + `sanctioning_authority` role | Net-new thin build |
| `g03.attendance.regularize_approve` | `g03.attendance.regularise` | Pre-existing (SOD built earlier this session), re-verified |
| `g03.punch.review_anomaly` | `g03.punch.review` + new `anomaly_reviewer` role check | Flag-enforcement gap fixed |
| `g03.biometric.govern` | New: `BiometricGovernanceService` + `dpo_governance` role | Net-new thin build |

## Findings

### `g03.leave.sanction_special` — net-new, additive design

No distinct "special leave" path existed — all leave types shared one `approve()` method, and the
4 special leave types named by the user (maternity, sabbatical, commuted, LWP) plus encashment
weren't even configured as leave types in the seed data (only EL/CL/HPL/SL/CCL exist). Rather than
forking the leave state machine, added a `requiresFinalSanction?: boolean` flag to
`LeaveTypeConfig` and a new `sanctionSpecialLeave(actor, applicationId)` method that is **additive
on top of** ordinary approval, not a replacement stage: it requires `status === "APPROVED"`
already, requires the leave type to be flagged `requiresFinalSanction`, and records
`finalSanctionedByUserId`/`finalSanctionedAt` without touching the existing `status` field or
balance math `approve()` already performs. Gated by the `sanctioning_authority` role — reusing an
**already-existing** role name from the platform's P01 workflow-override set
(`hrmsWorkflowService.ts`), not inventing a new one. Idempotent (a second sanction call on an
already-sanctioned application is a no-op, not an error).

**Discovered, flagged, not fixed**: while building this test, found that `LeaveService.approve()`
is **not fully atomic** — `application.status = "APPROVED"` is mutated on the live in-memory
object before the G04 outbox enqueue/relay calls run, so if a downstream call throws (e.g. the
actor lacks `g04.relay.write`), the application is left in a partially-mutated `APPROVED` state
without a completed SR post or outbox event. This is a pre-existing condition in code this session
did not otherwise touch, surfaced by accident while debugging a test fixture that was missing a
permission (not a real production scenario — every real approver actor in this codebase's tests
and seeds holds `g04.relay.write`). Flagged for future attention; not fixed here as out of this
capability's scope (a transaction-boundary fix to `approve()`, not a `sanction_special` concern).

### `g03.punch.review_anomaly` — capability-flag enforcement gap, fixed

`PunchAnomalyService.resolveReview()` checked only `g03.punch.review` + a maker≠checker SoD guard
(subject cannot review their own case) — the `anomaly_reviewer` flag was never checked. Fixed with
the established capability-flag-as-role-string convention.

### `g03.biometric.govern` — net-new thin build

Nothing existed for biometric/geo consent, lawful basis, or retention/purge governance — confirmed
by the initial survey. Built `BiometricGovernanceService`
(`apps/api/src/modules/g03/biometricGovernanceService.ts`): `recordConsent` (lawful-basis-required),
`withdrawConsent`, `listConsents`, `configureRetentionPolicy`, `getRetentionPolicy`,
`purgeExpiredData` (evaluates consent records against the configured retention window and marks
eligible ones withdrawn, logging what was purged), `listPurgeLogs`. All gated by
`g03.biometric.govern` + the `dpo_governance` role. **Scope note**: this governs the
*consent/policy record* layer (a real, present dataset this session created), not a raw
biometric-template capture pipeline — no raw biometric/geo capture store exists anywhere in this
codebase to protect; building one would be a much larger, unrelated feature.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/hr-admin-g03-attendance-leave.test.cjs` — 3/3 pass.
- `node --test apps/api/test/*.test.cjs` — full backend suite 691/692 (1 pre-existing unrelated
  skip) — including `ph25c-g03-punch-anomaly.test.cjs` (3/3, unaffected by the new flag check since
  it uses wildcard-permission actors).

## Verdict

**GAPS-FOUND → remediated.** Two net-new thin builds (`sanction_special`, `biometric.govern`), one
flag-enforcement fix (`punch.review_anomaly`), two pre-existing capabilities re-verified
(`approve_standard`, `attendance.regularize_approve`). One pre-existing, unrelated atomicity issue
in `LeaveService.approve()` discovered and flagged for future attention, not fixed (disproportionate
scope for this task).
