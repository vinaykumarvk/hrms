#!/usr/bin/env bash
# PH-07D oracle: G03 attendance, leave, and payroll signals.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-07D exit-criteria (G03 attendance + payroll signals) =="

need_file apps/api/src/modules/g03/leaveService.ts 12000
need_file apps/api/src/routes/g03.routes.ts 6000
need_file apps/api/test/ph07-g03-attendance-payroll.test.cjs 3000
for marker in "READY_FOR_G10" "JOB-G03-ATTENDANCE-RECOMPUTE" "LEAVE_CANCELLED" "OVERTIME" "ATTENDANCE_REGULARISED"; do
  grep -q "$marker" apps/api/src/modules/g03/leaveService.ts apps/api/src/routes/g03.routes.ts apps/api/test/ph07-g03-attendance-payroll.test.cjs && grn "G03 marker: $marker" || red "missing G03 marker: $marker"
done

if npm run build && node --test apps/api/test/ph07-g03-attendance-payroll.test.cjs; then grn "G03 attendance/payroll tests passed"; else red "G03 attendance/payroll tests failed"; fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-07D met' || echo 'RED - PH-07D not complete') =="
exit "$fail"
