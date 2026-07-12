/goal
  objective: Repair the shell and Employee, Manager, and Admin critical journeys as gated vertical slices.
  context:
    - docs/spec/ui-remediation/**
    - apps/web/src/App.tsx
    - apps/web/src/app/**
    - apps/web/src/workflow/**
    - apps/web/src/modules/g10/**
  constraints:
    - UI navigation never widens server authorization.
    - No visible no-op, dead target, false state, or invented API behavior.
    - Confirm only actions classified irreversible or finalizing.
    - Preserve existing payload/RBAC tests.
  freedom:
    - Choose route/component composition within accepted contracts.
  work_loops:
    - name: Shell and workspace
      max_iterations: 3
      repeat_until: Every visible destination, active/focus state, mobile drawer, and workspace denial test passes.
      steps: [test first, implement routing/shell, verify role and viewport matrix]
    - name: Critical flows
      max_iterations: 3
      repeat_until: Login, workflow, and payroll journey oracles pass at all required viewports.
      steps: [repair one vertical slice, run targeted checks, run regression]
  evidence_required:
    - critical journey test results and screenshots
    - authorization-negative results
    - updated finding ledger
  escalate_when:
    - Route/workspace/action contract is insufficient or an existing oracle conflicts with it.

