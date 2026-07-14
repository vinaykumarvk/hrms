# BRD Coverage — hr_admin G01 Employee Profile Capabilities

## Scope

Per the `hr_admin` role-capability audit and the user's two scoping decisions ("test against
runtime strings, document drift"; "build thin versions" of unimplemented capabilities): this
covers the 5 named G01 capabilities. Per the framing of this goal ("testing and remediation of
processes"), no new web UI was built for any of these — they are backend/admin correctness and
security work, not self-service UI features like the earlier goals in this session.

| Capability (user's naming) | Runtime permission string | Status |
|---|---|---|
| `epm.employee.manage` | `g01.employee.create` (+ related satellite-write permissions) | Pre-existing, tested (drift documented) |
| `epm.field.pii_unmask` | Read: field-grant-gated (`employee.pan`/`.aadhaar`/`.category`/`.dob`) via `canSeeField()`. Write: new `g01.employee.pii.correct` | Read side pre-existing; write side + `dob` field-gating built this session |
| `g01.bank.approve` | `g01.bank.approve` | Pre-existing (built earlier this session), tested |
| `bgv_review` (flag) | New `g01.bgv.record`/`g01.bgv.review`/`g01.bgv.read` + `bgv_reviewer` role | Net-new thin build |
| `letter_admin` (flag) | Deferred to the G13 task (`g13.letter.author` names the same underlying capability) | Not built here — see G08/G10/G12/G13/G14 task |

## Findings

### `epm.employee.manage` — permission-string drift (documented, not renamed)

The user's list names `epm.employee.manage`; the actual runtime permission is
`g01.employee.create` for the core creation action (plus separate, narrower permissions for each
satellite write: `g01.employee.contact.write`, `g01.employee.address.write`,
`g01.employee.dependent.write`). This mirrors `docs/contracts/auth-matrix.yaml`'s documented name,
not the code's. Per the "test against runtime strings" decision, no rename was made — verified the
actual runtime capability works end-to-end (`hr-admin-g01-employee-profile.test.cjs` test 1).

### `epm.field.pii_unmask` — two real gaps found and fixed

1. **`dob` was never projected onto the profile wire view at all** — not masked, simply absent from
   `EmployeeProfileView`/`serializeEmployee()`, for every role including hr_admin. This
   contradicts BRD Appendix B's field-access policy table, which explicitly names
   `employees.dob` with `HR Admin: FULL (governed write)`. Fixed: `dob` added to
   `EmployeeProfileView`, gated by `canSeeField(actor, "employee.dob")`, matching the existing
   pan/aadhaar/category pattern exactly.
2. **No write path existed for PAN/DOB after employee creation** — these fields were write-only at
   `create()`/`createFromImport()` time; BRD Appendix B marks them
   `FULL(reason)`/`FULL (governed write)` for HR Admin. Fixed: new `correctPii(actor, employeeId,
   {pan?, dob?, reason})` — reason-required, PAN-format-validated, audited, with an
   attribute-history entry per changed field (matching this service's established audit-trail
   convention). Route: `POST /api/v1/employees/{id}:correct-pii`.

**Deliberate scope limitation, flagged not hidden**: BRD Appendix B's "governed write" language,
and the pre-existing `requestGovernedChange`/`approveGovernedChange` two-step maker-checker system
in this same file, both imply a genuine second-approver step for statutory-field corrections. That
existing system is tightly coupled to `display_name` only (`GovernedChangeRequest.fieldName:
"display_name"`) — generalizing it to also cover `dob`/`pan` would touch a working, tested
mechanism and is a larger, separate enhancement. This thin build instead ships a direct,
reason-required, audited single-step correction. If a genuine second-approver requirement is
wanted for PII specifically, generalizing the existing governed-change system is the natural next
step, not a parallel one.

### `g01.bank.approve` — already complete, re-verified

Built and reviewed earlier this session (`docs/reviews/brd-coverage-g01-personal-details-self-service-2026-07-13.md`).
Re-verified here as part of the hr_admin capability sweep: maker≠checker SOD holds (the actor who
submitted a bank-account change cannot approve their own submission, even holding
`g01.bank.approve`), and a genuine hr_admin/checker actor can approve.

### `bgv_review` — net-new thin build

Nothing existed for background-verification review before this session (confirmed by the initial
survey: no service, no route, no test, no seed). Built `BackgroundVerificationService`
(`apps/api/src/modules/g01/backgroundVerificationService.ts`), matching the established G01
satellite-service pattern (`nomineeService.ts`/`emergencyContactService.ts`): `recordBgvResult`
(maker, e.g. onboarding desk/vendor integration), `reviewBgvResult` (checker — dispositions a
`DISCREPANCY_FOUND` result as ACCEPTED/ESCALATED/REJECTED with mandatory notes), `listBgvRecords`
(read). Routes: `POST /api/v1/employees/{id}/bgv-records`, `POST /api/v1/bgv-records/{id}:review`,
`GET /api/v1/employees/{id}/bgv-records`.

**Capability-flag modeling decision** (applies to every remaining "flag" capability in this goal,
documented once here): `ActorContext` has no dedicated capability-flag field — only
`roles`/`permissions`/`fieldGrants`. The `bgv_review` flag is modeled as an additional role string
(`bgv_reviewer`) an hr_admin actor must also hold to call `reviewBgvResult` — consistent with how
every other fine-grained access decision in this codebase is represented (a `Set<string>` checked
against `actor.roles`). A CLEAR/PENDING record cannot be "reviewed" (nothing to disposition,
`PRECONDITION_FAILED`/412); a DISCREPANCY_FOUND record requires non-empty review notes.

### `letter_admin` — deferred, not duplicated

Appears twice in the user's capability list: once as a G01 flag (`letter_admin`), once as the G13
action code `g13.letter.author` — almost certainly the same underlying capability described from
two module angles (letter templates naturally belong to the document/records module). Built once
under the G08/G10/G12/G13/G14 task, not duplicated here.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/hr-admin-g01-employee-profile.test.cjs` — 6/6 pass.
- `node --test apps/api/test/*.test.cjs` — full backend suite 685/686 (1 pre-existing unrelated
  skip).
- `node --test dist/apps/api/src/modules/g01/p02FieldMasking.test.js` — still 1/1 pass (the `dob`
  field addition doesn't disturb the existing pan/aadhaar/category masking test). Note: this `.ts`
  co-located test file (and its sibling `g01ToG12SrIngest.test.ts`) are not wired into
  `npm run check`'s test step (`apps/api/test/*.test.cjs` only) — a pre-existing gap in the test
  runner configuration, unrelated to this feature, not fixed here (disproportionate scope).

## Verdict

**GAPS-FOUND → remediated within this session's implementation** for the 4 capabilities in scope
here (`epm.employee.manage`, `epm.field.pii_unmask`, `g01.bank.approve`, `bgv_review`).
`letter_admin` is intentionally deferred to avoid duplicate work, not silently dropped.
