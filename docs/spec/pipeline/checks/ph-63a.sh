#!/usr/bin/env bash
# PH-63A oracle: NET-NEW implementation — the FR-EPM-005 emergency-contact register (new
# EmergencyContactService + unique call-order priority invariant + row_version optimistic lock +
# soft-delete), exposed as 4 kernel routes. Not a wiring: checks the new service module + guards +
# dispatch. Ratchet advances to >= 560 / 42.3%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
S=apps/api/src/modules/g01/emergencyContactService.ts; R=apps/api/src/routes/g01.routes.ts; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-63A exit-criteria (NET-NEW FR-EPM-005 emergency-contact register) =="
[ -d node_modules ] || red "node_modules absent"
[ -f "$S" ] && grn "net-new EmergencyContactService module present" || red "EmergencyContactService module missing"
have "$S" 'class EmergencyContactService' "EmergencyContactService class defined"
have "$S" 'already holds this priority' "unique-priority invariant enforced in the service"
have apps/api/src/platform/foundationServices.ts 'new EmergencyContactService' "wired in foundationServices"
for m in listEmergencyContacts addEmergencyContact updateEmergencyContact removeEmergencyContact; do have "$R" "$m" "route wires backing method: $m"; done
have "$T"/ph63a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph63a-*.test.cjs 'CONFLICT' "API test asserts the priority-clash invariant"
have "$T"/ph63a-*.test.cjs 'rowVersion|row_version' "API test asserts optimistic locking"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=560)}" && grn "coverage ratcheted up (implemented $impl >= 560)" || red "coverage did not advance ($impl < 560)"
  awk "BEGIN{exit !($pct>=42.3)}" && grn "coverage >= 42.3% ($pct%)" || red "coverage below 42.3% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-63A met' || echo 'RED - PH-63A not complete') =="; exit "$fail"
