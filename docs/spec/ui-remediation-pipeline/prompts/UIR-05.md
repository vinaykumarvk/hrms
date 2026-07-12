/goal
  objective: Establish the approved token/component foundation and deterministic browser/accessibility harness without a whole-app rewrite.
  context:
    - docs/spec/ui-remediation/design-system-decision.md
    - docs/spec/ui-remediation/gate-acceptance-matrix.yaml
    - apps/web/src/**
    - package.json
  constraints:
    - Use only UIR-00-approved dependencies.
    - Preserve existing CSS until migrated slices pass parity.
    - Components must satisfy focus, active, disabled, loading, 44px, reduced-motion, contrast, and dialog/drawer focus contracts.
  freedom:
    - Choose approved Tailwind/shadcn configuration and component composition details.
  work_loops:
    - name: Foundation
      max_iterations: 3
      repeat_until: Button, Input, Select, Field, Alert, Card, Dialog, Drawer, Table, Skeleton, and notification primitives pass component checks.
      steps: [configure approved system, implement primitives, run component/static checks]
    - name: Browser harness
      max_iterations: 3
      repeat_until: Viewport, keyboard, and axe smoke tests execute deterministically.
      steps: [configure harness, bind fixtures, run smoke matrix]
  evidence_required:
    - approved design-system files and primitives
    - apps/web/test/e2e/**
    - bundle and CSS delta evidence
  escalate_when:
    - Approved browser binaries or dependencies cannot be obtained.
    - Primitive behavior conflicts with existing acceptance contracts.

