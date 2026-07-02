#!/usr/bin/env bash
# PH-06D oracle: G03/G05 UI proof.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-06D exit-criteria (vertical-slice UI proof) =="

need_file apps/web/src/modules/g03/LeaveWorkspace.tsx 1000
need_file apps/web/src/modules/g05/TransferWorkspace.tsx 1200
need_file apps/web/test/ph06-vertical-slices.test.cjs 1200

for marker in "REPORTING_CHAIN" "G04 outbox" "LEAVE_APPROVED" "POSITION_AUTHORITY" "PARALLEL_ALL_OF" "TRANSFER_JOINED"; do
  grep -R -q "$marker" apps/web/src/modules/g03 apps/web/src/modules/g05 apps/web/test/ph06-vertical-slices.test.cjs && grn "UI marker: $marker" || red "missing UI marker: $marker"
done

if rg -n "\\bany\\b|as any|console\\.log|localhost" apps/web >/tmp/ph06d-web-hygiene.log 2>&1; then
  red "PH-06D web hygiene failed"
  sed -n '1,80p' /tmp/ph06d-web-hygiene.log
else
  grn "PH-06D web hygiene scan clean"
fi

if npm run web:check; then grn "npm run web:check passed"; else red "npm run web:check failed"; fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-06D met' || echo 'RED - PH-06D not complete') =="
exit "$fail"
