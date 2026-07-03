#!/usr/bin/env bash
# PH-21C oracle: G09 FR-026 jurisdiction transfer + retiree Rule-9 bar — case jurisdiction re-resolution
# and a retiree four-year bar (a proceeding against a retiree beyond 4 years is barred unless sanctioned).
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g09 apps/api/src/routes/g09.routes.ts"; T=apps/api/test
echo "== PH-21C exit-criteria (G09 jurisdiction transfer + retiree Rule-9) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "jurisdiction transfer::jurisdiction|reassignJurisdiction|transferJurisdiction" \
  "retiree Rule-9 bar::retiree|RETIREE|rule.?9|fourYear|four_year|4.?year" \
  "bar error code (ERR-G09-RETIREE-PROCEEDING-BARRED)::ERR-G09-RETIREE-PROCEEDING-BARRED|RETIREE.*BARRED" \
  "sanction override::sanction"
do must "$spec" $S; done
for spec in \
  "NEGATIVE: retiree four-year bar asserted::ERR-G09-RETIREE-PROCEEDING-BARRED|RETIREE.*BARRED" \
  "jurisdiction transfer exercised::jurisdiction"
do must "$spec" "$T"/ph21c-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-21C met' || echo 'RED - PH-21C not complete') =="; exit "$fail"
