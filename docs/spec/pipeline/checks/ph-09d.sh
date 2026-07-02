#!/usr/bin/env bash
# PH-09D oracle: G10/G11 integration, SoD, provenance, and upstream impacts.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-09D exit-criteria (G10/G11 controls integration) =="

need_file apps/api/test/ph09-compensation-integration.test.cjs 3000

for marker in G10_LAST_PAY_DRAWN_FEED G09_PENALTY_QS_EXCLUSION PAYROLL_SOD PENSION_SOD PROVENANCE_COMPLETE G03_LOP_PAYROLL_IMPACT; do
  rg -q "$marker" apps/api/src/modules/g10 apps/api/src/modules/g11 apps/api/test/ph09-compensation-integration.test.cjs && grn "integration marker: $marker" || red "missing integration marker: $marker"
done

if npm run build && node --test apps/api/test/ph09-compensation-integration.test.cjs; then
  grn "PH-09D integration tests passed"
else
  red "PH-09D integration tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-09D met' || echo 'RED - PH-09D not complete') =="
exit "$fail"
