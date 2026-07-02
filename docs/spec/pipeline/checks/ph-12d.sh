#!/usr/bin/env bash
# PH-12D oracle: release-board agenda and decision templates.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-12D exit-criteria (board agenda + decision templates) =="

need_file docs/release/release-board-agenda.md 1600
need_file docs/release/go-no-go-decision-record-template.md 1600
need_file docs/release/rollback-authorization-template.md 1600

for marker in RELEASE_BOARD_AGENDA GO_NO_GO_DECISION_TEMPLATE ROLLBACK_AUTHORIZATION_TEMPLATE ROLLBACK_EXECUTION_HUMAN_REQUIRED OWNER_DATE; do
  rg -q "$marker" docs/release apps/api/test/ph12-release-board-readiness.test.cjs && grn "decision marker: $marker" || red "missing decision marker: $marker"
done

if node --test apps/api/test/ph12-release-board-readiness.test.cjs; then
  grn "PH-12D board decision-template tests passed"
else
  red "PH-12D board decision-template tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-12D met' || echo 'RED - PH-12D not complete') =="
exit "$fail"

