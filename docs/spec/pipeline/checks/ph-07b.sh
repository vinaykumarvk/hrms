#!/usr/bin/env bash
# PH-07B oracle: G04 leave-to-SR relay.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-07B exit-criteria (G04 relay) =="

need_file apps/api/src/modules/g04/leaveSrRelayService.ts 5000
need_file apps/api/src/routes/g04.routes.ts 2500
need_file apps/api/test/ph07-g04-relay.test.cjs 2500
for marker in "G04_RELAY_POSTED" "DEAD_LETTERED" "DISCARDED" "replayDeadLetter" "reconcile"; do
  grep -q "$marker" apps/api/src/modules/g04/leaveSrRelayService.ts apps/api/src/routes/g04.routes.ts && grn "G04 marker: $marker" || red "missing G04 marker: $marker"
done

if npm run build && node --test apps/api/test/ph07-g04-relay.test.cjs; then grn "G04 relay tests passed"; else red "G04 relay tests failed"; fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-07B met' || echo 'RED - PH-07B not complete') =="
exit "$fail"
