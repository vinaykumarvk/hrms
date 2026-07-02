#!/usr/bin/env bash
# PH-11C oracle: non-production cutover rehearsal and local release smoke.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-11C exit-criteria (cutover rehearsal) =="

need_file ops/cutover-rehearsal-runbook.md 1800
need_file docs/release/cutover-control-board.md 1600
need_file ops/local-release-smoke.sh 1000

for marker in CUTOVER_REHEARSAL_COMPLETED GO_LIVE_HUMAN_APPROVAL_PENDING ROLLBACK_AUTHORITY_ASSIGNED RELEASE_FREEZE_CHECK NO_PRODUCTION_MUTATION PH11_LOCAL_RELEASE_SMOKE_GREEN; do
  rg -q "$marker" ops docs/release && grn "cutover marker: $marker" || red "missing cutover marker: $marker"
done

if bash ops/local-release-smoke.sh; then
  grn "PH-11 local release smoke passed"
else
  red "PH-11 local release smoke failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-11C met' || echo 'RED - PH-11C not complete') =="
exit "$fail"
