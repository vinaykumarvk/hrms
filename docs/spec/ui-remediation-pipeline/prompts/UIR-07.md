/goal
  objective: Migrate remaining module surfaces and implement only approved conditional quality features while closing every finding disposition.
  context:
    - docs/spec/ui-remediation/**
    - apps/web/src/modules/**
    - docs/architecture.md
  constraints:
    - Preserve substantive fields, API calls, RBAC, and canonical state behavior.
    - Dark mode, i18n, search, and skeleton polish follow only approved requirements/dispositions.
    - Do not introduce skeleton/thin components.
  freedom:
    - Sequence modules by risk and reuse proven primitives.
  work_loops:
    - name: Module migration
      max_iterations: 14
      repeat_until: Every module passes state, responsive, accessibility, and mutation regression checks.
      steps: [migrate one module, verify it, update ledger]
    - name: Conditional closure
      max_iterations: 3
      repeat_until: Every UI-01 through UI-28 entry is closed or formally deferred/rejected.
      steps: [implement approved features, record deferrals, validate ledger]
  evidence_required:
    - module regression and viewport results
    - complete finding closure ledger
    - conditional feature or defer evidence
  escalate_when:
    - A conditional feature lacks signed requirement or owner/date for deferment.

