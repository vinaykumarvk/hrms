/goal
  objective: Complete PH-06E - run full PH-06 conformance, update manifest/verdict evidence, and park for human scale-up approval.
  context:
    - docs/spec/ph-06-vertical-slice-implementation-plan.md
    - docs/spec/vertical-slice-g03-leave.yaml
    - docs/spec/vertical-slice-g05-transfer.yaml
    - apps/api/test/ph06-*.test.cjs
    - apps/web/test/ph06-vertical-slices.test.cjs
    - docs/spec/manifest.json
  constraints:
    - Do not weaken PH-06A-D checks to make PH-06E pass.
    - If either vertical slice is not runnable, mark PH-06E blocked and do not recommend scaling module waves.
    - PH-06E is a human gate after GREEN machine evidence.
  freedom:
    - Add final conformance test, verdict document, manifest evidence, and repair implementation gaps found by the oracle.
  evidence_required:
    - docs/spec/ph-06-verdict.md
    - docs/spec/manifest.json records PH-06 and PH-06A..PH-06E
    - `bash docs/spec/pipeline/checks/ph-06e.sh` GREEN
  escalate_when:
    - The proof suggests rebuilding or substantially redesigning P01/P02/P05/G12.
    - The scale-up decision is rejected or requires narrowing PH-07 scope.
