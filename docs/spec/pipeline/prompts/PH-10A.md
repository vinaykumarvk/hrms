/goal
  objective: Complete PH-10A - freeze the analytics, hardening, and release-readiness plan, pipeline wiring, and G14 contract binding.
  context:
    - docs/spec/phased-plan.yaml#PH-10
    - docs/spec/ph-10-analytics-hardening-release-plan.md
    - docs/contracts/openapi/G14.yaml
    - docs/spec/pipeline/phases.yaml
    - docs/phased-plan.md
  constraints:
    - Do not implement analytics or release behavior in PH-10A.
    - Keep production/UAT/cutover approval out of agentic execution.
    - Keep PH-10 gates agentic only where an executable oracle exists.
  freedom:
    - Add PH-10 prompts, checks, plan documentation, OpenAPI marker, phased-plan note, and pipeline entries.
  evidence_required:
    - docs/spec/ph-10-analytics-hardening-release-plan.md
    - docs/spec/pipeline/phases.yaml includes PH-10A..PH-10E
    - docs/contracts/openapi/G14.yaml includes x-ph10-release-analytics
    - docs/phased-plan.md includes PH-10 implementation evidence note
    - `bash docs/spec/pipeline/checks/ph-10a.sh` GREEN
  escalate_when:
    - A PH-10 exit criterion cannot be made executable without claiming production approval.
