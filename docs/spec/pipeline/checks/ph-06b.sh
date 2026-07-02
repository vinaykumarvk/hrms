#!/usr/bin/env bash
# PH-06B oracle: G03 leave backend vertical slice.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-06B exit-criteria (G03 leave backend) =="

need_file apps/api/src/modules/g03/leaveService.ts 5000
need_file apps/api/src/routes/g03.routes.ts 2500
need_file apps/api/test/ph06-g03-leave.test.cjs 2500

for marker in "REPORTING_CHAIN" "G04" "LEAVE_APPROVED" "G03_LEAVE_APPROVE" "G03_LEAVE_DELEGATE"; do
  grep -q "$marker" apps/api/src/modules/g03/leaveService.ts apps/api/src/routes/g03.routes.ts && grn "G03 implementation marker: $marker" || red "missing G03 marker: $marker"
done

if npm run build && node --test apps/api/test/ph06-g03-leave.test.cjs; then
  grn "G03 leave tests passed"
else
  red "G03 leave tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-06B met' || echo 'RED - PH-06B not complete') =="
exit "$fail"
