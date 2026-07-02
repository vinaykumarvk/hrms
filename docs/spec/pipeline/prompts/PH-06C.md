/goal
  objective: Complete PH-06C - implement and verify the G05 transfer/relieving/joining backend vertical slice.
  context:
    - docs/spec/vertical-slice-g05-transfer.yaml
    - docs/contracts/state-machines.yaml
    - docs/contracts/openapi/G05.yaml
    - apps/api/src/platform/**
    - apps/api/src/modules/g01/**
    - apps/api/src/modules/g05/**
    - apps/api/src/modules/g12/**
    - apps/api/src/modules/g13/**
    - apps/api/src/routes/**
  constraints:
    - Transfer approval must use POSITION_AUTHORITY resolver evidence.
    - Parallel clearance must be explicit and all branches must clear or deem before joining.
    - Joining must generate G13 evidence and append a G05 SR event through G12.
  freedom:
    - Add service, routes, route registry wiring, and focused tests.
    - Keep G05 minimal if needed, but transfer approval plus at least one deemed clearance and joining must be runnable.
  evidence_required:
    - apps/api/src/modules/g05/transferService.ts
    - apps/api/src/routes/g05.routes.ts
    - apps/api/test/ph06-g05-transfer.test.cjs
    - `bash docs/spec/pipeline/checks/ph-06c.sh` GREEN
  escalate_when:
    - G05 requires a new workflow engine capability beyond PH-01/PH-02 contracts.
    - G13 or G12 cannot be used without weakening their PH-03/PH-04 invariants.
