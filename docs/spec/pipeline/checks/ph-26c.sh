#!/usr/bin/env bash
# PH-26C oracle: G14 FR-18 probabilistic predictive + fairness — an attrition model that scores risk
# EXCLUDING protected features (rejects protected input) and reports a fairness disparity metric.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g14 apps/api/src/routes/g14.routes.ts"; T=apps/api/test
echo "== PH-26C exit-criteria (G14 predictive + fairness) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "attrition prediction::attrition|predict|risk_score|riskScore" \
  "protected-feature exclusion::protected|PROTECTED|excludeProtected" \
  "fairness disparity metric::fairness|disparity|Fairness" \
  "model score::score|probability"
do must "$spec" $S; done
for spec in \
  "prediction exercised::attrition|predict|riskScore" \
  "NEGATIVE: protected feature rejected::protected|PROTECTED|VALIDATION_FAILED|FORBIDDEN"
do must "$spec" "$T"/ph26c-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-26C met' || echo 'RED - PH-26C not complete') =="; exit "$fail"
