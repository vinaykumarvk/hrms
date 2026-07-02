/goal
  objective: Complete PH-08A - freeze the PH-08 statutory administration wave plan, pipeline wiring, and contract binding markers.
  context:
    - docs/spec/phased-plan.yaml
    - docs/spec/ph-08-statutory-administration-wave-plan.md
    - docs/contracts/openapi/G05.yaml
    - docs/contracts/openapi/G06.yaml
    - docs/contracts/openapi/G07.yaml
    - docs/contracts/openapi/G08.yaml
    - docs/contracts/openapi/G09.yaml
    - docs/spec/pipeline/phases.yaml
  constraints:
    - Do not weaken PH-07 employee-wave checks.
    - Do not change state-machine semantics.
    - Keep PH-08 subphases on executable agentic gates only where a real oracle exists.
  freedom:
    - Add PH-08A-F prompts, checks, plan doc, and OpenAPI binding markers.
  evidence_required:
    - docs/spec/ph-08-statutory-administration-wave-plan.md
    - docs/spec/pipeline/phases.yaml includes PH-08A..PH-08F
    - `bash docs/spec/pipeline/checks/ph-08a.sh` GREEN
  escalate_when:
    - A PH-08 exit criterion cannot be expressed as an executable check.
