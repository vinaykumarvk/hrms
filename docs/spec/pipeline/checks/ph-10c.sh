#!/usr/bin/env bash
# PH-10C oracle: G13 security hardening — SHA-256 of bytes verified on fetch, DI-11 scan gate
# (PENDING_SCAN -> CLEAN -> ACTIVE, INFECTED -> QUARANTINED), deny-by-default clearances, fetch
# intent access audit, disposition maker!=checker SoD. Three fail-closed negative tests required.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S13="apps/api/src/modules/g13 apps/api/src/routes/g13.routes.ts"
T=apps/api/test

echo "== PH-10C exit-criteria (G13 vault hardening) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) hardening behavior in module source
for spec in \
  "server-side SHA-256 of bytes::createHash|sha256Hex" \
  "fetch verifies content hash (ERR-G13-INTEGRITY_FAILED)::ERR-G13-INTEGRITY_FAILED" \
  "scan gate entry state (PENDING_SCAN)::PENDING_SCAN" \
  "quarantine state (QUARANTINED)::QUARANTINED" \
  "clean promotion (CLEAN)::CLEAN" \
  "infected handling (INFECTED/ERR-G13-MALWARE_DETECTED)::INFECTED|ERR-G13-MALWARE_DETECTED" \
  "scan provider interface (DI-11, injectable)::ScanProvider|scanProvider" \
  "clearance store (security_clearances)::security_clearances|securityClearance" \
  "deny-by-default clearance gate (ERR-G13-CLEARANCE_INSUFFICIENT)::ERR-G13-CLEARANCE_INSUFFICIENT" \
  "fetch requires intent (ERR-G13-FETCH_INTENT_REQUIRED)::ERR-G13-FETCH_INTENT_REQUIRED" \
  "access audit intents VIEW/DOWNLOAD::DOWNLOAD" \
  "retention classes present::retention" \
  "disposition SoD maker!=checker (ERR-G13-SOD_VIOLATION)::ERR-G13-SOD_VIOLATION"
do must "$spec" $S13; done

# 2) executed oracle tests — the three required fail-closed negatives + SoD
for spec in \
  "NEGATIVE: hash mismatch on fetch asserted (ERR-G13-INTEGRITY_FAILED)::ERR-G13-INTEGRITY_FAILED" \
  "NEGATIVE: INFECTED -> QUARANTINED asserted::QUARANTINED" \
  "fake scan provider used in tests::ScanProvider|scanProvider|fakeScan" \
  "NEGATIVE: no-clearance access denied asserted (ERR-G13-CLEARANCE_INSUFFICIENT)::ERR-G13-CLEARANCE_INSUFFICIENT" \
  "NEGATIVE: maker==checker disposition rejected (ERR-G13-SOD_VIOLATION)::ERR-G13-SOD_VIOLATION" \
  "fetch intent audit exercised::intent"
do must "$spec" "$T"; done

# 3) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-10C met' || echo 'RED - PH-10C not complete') =="
exit "$fail"
