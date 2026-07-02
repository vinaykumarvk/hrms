#!/usr/bin/env bash
# PH-09C oracle: G11 deterministic pension foundation.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-09C exit-criteria (G11 deterministic pension) =="

need_file apps/api/src/modules/g11/pensionService.ts 5000
need_file apps/api/src/routes/g11.routes.ts 2000
need_file apps/api/test/ph09-g11-pension.test.cjs 2500

for marker in SR_VERIFICATION_GATE QUALIFYING_SERVICE_LOCKED PENSION_CALC_TRACE PPO_ISSUED G11_SR_POSTED; do
  rg -q "$marker" apps/api/src/modules/g11 apps/api/test/ph09-g11-pension.test.cjs && grn "G11 marker: $marker" || red "missing G11 marker: $marker"
done

if npm run build && node --test apps/api/test/ph09-g11-pension.test.cjs; then
  grn "PH-09C G11 tests passed"
else
  red "PH-09C G11 tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-09C met' || echo 'RED - PH-09C not complete') =="
exit "$fail"
