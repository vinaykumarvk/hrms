#!/usr/bin/env bash
# PH-21B oracle: G08 FR-11 multi-source 360 — feedback_360 with rater types (PEER/SUBORDINATE/
# CUSTOMER), a minimum-rater threshold for release, anonymity below threshold.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g08 apps/api/src/routes/g08.routes.ts"; T=apps/api/test
echo "== PH-21B exit-criteria (G08 multi-source 360) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "360 feedback consumed (feedback_360)::feedback_360|feedback360|three.?sixty" \
  "rater types (PEER/SUBORDINATE)::PEER|SUBORDINATE|rater" \
  "minimum-rater threshold::min.?rater|minRater|threshold|MIN_RATERS" \
  "below-threshold guard::INSUFFICIENT|threshold|MIN_RATERS"
do must "$spec" $S; done
for spec in \
  "360 aggregation exercised (feedback_360)::feedback_360|feedback360" \
  "NEGATIVE: below-min-raters release blocked::INSUFFICIENT|MIN_RATERS|PRECONDITION_FAILED"
do must "$spec" "$T"/ph21b-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-21B met' || echo 'RED - PH-21B not complete') =="; exit "$fail"
