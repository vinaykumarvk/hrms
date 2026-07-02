/goal
  objective: Complete PH-08C - implement G06 promotion, seniority, DPC, MACP, and SR events.
  context:
    - apps/api/src/modules/g06/**
    - apps/api/src/routes/g06.routes.ts
    - docs/contracts/openapi/G06.yaml
    - docs/contracts/state-machines.yaml
  constraints:
    - Enforce DPC quorum and recusal in service code.
    - Post G06 establishment events only through G12.
    - Keep pay fixation out of G06; emit only pay-impact signal evidence for G10.
  freedom:
    - Add G06 service, routes, tests, security registry, contract registry, and foundation wiring.
  evidence_required:
    - apps/api/test/ph08-g06-promotion.test.cjs
    - `bash docs/spec/pipeline/checks/ph-08c.sh` GREEN
  escalate_when:
    - DPC quorum, recusal, or SR semantics cannot be made deterministic.
