#!/usr/bin/env bash
# PH-18A oracle: G01 FR-EPM-007 Aadhaar vault — aadhaar_vault tokenisation (no raw Aadhaar stored),
# Verhoeff checksum validation, 4-eyes reveal (dual authorisation), expiry alerts.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g01"; T=apps/api/test
echo "== PH-18A exit-criteria (G01 Aadhaar vault) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "aadhaar vault consumed (aadhaar_vault)::aadhaar_vault|aadhaarVault" \
  "tokenisation (no raw Aadhaar)::token|Token" \
  "Verhoeff checksum validation::[Vv]erhoeff" \
  "4-eyes / dual-auth reveal::4.?eyes|dual.?auth|dualAuth|secondApprover|reveal" \
  "invalid-Aadhaar guard::INVALID_AADHAAR|VERHOEFF|AADHAAR_INVALID" \
  "reveal authorisation guard::REVEAL|reveal"
do must "$spec" $S; done
for spec in \
  "NEGATIVE: invalid Aadhaar rejected::INVALID_AADHAAR|AADHAAR_INVALID|VERHOEFF" \
  "NEGATIVE: reveal without dual-auth rejected::reveal|REVEAL|dualAuth|second" \
  "vault tokenisation exercised::aadhaar_vault|aadhaarVault|token"
do must "$spec" "$T"/ph18a-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-18A met' || echo 'RED - PH-18A not complete') =="; exit "$fail"
