#!/usr/bin/env bash
# PH-14C oracle: board-day readiness.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-14C exit-criteria (board-day readiness) =="

need_file docs/release/board-day-run-card.md 1700
need_file docs/release/no-go-quarantine-plan.md 1600
need_file ops/board-day-readiness-check.sh 1300

for marker in BOARD_DAY_RUN_CARD NO_GO_QUARANTINE_PLAN BOARD_DAY_READINESS_GREEN NO_PRODUCTION_EXECUTION HUMAN_BOARD_ACTION_REQUIRED; do
  rg -q "$marker" docs/release ops && grn "board marker: $marker" || red "missing board marker: $marker"
done

if bash ops/board-day-readiness-check.sh; then
  grn "PH-14 board-day readiness check passed"
else
  red "PH-14 board-day readiness check failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-14C met' || echo 'RED - PH-14C not complete') =="
exit "$fail"

