# Process Classification — Leave Application & Approval Test Coverage + Seed Remediation

```yaml
selected_path: standard
rationale: >
  The G03 leave application/approval feature (submit, approve, reject, delegate, withdraw,
  cancel; 5 leave types EL/CL/HPL/SL/CCL; REPORTING_CHAIN approval workflow; balance ledger;
  G04 SR relay) is already fully implemented and unit-proven (585 backend tests green,
  apps/api/src/modules/g03/leaveService.ts, apps/api/src/routes/g03.routes.ts,
  apps/web/src/modules/g03/{LeaveApplyForm,LeaveApproverInbox,LeaveWorkspace}.tsx). This is
  brownfield work on a stable, contract-governed system, not a new module: no new architecture,
  data model, or major API surface is required. But the request spans multiple FRs of new
  work (supervisor/entitlement/holiday-calendar seed data, gap evaluation, backend test cases,
  frontend/e2e test cases, bug remediation) that cross backend + frontend + seed layers, so
  "light" undersells it. No new contracts, auth model, or architecture is being introduced, so
  "full" is not justified.
objective: >
  Different types of leave (EL, CL, HPL, SL, CCL) can be submitted by an employee and approved
  by their resolved supervisor end-to-end, proven by backend integration tests and a frontend
  (component + Playwright e2e) test, backed by seeded supervisor, leave-calendar (holiday), and
  leave-entitlement data. Bugs/gaps found in the process are fixed so the full lifecycle passes.
autonomy_envelope:
  context:
    - apps/api/src/modules/g03/leaveService.ts (submit/approve/reject/delegate/withdraw/cancel, balances, holidays, eligibility)
    - apps/api/src/routes/g03.routes.ts (HTTP contract)
    - apps/api/src/platform/workflow/hrmsWorkflowService.ts (REPORTING_CHAIN workflow)
    - apps/api/src/platform/authority-resolution/authorityResolutionService.ts
    - apps/api/src/seed/ph03Seed.ts, apps/api/src/seed/testEmployeesSeed.ts (in-flight, uncommitted)
    - apps/api/src/platform/foundationServices.ts, tools/local-api-server.mjs
    - apps/web/src/modules/g03/*.tsx, apps/web/src/api/hrmsClient.ts
    - apps/web/test/e2e/*.spec.ts, apps/web/playwright.config.ts
    - docs/brd/v3/G03-attendance-and-leave-management.md, docs/contracts/state-machines.yaml, docs/contracts/auth-matrix.yaml
  constraints:
    - Do not alter the G03/G04 API contract (docs/contracts/openapi/G03.yaml) or state machine without an amendment
    - Do not weaken/remove existing passing tests to make new tests pass
    - Seed data stays clearly synthetic (existing testEmployeesSeed.ts convention: TEST PAN prefix, example.com/org domains, "Sample Public Bank") and off-by-default (opt-in flag)
    - No production code path may depend on seed/test-only data
    - Any authorization/eligibility bug fix must trace to a BRD FR or contract; if genuinely ambiguous, record and escalate rather than guess
  freedom:
    - Choose how to extend testEmployeesSeed.ts / add a holiday-calendar seed module
    - Choose test file layout/naming following existing ph0N-*.test.cjs and e2e spec.ts conventions
    - Choose whether a fix belongs in leaveService vs seed data vs test expectations, per repair discipline
  evidence_required:
    - node --test apps/api/test/*.test.cjs full-suite result (before/after)
    - New backend test file covering submit+approve+reject across all 5 leave types
    - New/extended frontend test (component-level and/or Playwright e2e) covering apply + approver-inbox approve flow
    - npm run typecheck, npm run build clean
    - docs/reviews/ done report
  escalate_when:
    - A destructive/irreversible DB migration would be required (none expected; in-memory repositories)
    - Approver-identity enforcement on WF-G03-LEAVE turns out to be a stated BRD requirement left unimplemented (under investigation) — if confirmed, this becomes a security-relevant fix requiring care, not a silent behavior change
    - A leave type's eligibility rule (e.g. SL's 60-month minimum service) cannot be exercised without inventing service history not grounded in seed conventions
minimum_artefacts:
  required:
    - docs/spec/process-classification.md (this file)
    - extended apps/api/src/seed/testEmployeesSeed.ts and/or new holiday-calendar seed
    - apps/api/test/*leave-lifecycle*.test.cjs (new)
    - apps/web frontend test coverage for LeaveApplyForm + LeaveApproverInbox
    - docs/reviews/leave-application-approval-lifecycle-<date>.md (done report)
  skipped_with_reason:
    - Full BRD rewrite — G03 BRD already exists and is current (docs/brd/v3/G03-attendance-and-leave-management.md)
    - New data model / migration — leave_types, leave_balances, holidays tables already exist (0002_g03_leave.sql)
    - New architecture doc — no architectural change
    - uiux-designer pass — LeaveApplyForm/LeaveApproverInbox are already real, non-skeleton, implemented screens; this work adds test coverage and data, not new UI surface
contracts:
  reuse:
    - docs/contracts/openapi/G03.yaml
    - docs/contracts/state-machines.yaml (leave_application machine)
    - docs/contracts/auth-matrix.yaml (g03.leave.* permissions)
  amend: []
  create: []
verification_plan:
  tests_to_write:
    - Backend: submit + approve lifecycle per leave type (EL, CL, HPL, SL, CCL), including a not-eligible-yet negative case for SL and an entitlement-cap negative case for CCL
    - Backend: reject, delegate, withdraw covered at least once each in the new lifecycle test
    - Backend: holiday-calendar interaction (spell fully on holiday rejected fully; countsHolidays=false type excludes holiday from day count)
    - Frontend: LeaveApplyForm submits and shows success; LeaveApproverInbox lists a SUBMITTED item and Approve transitions it away from the list
    - Playwright e2e (optional, evaluated during execution): full apply-as-employee -> approve-as-manager round trip against local-api-server
  tests_to_run:
    - npm run check (typecheck + full backend test suite)
    - npm run web:check (web typecheck + build + web unit tests)
    - npm run web:test:e2e (if seed wiring supports it)
  review_skills:
    - full-review (focused, no-fix) on the diff once implementation lands, if risk warrants
risks:
  - In-memory repositories mean "leave calendar" (holidays) and "entitlements" are process-lifetime seed data, not persisted rows — acceptable given the rest of the system uses the same pattern
  - Approver-identity enforcement gap (see escalate_when) could be a real security finding, not just a test gap — under active investigation before any fix is written
open_questions:
  - Is approver-identity enforcement on leave approval a stated BRD requirement? (investigation in progress)
recommended_next_command: proceed to seed-data gap analysis and phase-executor implementation (no separate requirements-capture needed; BRD already covers the FRs)
```
