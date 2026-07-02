#!/usr/bin/env bash
# PH-09B oracle: G10 deterministic payroll foundation.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-09B exit-criteria (G10 deterministic payroll) =="

need_file apps/api/src/modules/g10/payrollService.ts 5000
need_file apps/api/src/routes/g10.routes.ts 2000
need_file apps/api/test/ph09-g10-payroll.test.cjs 2500

for marker in PAYROLL_TRACE RULE_VERSION_SNAPSHOT INPUT_LOCKED BANK_X3_EXPORT LAST_PAY_DRAWN X3_BANK_SANDBOX; do
  rg -q "$marker" apps/api/src/modules/g10 apps/api/test/ph09-g10-payroll.test.cjs && grn "G10 marker: $marker" || red "missing G10 marker: $marker"
done

if npm run build && node --test apps/api/test/ph09-g10-payroll.test.cjs; then
  grn "PH-09B G10 tests passed"
else
  red "PH-09B G10 tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-09B met' || echo 'RED - PH-09B not complete') =="
exit "$fail"
