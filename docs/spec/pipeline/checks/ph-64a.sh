#!/usr/bin/env bash
# PH-64A oracle: NET-NEW implementation — the FR-EPM-006 education register (new EducationService +
# single-highest invariant with auto-demotion + year-of-passing validation + row_version lock + soft-delete),
# exposed as 4 kernel routes. Not a wiring. Ratchet advances to >= 564 / 42.6%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
S=apps/api/src/modules/g01/educationService.ts; R=apps/api/src/routes/g01.routes.ts; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-64A exit-criteria (NET-NEW FR-EPM-006 education register) =="
[ -d node_modules ] || red "node_modules absent"
[ -f "$S" ] && grn "net-new EducationService module present" || red "EducationService module missing"
have "$S" 'class EducationService' "EducationService class defined"
have "$S" 'demoteOtherHighest' "single-highest invariant enforced in the service"
have apps/api/src/platform/foundationServices.ts 'new EducationService' "wired in foundationServices"
for m in listEducation addEducation updateEducation removeEducation; do have "$R" "$m" "route wires backing method: $m"; done
have "$T"/ph64a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph64a-*.test.cjs 'isHighest' "API test asserts the single-highest invariant"
have "$T"/ph64a-*.test.cjs 'rowVersion|row_version' "API test asserts optimistic locking"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=564)}" && grn "coverage ratcheted up (implemented $impl >= 564)" || red "coverage did not advance ($impl < 564)"
  awk "BEGIN{exit !($pct>=42.6)}" && grn "coverage >= 42.6% ($pct%)" || red "coverage below 42.6% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-64A met' || echo 'RED - PH-64A not complete') =="; exit "$fail"
