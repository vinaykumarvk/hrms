#!/usr/bin/env bash
# PH-17B oracle: G02 FR-015 strong e-signature (ERR-G02-ESIGN gate, SHA-256 payload hash-chain,
# ERR-G02-ESIGN-METHOD policy) + FR-023 requester step-up (ERR-G02-STEPUP, cr_step_up_events).
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g02 apps/api/src/routes/g02.routes.ts"; T=apps/api/test
echo "== PH-17B exit-criteria (G02 e-signature + step-up) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "esignature entity consumed (esignatures)::esignatures|e_signatures" \
  "esign gate (ERR-G02-ESIGN)::ERR-G02-ESIGN" \
  "esign method policy (ERR-G02-ESIGN-METHOD)::ERR-G02-ESIGN-METHOD" \
  "payload SHA-256 hash-chain::createHash..sha256.|sha256Hex|payload_hash|payloadHash" \
  "step-up events consumed (cr_step_up_events)::cr_step_up_events|step_up|stepUp" \
  "step-up gate (ERR-G02-STEPUP)::ERR-G02-STEPUP"
do must "$spec" $S; done
for spec in \
  "NEGATIVE: apply/commit without e-sign asserted (ERR-G02-ESIGN)::ERR-G02-ESIGN" \
  "NEGATIVE: step-up required asserted (ERR-G02-STEPUP)::ERR-G02-STEPUP" \
  "hash-chain integrity exercised (esignatures)::esignatures|payloadHash"
do must "$spec" "$T"/ph17b-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-17B met' || echo 'RED - PH-17B not complete') =="; exit "$fail"
