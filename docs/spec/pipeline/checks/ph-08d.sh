#!/usr/bin/env bash
# PH-08D oracle: G07 training and G08 APAR.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-08D exit-criteria (G07/G08 statutory development) =="

need_file apps/api/src/modules/g07/trainingService.ts 7500
need_file apps/api/src/modules/g08/aparService.ts 8000
need_file apps/api/src/routes/g07.routes.ts 3500
need_file apps/api/src/routes/g08.routes.ts 4500
need_file apps/api/test/ph08-g07-g08-training-apar.test.cjs 3500
for marker in "TRAINING_CERTIFICATION_POSTED" "WF-G07-NOMINATION" "APAR_FINAL_GRADE" "SEALED_COVER" "G08_G06_FEED_SUPPRESSED"; do
  grep -q "$marker" apps/api/src/modules/g07/trainingService.ts apps/api/src/modules/g08/aparService.ts apps/api/src/routes/g07.routes.ts apps/api/src/routes/g08.routes.ts apps/api/test/ph08-g07-g08-training-apar.test.cjs && grn "G07/G08 marker: $marker" || red "missing G07/G08 marker: $marker"
done

if npm run build && node --test apps/api/test/ph08-g07-g08-training-apar.test.cjs; then grn "G07/G08 tests passed"; else red "G07/G08 tests failed"; fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08D met' || echo 'RED - PH-08D not complete') =="
exit "$fail"
