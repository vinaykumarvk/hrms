#!/usr/bin/env bash
# PH-08E oracle: G09 disciplinary due-process.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-08E exit-criteria (G09 disciplinary) =="

need_file apps/api/src/modules/g09/disciplinaryService.ts 9500
need_file apps/api/src/routes/g09.routes.ts 5000
need_file apps/api/test/ph08-g09-disciplinary.test.cjs 3500
for marker in "G09_AUTHORITY_COMPETENCE" "CHARGE_MEMO_SERVED" "INQUIRY_REPORT" "MAJOR_PENALTY" "APPEAL_DECIDED"; do
  grep -q "$marker" apps/api/src/modules/g09/disciplinaryService.ts apps/api/src/routes/g09.routes.ts apps/api/test/ph08-g09-disciplinary.test.cjs && grn "G09 marker: $marker" || red "missing G09 marker: $marker"
done

if npm run build && node --test apps/api/test/ph08-g09-disciplinary.test.cjs; then grn "G09 disciplinary tests passed"; else red "G09 disciplinary tests failed"; fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08E met' || echo 'RED - PH-08E not complete') =="
exit "$fail"
