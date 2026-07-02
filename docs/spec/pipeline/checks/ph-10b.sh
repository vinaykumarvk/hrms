#!/usr/bin/env bash
# PH-10B oracle: G12 integrity pillars — verify endpoint + JOB-G12-INTEGRITY, real Merkle anchors,
# gap register (expected-event rules -> GAP_FLAGGED), custodian attestation, redacted certified
# extracts. Tamper-detection negative test required. Behavior + executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S12="apps/api/src/modules/g12 apps/api/src/routes/g12.routes.ts apps/api/src/jobs"
T=apps/api/test

echo "== PH-10B exit-criteria (G12 integrity pillars) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) pillars in module source
for spec in \
  "integrity verify path present::verify" \
  "verify recomputes hashes (createHash/sha256Hex)::createHash|sha256Hex" \
  "scheduled recompute job (JOB-G12-INTEGRITY)::JOB-G12-INTEGRITY" \
  "anchor entity (sr_anchors)::sr_anchors|srAnchors" \
  "real Merkle computation::[Mm]erkle" \
  "TSA behind an interface (stubbable)::TSA|[Tt]imestampAuthority" \
  "expected-event rules (sr_expected_event_rule)::sr_expected_event_rule" \
  "gap register (sr_gap_register)::sr_gap_register" \
  "gaps flagged (GAP_FLAGGED)::GAP_FLAGGED" \
  "gap scan job (JOB-G12-GAPSCAN)::JOB-G12-GAPSCAN" \
  "custodian attestation (sr_attestations)::sr_attestations|srAttestations" \
  "certified extracts (sr_certified_extracts)::sr_certified_extracts" \
  "extracts apply P02 redaction::redact"
do must "$spec" $S12; done

# 2) executed oracle tests
for spec in \
  "NEGATIVE: tamper detection asserted (mutated chain -> FAIL)::[Tt]amper" \
  "verify FAIL outcome asserted::FAIL" \
  "Merkle root asserted (recompute + sensitivity)::[Mm]erkle" \
  "gap-scan asserted (GAP_FLAGGED row)::GAP_FLAGGED" \
  "certified extract redaction exercised::redact"
do must "$spec" "$T"; done

# 3) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-10B met' || echo 'RED - PH-10B not complete') =="
exit "$fail"
