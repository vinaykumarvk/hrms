#!/usr/bin/env bash
# PH-11B oracle: UAT execution journal and defect triage.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-11B exit-criteria (UAT rehearsal evidence) =="

need_file docs/release/uat-execution-journal.md 1500
need_file docs/release/uat-defect-triage.md 1500
need_file apps/api/test/ph11-uat-governance.test.cjs 3000

for marker in UAT_EXECUTION_REHEARSAL UAT_SIGNOFF_HUMAN_REQUIRED UAT_DEFECT_TRIAGE BUSINESS_OWNER_PENDING GO_LIVE_HUMAN_APPROVAL_PENDING; do
  rg -q "$marker" docs/release apps/api/test/ph11-uat-governance.test.cjs && grn "UAT marker: $marker" || red "missing UAT marker: $marker"
done

if node --test apps/api/test/ph11-uat-governance.test.cjs; then
  grn "PH-11B UAT governance tests passed"
else
  red "PH-11B UAT governance tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-11B met' || echo 'RED - PH-11B not complete') =="
exit "$fail"
