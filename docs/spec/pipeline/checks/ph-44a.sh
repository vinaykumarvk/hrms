#!/usr/bin/env bash
# PH-44A oracle: raise measured contract coverage by exposing the G13 checkout-lock lifecycle + rescan +
# access-audit/scan-result/module-ref reads (real, service-tested backing) as kernel routes. Checks routes
# registered + dispatched, and the ratchet advanced to >= 443 / 33.5%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g13.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-44A exit-criteria (G13 checkout/read route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in checkout releaseCheckout getCheckoutLock rescan listAccessAudit listScanResults listByModuleRef; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph44a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph44a-*.test.cjs ':checkout' "API test exercises the checkout routes"
have "$T"/ph44a-*.test.cjs 'access-audit|scan-results' "API test exercises the read routes"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=443)}" && grn "coverage ratcheted up (implemented $impl >= 443)" || red "coverage did not advance ($impl < 443)"
  awk "BEGIN{exit !($pct>=33.5)}" && grn "coverage >= 33.5% ($pct%)" || red "coverage below 33.5% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-44A met' || echo 'RED - PH-44A not complete') =="; exit "$fail"
