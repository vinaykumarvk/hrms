#!/usr/bin/env bash
# PH-62A oracle: NET-NEW implementation — the FR-EPM-004 nominee register (new NomineeService + VAL-NOMINEE
# share invariant + row_version optimistic lock + soft-delete), exposed as 4 kernel routes. Not a wiring of
# an existing engine: checks the new service module exists, the error code is registered, and the routes are
# dispatched + guarded. Ratchet advances to >= 556 / 42%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
S=apps/api/src/modules/g01/nomineeService.ts; R=apps/api/src/routes/g01.routes.ts; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-62A exit-criteria (NET-NEW FR-EPM-004 nominee register) =="
[ -d node_modules ] || red "node_modules absent"
[ -f "$S" ] && grn "net-new NomineeService module present" || red "NomineeService module missing"
have "$S" 'class NomineeService' "NomineeService class defined"
have "$S" 'VAL-NOMINEE' "VAL-NOMINEE share invariant enforced in the service"
have apps/api/src/platform/types.ts 'VAL-NOMINEE' "VAL-NOMINEE registered in the error taxonomy"
have apps/api/src/platform/foundationServices.ts 'new NomineeService' "NomineeService wired in foundationServices"
for m in listNominees addNominee updateNominee removeNominee; do have "$R" "$m" "route wires backing method: $m"; done
have "$T"/ph62a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph62a-*.test.cjs 'VAL-NOMINEE' "API test asserts the share invariant"
have "$T"/ph62a-*.test.cjs 'rowVersion|row_version' "API test asserts optimistic locking"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=556)}" && grn "coverage ratcheted up (implemented $impl >= 556)" || red "coverage did not advance ($impl < 556)"
  awk "BEGIN{exit !($pct>=42)}" && grn "coverage >= 42% ($pct%)" || red "coverage below 42% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-62A met' || echo 'RED - PH-62A not complete') =="; exit "$fail"
