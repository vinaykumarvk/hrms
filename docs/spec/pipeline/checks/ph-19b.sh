#!/usr/bin/env bash
# PH-19B oracle: G08 FR-10 continuous feedback + check-ins — continuous_feedback / check_ins entries
# tied to a cycle, with a mandatory note guard.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g08 apps/api/src/routes/g08.routes.ts"; T=apps/api/test
echo "== PH-19B exit-criteria (G08 continuous feedback + check-ins) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "continuous feedback consumed (continuous_feedback)::continuous_feedback|continuousFeedback" \
  "check-ins consumed (check_ins)::check_ins|checkIns|checkIn" \
  "feedback tied to cycle::cycleId|cycle_id" \
  "mandatory note guard::VALIDATION_FAILED|note|comment"
do must "$spec" $S; done
for spec in \
  "NEGATIVE: empty feedback note rejected::VALIDATION_FAILED" \
  "continuous feedback / check-in exercised::continuous_feedback|continuousFeedback|check_ins|checkIn"
do must "$spec" "$T"/ph19b-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-19B met' || echo 'RED - PH-19B not complete') =="; exit "$fail"
