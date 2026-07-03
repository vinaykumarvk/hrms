#!/usr/bin/env bash
# PH-17A oracle: G03 FR-15 leave-year close (carry-forward/lapse/HPL-conversion, simulate->commit,
# YEAR_ALREADY_CLOSED, PENDING_LEAVE_BLOCKS_CLOSE) + FR-16 encashment (cap, NOT_ENCASHABLE).
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g03 apps/api/src/routes/g03.routes.ts"; T=apps/api/test
echo "== PH-17A exit-criteria (G03 leave year-close + encashment) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "year-close entity consumed (leave_year_close)::leave_year_close" \
  "carry-forward computed::carry.?forward|carryForward|CARRY_FORWARD" \
  "lapse computed::lapse|LAPSE" \
  "close is simulate-then-commit::simulate|SIMULATED" \
  "double-close guard (YEAR_ALREADY_CLOSED)::YEAR_ALREADY_CLOSED" \
  "pending-leave close guard (PENDING_LEAVE_BLOCKS_CLOSE)::PENDING_LEAVE_BLOCKS_CLOSE" \
  "encashment entity consumed (leave_encashment)::leave_encashment" \
  "encashment cap (ENCASHMENT_CAP_EXCEEDED)::ENCASHMENT_CAP_EXCEEDED" \
  "non-encashable guard (NOT_ENCASHABLE)::NOT_ENCASHABLE"
do must "$spec" $S; done
for spec in \
  "NEGATIVE: double-close asserted (YEAR_ALREADY_CLOSED)::YEAR_ALREADY_CLOSED" \
  "NEGATIVE: encashment cap asserted (ENCASHMENT_CAP_EXCEEDED)::ENCASHMENT_CAP_EXCEEDED" \
  "year-close simulate/commit exercised (leave_year_close)::leave_year_close"
do must "$spec" "$T"/ph17a-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-17A met' || echo 'RED - PH-17A not complete') =="; exit "$fail"
