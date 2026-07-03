#!/usr/bin/env bash
# PH-65A oracle: NET-NEW implementation — the FR-EPM-008 bank-account register (new BankAccountService +
# VAL-IFSC format + single primary-salary invariant + PENDING->APPROVED maker-checker + penny-drop tri-state
# + row_version lock + soft-delete), exposed as 6 kernel routes. Not a wiring. Ratchet >= 570 / 43.1%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
S=apps/api/src/modules/g01/bankAccountService.ts; R=apps/api/src/routes/g01.routes.ts; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-65A exit-criteria (NET-NEW FR-EPM-008 bank-account register) =="
[ -d node_modules ] || red "node_modules absent"
[ -f "$S" ] && grn "net-new BankAccountService module present" || red "BankAccountService module missing"
have "$S" 'class BankAccountService' "BankAccountService class defined"
have "$S" 'VAL-IFSC' "VAL-IFSC format guard enforced in the service"
have "$S" 'demoteOtherPrimary' "single primary-salary invariant enforced"
have apps/api/src/platform/types.ts 'VAL-IFSC' "VAL-IFSC registered in the error taxonomy"
have apps/api/src/platform/foundationServices.ts 'new BankAccountService' "wired in foundationServices"
for m in listBankAccounts addBankAccount updateBankAccount approveBankAccount recordPennyDrop removeBankAccount; do have "$R" "$m" "route wires backing method: $m"; done
have "$T"/ph65a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph65a-*.test.cjs 'VAL-IFSC' "API test asserts the IFSC format guard"
have "$T"/ph65a-*.test.cjs 'penny-drop|PENDING' "API test asserts the lifecycle"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=570)}" && grn "coverage ratcheted up (implemented $impl >= 570)" || red "coverage did not advance ($impl < 570)"
  awk "BEGIN{exit !($pct>=43.1)}" && grn "coverage >= 43.1% ($pct%)" || red "coverage below 43.1% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-65A met' || echo 'RED - PH-65A not complete') =="; exit "$fail"
