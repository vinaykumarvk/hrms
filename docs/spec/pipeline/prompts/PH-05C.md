/goal
  objective: Complete PH-05C - implement P01 inbox, task detail/action UI, and the minimum YAML-backed workflow configuration operations UI.
  context:
    - docs/spec/ph-05-ui-implementation-plan.md
    - docs/contracts/openapi/P01-workflow.yaml
    - apps/api/src/routes/p01-workflow.routes.ts
    - apps/web/src/**
    - /Users/n15318/PUDA_workflow_engine/apps/officer/src/WorkflowConfigConsole.tsx
    - /Users/n15318/PUDA_workflow_engine/apps/officer/src/workflow-config/**
  constraints:
    - Treat PUDA UI sources as read-only references; do not copy PUDA domain assumptions or LAC/LOI labels.
    - The minimum config surface may be YAML-backed; defer advanced graph editing unless it is safe and fully checked.
    - Publish must remain maker-checker governed.
    - Send-back/reject/cancel require reasons.
    - Do not use `any`, `as any`, production `console.log`, or hardcoded localhost URLs.
  freedom:
    - Implement fixture-backed workflow operations using the PH-04 route client.
    - Add local parser/validator helpers if they avoid new production dependencies.
  work_loops:
    - name: Inbox and task operations
      max_iterations: 5
      repeat_until: Inbox, task detail, action panel, comments, send-back, delegate, cancel, query, approve/reject, and audit/history surfaces work in fixture mode.
      steps:
        - build inbox list
        - build task detail and action panel
        - enforce reason validation
        - add workflow operation tests
    - name: Workflow config minimum surface
      max_iterations: 5
      repeat_until: YAML-backed validate, simulate, submit for review, publish, and evidence export states exist with maker-checker protections.
      steps:
        - inspect PUDA config UI for platform-neutral patterns
        - build HRMS config review component
        - wire validation/simulation fixture
        - test maker-checker behavior
    - name: Review-repair
      max_iterations: 3
      repeat_until: PH-05C oracle is GREEN and manifest evidence is recorded.
      steps:
        - run npm run web:check
        - run bash docs/spec/pipeline/checks/ph-05c.sh
        - fix gaps
  evidence_required:
    - apps/web/src/workflow/Inbox.tsx
    - apps/web/src/workflow/TaskDetail.tsx
    - apps/web/src/workflow/TaskActionPanel.tsx
    - apps/web/src/workflow/WorkflowConfigConsole.tsx
    - apps/web/src/workflow/workflowConfigModel.ts
    - apps/web/test/ph05-workflow.test.cjs
    - docs/spec/manifest.json records PH-05C
    - `bash docs/spec/pipeline/checks/ph-05c.sh` GREEN
  escalate_when:
    - PUDA UI reuse requires unresolved licensing/provenance acceptance.
    - Workflow config publish cannot be made maker-checker governed.
    - P01 route behavior must change.
