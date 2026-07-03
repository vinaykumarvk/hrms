#!/usr/bin/env bash
# PH-53A oracle: raise measured contract coverage by exposing G09 suspension review + show-cause response +
# consultation close/waive + hearing minutes + case reads (real, service-tested backing) as kernel routes.
# Checks routes registered + dispatched, and the ratchet advanced to >= 504 / 38.1%.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g09.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-53A exit-criteria (G09 disciplinary route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
for m in reviewSuspension respondToShowCause closeConsultation waiveConsultation recordPersonalHearingMinutes listCaseTimeline listIccAppointments listPersonalHearings getPenaltyOrder; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph53a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph53a-*.test.cjs 'case-timeline|icc-appointments' "API test exercises the case-read routes"
have "$T"/ph53a-*.test.cjs 'suspensions|consultations|show-cause' "API test exercises the mutation routes"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=504)}" && grn "coverage ratcheted up (implemented $impl >= 504)" || red "coverage did not advance ($impl < 504)"
  awk "BEGIN{exit !($pct>=38.1)}" && grn "coverage >= 38.1% ($pct%)" || red "coverage below 38.1% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-53A met' || echo 'RED - PH-53A not complete') =="; exit "$fail"
