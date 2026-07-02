#!/usr/bin/env bash
# PH-08B oracle: G05 full transfer administration.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-08B exit-criteria (G05 full scope) =="

need_file apps/api/src/modules/g05/transferService.ts 17000
need_file apps/api/src/routes/g05.routes.ts 8000
need_file apps/api/test/ph08-g05-transfer-full.test.cjs 2500
for marker in "G05_REPRESENTATION_FILED" "TRANSFER_RETAINED" "TRANSFER_CANCELLED" "TRANSFER_DEEMED_RELIEVED" "deemRelieved"; do
  grep -q "$marker" apps/api/src/modules/g05/transferService.ts apps/api/src/routes/g05.routes.ts apps/api/test/ph08-g05-transfer-full.test.cjs && grn "G05 marker: $marker" || red "missing G05 marker: $marker"
done

if npm run build && node --test apps/api/test/ph06-g05-transfer.test.cjs apps/api/test/ph08-g05-transfer-full.test.cjs; then grn "G05 full-scope tests passed"; else red "G05 full-scope tests failed"; fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08B met' || echo 'RED - PH-08B not complete') =="
exit "$fail"
