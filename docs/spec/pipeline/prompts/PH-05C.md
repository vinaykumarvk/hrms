/goal
  objective: Rebuild the WORKFLOW INBOX AND TASK ACTION UI as real, API-connected forms. The audit
    (docs/reviews/brd-coverage-audit-20260702.md) found every module UI is a read-only metric card and
    the workflow surface is static markup: no <form>, task actions fired through a window CustomEvent
    hack, zero API calls, no loading/error states. This phase starts fixing that: approve/reject with a
    mandatory comment field, submit handlers calling the PH-05A API client, and canonical
    loading/empty/error states in the inbox. The re-baselined oracle asserts this and must go GREEN.
  context:
    - docs/reviews/brd-coverage-audit-20260702.md
    - apps/web/src/workflow/**                         # Inbox, TaskDetail, TaskActionPanel to rebuild
    - apps/web/src/api/hrmsClient.ts                   # the client the forms must call
    - docs/contracts/openapi/P01-workflow.yaml         # task action operations (claim/approve/reject/delegate)
    - apps/web/src/app/OperationalStates.tsx           # canonical state components
    - apps/web/test/ph05-workflow.test.cjs
    - docs/spec/pipeline/checks/ph-05c.sh              # the oracle — read it, satisfy it, never edit it
  audit_gaps:                                          # each gap below is asserted by the oracle
    - TaskDetail.tsx dispatches window CustomEvent("hrms-task-action") instead of calling the API — the
      action never leaves the browser. Replace with client calls to the PH-04B task action routes
      (claim, approve, reject, delegate, send-back).
    - TaskActionPanel has a textarea and an onClick, but no <form>, no onSubmit, no submission state, and
      the "mandatory reason" is display text — nothing enforces it. Reject/send-back/cancel must refuse
      to submit without a comment/reason and show a field-level validation message.
    - The inbox has no loading state while tasks fetch, no error state when the API fails (HrmsApiError is
      never caught), and only a bare empty sentence — use the canonical OperationalState kinds for
      loading/empty/error.
  constraints:
    - Real form semantics: <form> + onSubmit, submit disabled while in flight, mandatory comment enforced
      client-side for reject/send-back/cancel (server remains the authority), success refreshes the task
      list, failure renders the sanitized envelope's error code/message — never a raw stack.
    - All server interaction goes through the injected PH-05A client (Authorization, X-Correlation-Id,
      Idempotency-Key handled there). No direct fetch calls in components, no CustomEvent bus, no
      hardcoded localhost.
    - Keyboard/focus behaviour: form fields labelled, error text associated with the field, actions
      reachable without a pointer.
    - No console.log, no TypeScript any in apps/web/src.
    - Do NOT edit docs/spec/pipeline/checks/** or prompts/** — do not weaken the oracle.
    - Do NOT create or modify anything under .state/ or approvals/.
    - Surgical scope: apps/web/src/workflow + its tests (plus minimal App wiring to pass the client).
      Record views are PH-05D; shell/nav is PH-05B.
  work_loops:
    - name: API-connected task action forms
      max_iterations: 6
      repeat_until: TaskActionPanel is a real <form> whose onSubmit calls the client task-action methods
        (claim/approve/reject/delegate/send-back), the CustomEvent hack is deleted, reject/send-back/cancel
        refuse to submit without a reason, and submission state (in-flight/disabled) is visible.
      steps: [add client action methods if missing, convert panel to form, enforce mandatory reason,
        wire submit -> client -> refresh]
    - name: canonical inbox states
      max_iterations: 4
      repeat_until: the inbox renders OperationalState loading while fetching, empty when the queue is
        clear, and error (with retry) when the client throws — verified by toggling a failing fetch in tests.
      steps: [async load via client, catch HrmsApiError into error state, empty branch, retry affordance]
    - name: verify against the oracle
      max_iterations: 4
      repeat_until: ph05-workflow.test.cjs exercises form submission, mandatory-comment refusal, and
        loading/error rendering; `npm run -s typecheck`, `npm test`, `npm run -s web:typecheck`, and
        `npm run -s web:test` all pass; `bash docs/spec/pipeline/checks/ph-05c.sh` prints GREEN.
      steps: [write workflow UI tests, run all four toolchain commands, run the oracle, fix, repeat]
  evidence_required:
    - apps/web/src/workflow/** diffs (form, submit handlers, client calls, state branches)
    - apps/web/test/ph05-workflow.test.cjs with passing web:test output
    - GREEN output of `bash docs/spec/pipeline/checks/ph-05c.sh` captured in the phase log
  escalate_when:
    - The PH-04B task action routes are absent or shaped differently than P01-workflow.yaml (API gap —
      report against PH-04B, do not fake the call).
    - Mandatory-comment rules per action are ambiguous across BRD/P01 contract after one resolution
      attempt — surface the precise question.
    - The oracle stays RED after the loop budget for reasons outside apps/web/src/workflow.
