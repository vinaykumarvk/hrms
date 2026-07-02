/goal
  objective: Complete PH-06A - freeze the detailed vertical-slice plan and bind G03/G05 slice contracts to PH-06 pipeline checks.
  context:
    - docs/spec/phased-plan.yaml
    - docs/spec/ph-06-vertical-slice-implementation-plan.md
    - docs/spec/vertical-slice-g03-leave.yaml
    - docs/spec/vertical-slice-g05-transfer.yaml
    - docs/contracts/openapi/G03.yaml
    - docs/contracts/openapi/G05.yaml
    - docs/contracts/state-machines.yaml
    - docs/spec/pipeline/phases.yaml
  constraints:
    - Do not implement new module behavior in PH-06A.
    - Do not rewrite G03/G05 BRD-scale OpenAPI contracts; add only PH-06 binding markers if needed.
    - Keep PH-06E as human gate because the scale-up decision is judgment-bearing.
  freedom:
    - Add detailed plan, slice YAML, prompts, checks, and manifest wiring.
    - Use executable checks for PH-06A through PH-06D.
  evidence_required:
    - docs/spec/ph-06-vertical-slice-implementation-plan.md
    - docs/spec/vertical-slice-g03-leave.yaml
    - docs/spec/vertical-slice-g05-transfer.yaml
    - docs/spec/pipeline/phases.yaml includes PH-06A..PH-06E
    - `bash docs/spec/pipeline/checks/ph-06a.sh` GREEN
  escalate_when:
    - G03/G05 contract changes require changing approved state-machine semantics.
    - No executable oracle can be written for a PH-06 subphase.
