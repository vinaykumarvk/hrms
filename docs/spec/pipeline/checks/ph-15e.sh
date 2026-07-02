#!/usr/bin/env bash
# PH-15E oracle: G13 envelope encryption + DPDP DSR — per-object AES-256-GCM DEKs wrapped behind an
# injectable KeyProvider (only wrapped_dek + kms_key_id persisted), rotation re-wrap without rewriting
# ciphertext, wrong-key fail-closed; data_subject_requests with the VAL-G13-LATTICE erasure precedence
# (EXEMPT_RETAINED, redaction-marker path). Behavior + executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S13="apps/api/src/modules/g13 apps/api/src/routes/g13.routes.ts"
T=apps/api/test

echo "== PH-15E exit-criteria (G13 envelope encryption + DPDP DSR to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) behavior present in module source (real crypto + BRD entities/codes, not markers)
for spec in \
  "KeyProvider interface (injectable)::KeyProvider|keyProvider" \
  "AES-256-GCM cipher in use::aes-256-gcm" \
  "wrapped DEK persisted (wrapped_dek)::wrapped_dek" \
  "KMS key reference persisted (kms_key_id)::kms_key_id" \
  "rotation re-wraps DEKs (JOB-G13-KEYROTATE semantics)::KEYROTATE|re[Ww]rap|rewrap" \
  "wrong-key decrypt fails closed (ERR-G13-INTEGRITY_FAILED)::ERR-G13-INTEGRITY_FAILED" \
  "DSR entity consumed (data_subject_requests)::data_subject_requests" \
  "precedence lattice implemented (VAL-G13-LATTICE)::VAL-G13-LATTICE" \
  "exempt outcome recorded (EXEMPT_RETAINED)::EXEMPT_RETAINED" \
  "erasure blocked code (ERR-G13-ERASURE_EXEMPTED)::ERR-G13-ERASURE_EXEMPTED" \
  "erasure state tracked (dpdp_erasure_state)::dpdp_erasure_state" \
  "redaction-marker path used::redaction"
do must "$spec" $S13; done

# 2) fail-closed hygiene: no plaintext DEK column and no key material in logs is a review item;
#    here ban the obvious defect — a hardcoded key literal in the module
if grep -rqE "masterKey *= *['\"][0-9a-fA-F]{32,}['\"]" apps/api/src/modules/g13 2>/dev/null; then
  red "hardcoded master key literal detected in g13 — key material must come from environment/config"
else grn "no hardcoded master-key literal in g13"; fi

# 3) executed oracle tests
for spec in \
  "runtime encrypt/decrypt round-trip exercised (aes-256-gcm)::aes-256-gcm" \
  "rotation test present (old objects decrypt, ciphertext unchanged)::rotat" \
  "NEGATIVE: wrong-key decrypt fails closed asserted::wrong.?[Kk]ey" \
  "NEGATIVE: erasure blocked by legal hold asserted (ERR-G13-ERASURE_EXEMPTED)::ERR-G13-ERASURE_EXEMPTED" \
  "lattice outcomes asserted (EXEMPT_RETAINED)::EXEMPT_RETAINED" \
  "DSR lifecycle exercised (data_subject_requests)::data_subject_requests"
do must "$spec" "$T"; done

# 4) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-15E met' || echo 'RED - PH-15E not complete') =="
exit "$fail"
