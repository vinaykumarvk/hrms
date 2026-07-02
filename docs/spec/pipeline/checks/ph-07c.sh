#!/usr/bin/env bash
# PH-07C oracle: G02 personal details workflow.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-07C exit-criteria (G02 personal details) =="

need_file apps/api/src/modules/g02/personalDetailsService.ts 5000
need_file apps/api/src/routes/g02.routes.ts 3000
need_file apps/api/test/ph07-g02-personal-details.test.cjs 3000
for marker in "WF-G02-PERSONAL-DETAILS" "G02_CHANGE_REQUEST_COMMIT" "ownerModule: \"G01\"" "G13" "HIGH"; do
  grep -q "$marker" apps/api/src/modules/g02/personalDetailsService.ts apps/api/src/routes/g02.routes.ts apps/api/test/ph07-g02-personal-details.test.cjs && grn "G02 marker: $marker" || red "missing G02 marker: $marker"
done

if npm run build && node --test apps/api/test/ph07-g02-personal-details.test.cjs; then grn "G02 personal details tests passed"; else red "G02 personal details tests failed"; fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-07C met' || echo 'RED - PH-07C not complete') =="
exit "$fail"
