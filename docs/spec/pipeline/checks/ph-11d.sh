#!/usr/bin/env bash
# PH-11D oracle: support handoff, RACI, incident, hypercare, and SLA ownership.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-11D exit-criteria (operational handoff) =="

need_file docs/release/hypercare-plan.md 1500
need_file docs/release/support-handoff.md 1500
need_file docs/release/operational-raci.md 1500

for marker in HYPERCARE_WINDOW SUPPORT_HANDOFF OPERATIONAL_RACI INCIDENT_SEVERITY_MATRIX SLA_OWNERS RISK_OWNER_DATE; do
  rg -q "$marker" docs/release apps/api/test/ph11-uat-governance.test.cjs && grn "operations marker: $marker" || red "missing operations marker: $marker"
done

if node --test apps/api/test/ph11-uat-governance.test.cjs; then
  grn "PH-11D operational governance tests passed"
else
  red "PH-11D operational governance tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-11D met' || echo 'RED - PH-11D not complete') =="
exit "$fail"
