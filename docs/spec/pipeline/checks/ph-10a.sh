#!/usr/bin/env bash
# PH-10A oracle: G12/G13 integrity substrate — REAL SHA-256 (runtime known-vector probe), no
# pseudoHash64 left in g12/g13, server-stamped recorded_at, hash-chained sr_status_events, G13
# append-only version rows + checkout locks. Behavior + executed negative tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S12=apps/api/src/modules/g12
S13=apps/api/src/modules/g13
T=apps/api/test

echo "== PH-10A exit-criteria (analytics/release wave integrity substrate) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) fail-closed absence assertion: the toy hash must be gone from the ledger modules
if grep -rq "pseudoHash64" "$S12" "$S13" 2>/dev/null; then
  red "pseudoHash64 still used in g12/g13 — real SHA-256 not adopted"
else grn "pseudoHash64 eliminated from g12/g13"; fi

# 2) substrate behavior in module source
for spec in \
  "real crypto hashing in g12 (createHash)::createHash|sha256Hex" \
  "sha256 algorithm named::sha256" \
  "trusted-time recorded_at stamped::recorded_at|recordedAt" \
  "hash-chained status sub-ledger (sr_status_events)::sr_status_events|srStatusEvents"
do must "$spec" "$S12"; done
for spec in \
  "append-only version rows (document_versions)::document_versions|DocumentVersion" \
  "checkout locks (checkout_locks)::checkout_locks|checkoutLock" \
  "locked check-in rejected (ERR-G13-DOCUMENT_LOCKED)::ERR-G13-DOCUMENT_LOCKED"
do must "$spec" "$S13"; done

# 3) suites — RED on any failure (build produces dist for the runtime probe below)
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
  # runtime known-vector probe: sha256Hex must be the real thing, executed, not grepped
  if node -e 'const m=require("./dist/apps/api/src");process.exit(typeof m.sha256Hex==="function"&&m.sha256Hex("abc")==="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"?0:1)' >/dev/null 2>&1; then
    grn "runtime probe: sha256Hex(\"abc\") matches the SHA-256 known vector"
  else
    red "runtime probe failed: sha256Hex not exported from dist or wrong digest for known vector"
  fi
fi

# 4) executed oracle tests
for spec in \
  "SHA-256 known-vector asserted in suite::ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" \
  "status sub-ledger chaining exercised::sr_status_events|statusEvents" \
  "NEGATIVE: locked check-in asserted (ERR-G13-DOCUMENT_LOCKED)::ERR-G13-DOCUMENT_LOCKED" \
  "NEGATIVE: version-row append-only mutation rejection asserted::append.?only|appendOnly|immutab"
do must "$spec" "$T"; done

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-10A met' || echo 'RED - PH-10A not complete') =="
exit "$fail"
