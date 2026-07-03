#!/usr/bin/env bash
# PH-42A oracle: raise measured contract coverage by exposing the FR-G07-018 external-credential
# lifecycle + vendor-empanelment decisions (real, service-tested backing) as kernel routes. Checks
# routes registered + dispatched, and the ratchet advanced to >= 430 / 32.5%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g07.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-42A exit-criteria (G07 credential/empanelment route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in captureExternalCredential reviewCredentialEvidence verifyExternalCredential rejectExternalCredential getExternalCredential listCredentialVerifications reviewEmpanelment decideEmpanelment getEmpanelment; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph42a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph42a-*.test.cjs 'external-credentials' "API test exercises the credential routes"
have "$T"/ph42a-*.test.cjs 'VAL-G07-CREDREF' "API test asserts the duplicate-reference guard"
have "$T"/ph42a-*.test.cjs 'vendor-empanelments' "API test exercises the empanelment routes"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=430)}" && grn "coverage ratcheted up (implemented $impl >= 430)" || red "coverage did not advance ($impl < 430)"
  awk "BEGIN{exit !($pct>=32.5)}" && grn "coverage >= 32.5% ($pct%)" || red "coverage below 32.5% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-42A met' || echo 'RED - PH-42A not complete') =="; exit "$fail"
