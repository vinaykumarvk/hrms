#!/usr/bin/env bash
# PH-19A oracle: G03 FR-23 blackout periods + mass-leave — blackout_periods block leave in-window
# (BLACKOUT_PERIOD), mass_leave batch, RETURN_TO_WORK_PENDING gate.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g03 apps/api/src/routes/g03.routes.ts"; T=apps/api/test
echo "== PH-19A exit-criteria (G03 blackout + mass-leave) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "blackout entity consumed (blackout_periods)::blackout_periods|blackoutPeriods" \
  "blackout guard (BLACKOUT_PERIOD)::BLACKOUT_PERIOD" \
  "mass-leave batch consumed (mass_leave)::mass_leave|massLeave" \
  "return-to-work gate (RETURN_TO_WORK_PENDING)::RETURN_TO_WORK_PENDING"
do must "$spec" $S; done
for spec in \
  "NEGATIVE: leave in blackout rejected (BLACKOUT_PERIOD)::BLACKOUT_PERIOD" \
  "blackout / mass-leave lifecycle exercised::blackout_periods|blackoutPeriods|mass_leave|massLeave"
do must "$spec" "$T"/ph19a-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-19A met' || echo 'RED - PH-19A not complete') =="; exit "$fail"
