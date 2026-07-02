/goal
  objective: Complete PH-06D - add G03/G05 vertical-slice demo UI surfaces on the PH-05 shell.
  context:
    - apps/web/src/App.tsx
    - apps/web/src/api/**
    - apps/web/src/app/**
    - apps/web/src/modules/g03/**
    - apps/web/src/modules/g05/**
    - docs/spec/vertical-slice-g03-leave.yaml
    - docs/spec/vertical-slice-g05-transfer.yaml
  constraints:
    - Do not introduce a second app shell.
    - Keep screens demoable with fixtures; mark fixture mode honestly.
    - Preserve PH-05 hygiene: no TypeScript any, no production console.log, no hardcoded localhost in web source.
  freedom:
    - Add compact G03 and G05 panels, fixture client methods, tests, and CSS.
    - Reuse PH-05 card/panel patterns.
  evidence_required:
    - apps/web/src/modules/g03/LeaveWorkspace.tsx
    - apps/web/src/modules/g05/TransferWorkspace.tsx
    - apps/web/test/ph06-vertical-slices.test.cjs
    - `bash docs/spec/pipeline/checks/ph-06d.sh` GREEN
  escalate_when:
    - UI requires live HTTP/server integration not present in PH-05.
    - The vertical slice cannot be demoed without manual DB edits.
