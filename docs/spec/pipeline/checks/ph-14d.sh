#!/usr/bin/env bash
# PH-14D oracle: approval-evidence quarantine and redaction.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-14D exit-criteria (approval-evidence quarantine) =="

need_file docs/release/approval-evidence-quarantine.md 1600
need_file docs/release/approval-evidence-redaction-guide.md 1600
need_file docs/release/board-decision-intake-playbook.md 1600

for marker in APPROVAL_EVIDENCE_QUARANTINE REDACTION_REQUIRED BOARD_DECISION_INTAKE_PLAYBOOK NO_SECRETS_OR_PII_IN_REPO HUMAN_APPROVALS_STILL_PENDING; do
  rg -q "$marker" docs/release apps/api/test/ph14-post-seal-drift-watch.test.cjs && grn "quarantine marker: $marker" || red "missing quarantine marker: $marker"
done

if node --test apps/api/test/ph14-post-seal-drift-watch.test.cjs; then
  grn "PH-14D quarantine/redaction tests passed"
else
  red "PH-14D quarantine/redaction tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-14D met' || echo 'RED - PH-14D not complete') =="
exit "$fail"

