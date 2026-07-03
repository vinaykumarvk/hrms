#!/usr/bin/env bash
# PH-38A oracle: raise measured contract coverage by exposing the APAR calibration lifecycle (real,
# service-tested backing) as kernel routes. Checks the 5 routes are registered + dispatched in an API
# test, and that the coverage ratchet has advanced to >= 397 routes / 30% (recomputed independently).
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
have(){ grep -qE "$2" "$1" 2>/dev/null && grn "$3" || red "$3"; }
R="apps/api/src/routes/g08.routes.ts"; T=apps/api/test; TOOL=tools/contract-coverage.mjs
echo "== PH-38A exit-criteria (APAR calibration route exposure; coverage ratchet) =="
[ -d node_modules ] || red "node_modules absent"
have "$R" '/api/v1/appraisals/calibration-sessions' "calibration routes registered"
for m in createCalibrationSession proposeCalibrationRecommendation ratifyCalibrationRecommendation applyCalibrationAdjustment calibrationDistributionDiagnostic; do
  have "$R" "$m" "route wires backing method: $m"
done
have "$T"/ph38a-*.test.cjs 'api.dispatch|createFoundationApi' "API test dispatches through the kernel"
have "$T"/ph38a-*.test.cjs 'calibration-sessions' "API test exercises the calibration routes"
have "$T"/ph38a-*.test.cjs 'ERR-G08-RATIFY' "API test asserts the fail-closed apply guard"
if [ -d node_modules ]; then
  npm run -s build >/dev/null 2>&1 || red "build failed"
  impl="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).implementedTotal)})")"
  pct="$(node "$TOOL" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).totalPct)})")"
  awk "BEGIN{exit !($impl>=397)}" && grn "coverage ratcheted up (implemented $impl >= 397)" || red "coverage did not advance ($impl < 397)"
  awk "BEGIN{exit !($pct>=30)}" && grn "coverage >= 30% ($pct%)" || red "coverage below 30% ($pct%)"
  npm run -s typecheck >/dev/null 2>&1 && grn "typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-38A met' || echo 'RED - PH-38A not complete') =="; exit "$fail"
