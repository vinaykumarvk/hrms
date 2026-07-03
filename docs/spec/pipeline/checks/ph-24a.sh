#!/usr/bin/env bash
# PH-24A oracle: G11 FR-20 death-detection + overpayment recovery — death_registry reconciliation
# suspends pension; overpayment_recoveries schedule recovery from estate/family pension.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g11 apps/api/src/routes/g11.routes.ts"; T=apps/api/test
echo "== PH-24A exit-criteria (G11 death-detection + overpayment recovery) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "death registry reconciliation::death|DEATH|deceased" \
  "overpayment recovery entity (overpayment_recoveries)::overpayment_recoveries|overpaymentRecover" \
  "pension suspend on death::SUSPEND|suspend|DECEASED" \
  "recovery from estate/family::estate|family|recover"
do must "$spec" $S; done
for spec in \
  "death detection suspends pension exercised::death|DEATH|deceased|SUSPEND" \
  "NEGATIVE: over-recovery / post-death payment guard::PRECONDITION_FAILED|OVER|exceed|barred"
do must "$spec" "$T"/ph24a-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-24A met' || echo 'RED - PH-24A not complete') =="; exit "$fail"
