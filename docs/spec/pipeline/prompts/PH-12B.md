/goal
  objective: Complete PH-12B - prepare the release-board dossier, human approval checklist, and governance tests.
  context:
    - docs/spec/ph-11-verdict.md
    - docs/release/release-evidence-pack.md
    - docs/release/release-board-dossier.md
    - docs/release/human-approval-checklist.md
  constraints:
    - Do not mark UAT, CAB, go-live, production cutover, or rollback execution as approved.
    - Every decision item must have owner/date/status.
  freedom:
    - Add release-board readiness documents and tests.
  evidence_required:
    - docs/release/release-board-dossier.md
    - docs/release/human-approval-checklist.md
    - apps/api/test/ph12-release-board-readiness.test.cjs
    - `bash docs/spec/pipeline/checks/ph-12b.sh` GREEN
  escalate_when:
    - A decision requires a human board vote or risk acceptance.

