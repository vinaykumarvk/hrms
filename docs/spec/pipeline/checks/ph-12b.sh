#!/usr/bin/env bash
# PH-12B oracle: release-board dossier and human approval checklist.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-12B exit-criteria (release-board dossier) =="

need_file docs/release/release-board-dossier.md 1800
need_file docs/release/human-approval-checklist.md 1600
need_file apps/api/test/ph12-release-board-readiness.test.cjs 3000

for marker in RELEASE_BOARD_READY GO_NO_GO_HUMAN_DECISION_REQUIRED UAT_SIGNOFF_HUMAN_REQUIRED CAB_APPROVAL_HUMAN_REQUIRED GO_LIVE_HUMAN_APPROVAL_PENDING; do
  rg -q "$marker" docs/release apps/api/test/ph12-release-board-readiness.test.cjs && grn "board marker: $marker" || red "missing board marker: $marker"
done

if node --test apps/api/test/ph12-release-board-readiness.test.cjs; then
  grn "PH-12B release-board governance tests passed"
else
  red "PH-12B release-board governance tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-12B met' || echo 'RED - PH-12B not complete') =="
exit "$fail"

