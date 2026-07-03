#!/usr/bin/env bash
# PH-24C oracle: G12 FR-11 offline-QR verification — a verification bundle (QR payload) binding the
# entry hash + anchor ref; offline verify recomputes and detects tampering without the live ledger.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g12 apps/api/src/routes/g12.routes.ts"; T=apps/api/test
echo "== PH-24C exit-criteria (G12 offline-QR verification) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "QR verification bundle::qr|QR|verificationBundle|verification_bundle" \
  "offline verify::offline|verifyBundle|verifyOffline" \
  "binds entry hash + anchor::entryHash|entry_hash|anchor" \
  "SHA-256 signature::sha256|createHash..sha256.|signature"
do must "$spec" $S; done
for spec in \
  "offline verify exercised::verifyBundle|verifyOffline|offline|QR" \
  "NEGATIVE: tampered bundle fails verify::tamper|false|INVALID|mismatch"
do must "$spec" "$T"/ph24c-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-24C met' || echo 'RED - PH-24C not complete') =="; exit "$fail"
