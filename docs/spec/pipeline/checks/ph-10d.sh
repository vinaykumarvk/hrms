#!/usr/bin/env bash
# PH-10D oracle: release runbooks, rollback, coexistence, UAT, and evidence pack.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-10D exit-criteria (release readiness evidence) =="

need_file docs/release/deployment-runbook.md 1500
need_file docs/release/rollback-plan.md 1500
need_file docs/release/coexistence-plan.md 1200
need_file docs/release/uat-scripts.md 1500
need_file docs/release/release-evidence-pack.md 1800
need_file apps/api/test/ph10-release-evidence.test.cjs 2200

for marker in UAT_ACCEPTANCE_PACK CUTOVER_HUMAN_APPROVAL_REQUIRED ROLLBACK_PLAN REQUIREMENT_TRACEABILITY MIGRATION_EXCEPTION_OWNERS RISK_OWNER_DATE; do
  rg -q "$marker" docs/release apps/api/test/ph10-release-evidence.test.cjs && grn "release marker: $marker" || red "missing release marker: $marker"
done

if node --test apps/api/test/ph10-release-evidence.test.cjs; then
  grn "PH-10D release evidence tests passed"
else
  red "PH-10D release evidence tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-10D met' || echo 'RED - PH-10D not complete') =="
exit "$fail"
