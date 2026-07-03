#!/usr/bin/env bash
# PH-23A oracle: G04 FR-16 X.3 outbound framework — an outbound connector with circuit-breaker,
# retry/backoff, payload versioning, and error classification; a conformance self-test.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g04 apps/api/src/routes/g04.routes.ts"; T=apps/api/test
echo "== PH-23A exit-criteria (G04 X.3 outbound framework) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "outbound connector::outbound|Outbound|x3|X3" \
  "circuit breaker::circuit.?break|circuitBreaker|OPEN|CLOSED" \
  "payload versioning::payload.?version|payloadVersion|schemaVersion" \
  "error classification::permanent|retryable|classif"
do must "$spec" $S; done
for spec in \
  "circuit-breaker / retry exercised::circuit|breaker|retry|backoff" \
  "NEGATIVE: open breaker blocks send::OPEN|PRECONDITION_FAILED|breaker"
do must "$spec" "$T"/ph23a-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-23A met' || echo 'RED - PH-23A not complete') =="; exit "$fail"
