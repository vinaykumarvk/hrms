#!/usr/bin/env bash
# PH-08C oracle: G06 promotion/seniority/DPC/MACP.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-08C exit-criteria (G06 statutory promotion) =="

need_file apps/api/src/modules/g06/promotionService.ts 9000
need_file apps/api/src/routes/g06.routes.ts 4500
need_file apps/api/test/ph08-g06-promotion.test.cjs 3500
for marker in "DPC_QUORUM" "DPC_RECUSAL" "PROMOTION_EFFECTED" "MACP_EFFECTED" "G06_PAY_IMPACT_SIGNAL"; do
  grep -q "$marker" apps/api/src/modules/g06/promotionService.ts apps/api/src/routes/g06.routes.ts apps/api/test/ph08-g06-promotion.test.cjs && grn "G06 marker: $marker" || red "missing G06 marker: $marker"
done

if npm run build && node --test apps/api/test/ph08-g06-promotion.test.cjs; then grn "G06 promotion tests passed"; else red "G06 promotion tests failed"; fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08C met' || echo 'RED - PH-08C not complete') =="
exit "$fail"
