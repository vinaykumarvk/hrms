/goal
  objective: Complete PH-09A - freeze the payroll and pension wave plan, pipeline wiring, and G10/G11 contract binding.
  context:
    - docs/spec/phased-plan.yaml#PH-09
    - docs/spec/ph-09-payroll-pension-wave-plan.md
    - docs/contracts/openapi/G10.yaml
    - docs/contracts/openapi/G11.yaml
    - docs/spec/pipeline/phases.yaml
  constraints:
    - Do not implement payroll or pension behavior in PH-09A.
    - Keep all PH-09 gates agentic only because each subphase has an executable oracle.
    - Do not weaken existing PH-08 checks or human-gate policy.
  freedom:
    - Add PH-09 prompts, checks, plan documentation, OpenAPI markers, and pipeline entries.
  evidence_required:
    - docs/spec/ph-09-payroll-pension-wave-plan.md
    - docs/spec/pipeline/phases.yaml includes PH-09A..PH-09E
    - docs/contracts/openapi/G10.yaml and G11.yaml include x-ph09-compensation-wave
    - `bash docs/spec/pipeline/checks/ph-09a.sh` GREEN
  escalate_when:
    - A PH-09 exit criterion cannot be expressed as an executable check.
