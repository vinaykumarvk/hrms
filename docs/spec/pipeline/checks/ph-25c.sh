#!/usr/bin/env bash
# PH-25C oracle: G03 FR-20 punch anomaly review — punch_anomaly_reviews flag impossible-travel /
# duplicate punches, a review lifecycle (FLAGGED -> CONFIRMED_FRAUD / VALID), self-review block.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g03 apps/api/src/routes/g03.routes.ts"; T=apps/api/test
echo "== PH-25C exit-criteria (G03 punch anomaly review) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "anomaly reviews consumed (punch_anomaly_reviews)::punch_anomaly_reviews|punchAnomaly" \
  "impossible-travel detector::impossible.?travel|impossibleTravel|IMPOSSIBLE_TRAVEL" \
  "review lifecycle (FLAGGED)::FLAGGED|CONFIRMED_FRAUD|review" \
  "self-review block::self|SoD|FORBIDDEN"
do must "$spec" $S; done
for spec in \
  "anomaly review exercised (punch_anomaly_reviews)::punch_anomaly_reviews|punchAnomaly|FLAGGED" \
  "NEGATIVE: self-review blocked::FORBIDDEN|self"
do must "$spec" "$T"/ph25c-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-25C met' || echo 'RED - PH-25C not complete') =="; exit "$fail"
