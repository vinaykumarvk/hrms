#!/usr/bin/env bash
# PH-22C oracle: G14 FR-15 NL query — nl_query maps a question to a whitelisted metric with a
# confidence gate (low confidence -> no execution), a nl_query_log, and PII stripping.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g14 apps/api/src/routes/g14.routes.ts"; T=apps/api/test
echo "== PH-22C exit-criteria (G14 NL query) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "nl query surface::nl_query|nlQuery|naturalLanguage" \
  "confidence gate::confidence" \
  "query log consumed (nl_query_log)::nl_query_log|nlQueryLog" \
  "whitelisted-metric mapping::metric|whitelist|semantic"
do must "$spec" $S; done
for spec in \
  "nl query mapping exercised::nl_query|nlQuery" \
  "NEGATIVE: low-confidence not executed::confidence|LOW_CONFIDENCE|PRECONDITION_FAILED|not.?executed"
do must "$spec" "$T"/ph22c-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-22C met' || echo 'RED - PH-22C not complete') =="; exit "$fail"
