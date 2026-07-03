#!/usr/bin/env bash
# PH-55A oracle: raise measured contract coverage by exposing the G01 governed write-ports (identity change /
# transfer posting / probation confirmation) + live-record/count reads (real, service-tested backing) as
# kernel routes. Checks routes registered + dispatched, and the ratchet advanced to >= 519 / 39.2%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g01.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-55A exit-criteria (G01 governed write-port route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in governedIdentityChange applyTransferPosting applyProbationConfirmation getLiveRecordForIdentityOps listLiveRecordsForIdentityOps 'employeeMaster.count'; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph55a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph55a-*.test.cjs 'governed-identity-change|apply-transfer-posting' "API test exercises the write-ports"
have "$T"/ph55a-*.test.cjs 'list-live-records|:count' "API test exercises the reads"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=519)}" && grn "coverage ratcheted up (implemented $impl >= 519)" || red "coverage did not advance ($impl < 519)"
  awk "BEGIN{exit !($pct>=39.2)}" && grn "coverage >= 39.2% ($pct%)" || red "coverage below 39.2% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-55A met' || echo 'RED - PH-55A not complete') =="; exit "$fail"
