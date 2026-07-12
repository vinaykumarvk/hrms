/goal
  objective: Implement only the approved server-enforced workspace, session, reset, export, and safe-error service semantics required by the critical journeys.
  context:
    - docs/spec/ui-remediation/route-workspace-contract.md
    - docs/spec/ui-remediation/auth-action-contract-decisions.md
    - docs/contracts/auth-matrix.yaml
    - docs/contracts/error-taxonomy.yaml
    - apps/api/src/**
    - apps/web/src/api/hrmsClient.ts
  constraints:
    - P02/RLS remains authoritative; client workspace state is never authorization.
    - No new error code, endpoint, or auth behavior without an approved contract.
    - Optional behaviors dispositioned not-required must be recorded, not fabricated.
  freedom:
    - Choose implementation route inside existing approved service patterns.
  work_loops:
    - name: Service implementation
      max_iterations: 3
      repeat_until: Positive and negative scope/session tests pass or the approved not-required oracle passes.
      steps: [write contract-derived tests, implement service behavior, run focused and regression tests]
  evidence_required:
    - service tests for workspace scope, stale cache, deep links, and session expiry
    - updated finding ledger evidence
  escalate_when:
    - Contract behavior is ambiguous or requires weakening auth/RBAC/data policy.

