/goal
  objective: PH-06D — replace the read-only G03/G05 proof panels with a real demo UI. The audit
    (docs/reviews/brd-coverage-audit-20260702.md) found every module web surface is a read-only
    metric/summary card fed by precomputed slice props: no forms, no actions, no fetches, no canonical
    states — the "no skeleton UI" rule inverted. PH-06D delivers working user surfaces for the two
    vertical-slice modules.
  audit_gaps_closed:
    - G03 leave-apply form: real inputs (employee, leave type from config, from/to dates, reason), client-side
      validation, submit that POSTs /api/v1/atl/leave-applications through the shared hrmsClient, success and
      failure feedback (named error codes such as LEAVE_OVERLAP / INSUFFICIENT_BALANCE rendered to the user).
    - G03 approver inbox: lists pending SUBMITTED applications fetched from the API with approve / reject
      actions that call the /decision route and update the list.
    - G05 transfer workspace: initiate-transfer form (employee, from/to org unit, order/effective dates)
      POSTing /api/v1/transfers/orders, plus an orders list showing clearance progress.
    - Canonical states on every surface: loading (during fetch/submit), empty ("no applications"/"no orders"),
      error (API failure rendered, not swallowed) — audit: all of these were absent.
  context:
    - apps/web/src/modules/g03/LeaveWorkspace.tsx , apps/web/src/modules/g05/TransferWorkspace.tsx  # current read-only panels
    - apps/web/src/api/hrmsClient.ts               # shared fetch client (correlation id, idempotency key, HrmsApiError)
    - apps/web/src/App.tsx , apps/web/src/app/**   # PH-05 shell the surfaces mount into
    - apps/api/src/routes/g03.routes.ts , apps/api/src/routes/g05.routes.ts  # real route shapes to consume
    - docs/brd/v3/G03-attendance-and-leave-management.md , docs/brd/v3/G05-transfer-relieving-joining-workflow.md
  constraints:
    - All API access goes through apps/web/src/api/hrmsClient.ts (no ad-hoc fetch with hardcoded hosts).
    - Every form input is a controlled component with a real onSubmit handler; no skeleton components —
      real fields, real API calls, real state transitions.
    - Render API error envelopes (code + message) to the user; never swallow errors or log to console in
      production paths.
    - Match API request/response shapes exactly as g03/g05 routes define them.
    - Keep the existing evidence panels' information available (may be folded into the new surfaces).
    - Do NOT weaken or edit any oracle under docs/spec/pipeline/checks/; do NOT touch docs/spec/pipeline/.state/ or approvals/.
  work_loops:
    - name: G03 leave apply + approver inbox
      max_iterations: 5
      repeat_until: apps/web/src/modules/g03/** contains a leave-apply form (inputs + onSubmit + client call)
        and an approver inbox with approve/reject buttons wired to the decision route; loading/empty/error
        states render; `npm run web:typecheck` passes.
      steps: [apply form component, inbox component with actions, state handling, wire into shell]
    - name: G05 transfer workspace
      max_iterations: 4
      repeat_until: apps/web/src/modules/g05/** contains an initiate-transfer form posting through the client
        and an orders view with clearance progress; loading/empty/error states render.
      steps: [initiate form, orders list, state handling]
    - name: web tests + verify
      max_iterations: 4
      repeat_until: apps/web/test contains PH-06D assertions that the g03/g05 surfaces have forms with
        onSubmit handlers, client calls, and all three canonical states; `npm run web:typecheck`,
        `npm run web:test`, `npm run typecheck`, `npm test` all green; `bash docs/spec/pipeline/checks/ph-06d.sh` GREEN.
      steps: [write web tests, run all suites, run oracle, fix]
  freedom:
    - Component decomposition, layout, styling, and how the surfaces mount into the PH-05 shell are yours;
      new files under apps/web/src/modules/g03|g05 are expected.
    - You may extend hrmsClient with typed methods for the routes the surfaces need.
    - Optimistic vs refetch-after-action list updates are your choice, as long as failure states render.
  evidence_required:
    - apps/web/src/modules/g03/** and apps/web/src/modules/g05/** with form + action + state code
    - apps/web/test/*.test.cjs covering the new surfaces
    - `npm run web:typecheck` + `npm run web:test` + `npm run typecheck` + `npm test` green; ph-06d.sh GREEN
  escalate_when:
    - A required API shape is missing from g03/g05 routes (backend gap — record it; do not fake data in the UI).
    - The shell cannot mount interactive module surfaces without PH-05 architectural change.
