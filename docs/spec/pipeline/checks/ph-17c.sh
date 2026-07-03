#!/usr/bin/env bash
# PH-17C oracle: G09 FR-015 vigilance/sealed-cover register — vigilance_records, clearance_status
# transitions, integrity_grade, sealed_cover flag, clearance lookup consumed by promotion (G06).
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g09 apps/api/src/routes/g09.routes.ts"; T=apps/api/test
echo "== PH-17C exit-criteria (G09 vigilance / sealed-cover register) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "vigilance register consumed (vigilance_records)::vigilance_records" \
  "clearance status tracked (clearance_status)::clearance_status|clearanceStatus" \
  "integrity grade recorded (integrity_grade)::integrity_grade|integrityGrade" \
  "sealed cover flag (sealed_cover)::sealed_cover|sealedCover" \
  "clearance lookup surface::clearance.?lookup|clearanceLookup|/vigilance" \
  "not-cleared status (NOT_CLEARED)::NOT_CLEARED|WITHHELD|DENIED"
do must "$spec" $S; done
for spec in \
  "NEGATIVE: sealed-cover / not-cleared blocks clearance asserted::NOT_CLEARED|WITHHELD|DENIED|sealed_cover|sealedCover" \
  "vigilance clearance lifecycle exercised (vigilance_records)::vigilance_records"
do must "$spec" "$T"/ph17c-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-17C met' || echo 'RED - PH-17C not complete') =="; exit "$fail"
