#!/usr/bin/env bash
# PH-22A oracle: G08 FR-20 DSC / non-repudiation signing — digital_signatures (SHA-256 payload,
# method policy, signer identity), signing gate on certify/ratify actions.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g08 apps/api/src/routes/g08.routes.ts"; T=apps/api/test
echo "== PH-22A exit-criteria (G08 DSC / non-repudiation) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "signatures entity consumed (digital_signatures)::digital_signatures|digitalSignature" \
  "SHA-256 payload hash::createHash..sha256.|sha256Hex|payloadHash|payload_hash" \
  "method policy guard::method|DSC|ESIGN_METHOD|SIGMETHOD" \
  "signer identity / non-repudiation::signer|non.?repud|signedBy"
do must "$spec" $S; done
for spec in \
  "digital signature exercised (digital_signatures)::digital_signatures|digitalSignature|payloadHash" \
  "NEGATIVE: disallowed method / unsigned action rejected::VALIDATION_FAILED|PRECONDITION_FAILED|FORBIDDEN|METHOD"
do must "$spec" "$T"/ph22a-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-22A met' || echo 'RED - PH-22A not complete') =="; exit "$fail"
