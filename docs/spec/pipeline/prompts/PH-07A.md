/goal
  objective: Complete PH-07A - freeze the PH-07 employee transaction wave plan, pipeline wiring, and contract binding markers.
  context:
    - docs/spec/phased-plan.yaml
    - docs/spec/ph-07-employee-transaction-wave-plan.md
    - docs/contracts/openapi/G02.yaml
    - docs/contracts/openapi/G03.yaml
    - docs/contracts/openapi/G04.yaml
    - docs/spec/pipeline/phases.yaml
  constraints:
    - Do not weaken PH-06 vertical-slice checks.
    - Do not change state-machine semantics.
    - Keep all PH-07 subphases on executable agentic gates.
  freedom:
    - Add PH-07A-E prompts, checks, plan doc, and OpenAPI binding markers.
  evidence_required:
    - docs/spec/ph-07-employee-transaction-wave-plan.md
    - docs/spec/pipeline/phases.yaml includes PH-07A..PH-07E
    - `bash docs/spec/pipeline/checks/ph-07a.sh` GREEN
  escalate_when:
    - The PH-07 exit criteria cannot be expressed as executable checks.
