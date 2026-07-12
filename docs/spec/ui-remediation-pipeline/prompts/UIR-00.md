/goal
  objective: Resolve design-system, dependency, route/workspace, auth/session, workflow-config, error, and sensitive-action conflicts and produce an approved finding closure envelope.
  context:
    - docs/spec/phased-plan.yaml#ui_remediation_2026_07_11
    - docs/reviews/ui-review-all-2026-07-11.md
    - doc/evaluations/hrms-ui-remediation-council-report-20260711.md
    - docs/architecture.md
    - docs/spec/ph-05-ui-implementation-plan.md
    - docs/contracts/auth-matrix.yaml
    - docs/contracts/error-taxonomy.yaml
  constraints:
    - This phase creates decision/spec artifacts only; do not change runtime behavior.
    - Do not invent product semantics, error codes, permissions, or endpoints.
    - UI-01 through UI-28 must each receive exactly one stable disposition.
    - Every claim cites a source path or command result.
  freedom:
    - Choose the clearest machine-readable schemas and decision-record format.
  work_loops:
    - name: Conflict resolution
      max_iterations: 3
      repeat_until: All conflicts have a source-grounded decision or explicit quarantine.
      steps: [inspect authoritative artifacts, reconcile conflicts, write decision records]
    - name: Closure ledger
      max_iterations: 3
      repeat_until: The oracle finds UI-01 through UI-28 exactly once with required fields.
      steps: [create ledger, link acceptance and contracts, run oracle]
  evidence_required:
    - docs/spec/ui-remediation/design-system-decision.md
    - docs/spec/ui-remediation/route-workspace-contract.md
    - docs/spec/ui-remediation/auth-action-contract-decisions.md
    - docs/spec/ui-remediation/critical-journey-acceptance.md
    - docs/spec/ui-remediation/finding-closure-ledger.yaml
  escalate_when:
    - Equal-authority artifacts require mutually exclusive product behavior.
    - A dependency, auth, RBAC, or API change lacks explicit human authority.

