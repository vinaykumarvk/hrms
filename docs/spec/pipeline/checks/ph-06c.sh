#!/usr/bin/env bash
# PH-06C oracle: G05 transfer backend vertical slice.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-06C exit-criteria (G05 transfer backend) =="

need_file apps/api/src/modules/g05/transferService.ts 6000
need_file apps/api/src/routes/g05.routes.ts 3000
need_file apps/api/test/ph06-g05-transfer.test.cjs 3500

for marker in "POSITION_AUTHORITY" "PARALLEL_ALL_OF" "DEEMED_CLEARED" "TRANSFER_JOINED" "G05_TRANSFER_RELIEVE_JOIN"; do
  grep -q "$marker" apps/api/src/modules/g05/transferService.ts apps/api/src/routes/g05.routes.ts && grn "G05 implementation marker: $marker" || red "missing G05 marker: $marker"
done

if npm run build && node --test apps/api/test/ph06-g05-transfer.test.cjs; then
  grn "G05 transfer tests passed"
else
  red "G05 transfer tests failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-06C met' || echo 'RED - PH-06C not complete') =="
exit "$fail"
