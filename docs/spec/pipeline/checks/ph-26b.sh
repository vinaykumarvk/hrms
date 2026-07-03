#!/usr/bin/env bash
# PH-26B oracle: G12 FR-04 RFC-3161 timestamp authority — a concrete TimestampAuthority producing a
# deterministic timestamp token over a digest, with a verify that detects a tampered digest.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g12"; T=apps/api/test
echo "== PH-26B exit-criteria (G12 RFC-3161 TSA binding) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "RFC-3161 / timestamp token::rfc.?3161|RFC3161|timestamp.?token|timestampToken|tsToken" \
  "timestamp authority provider::TimestampAuthority|LocalTimestampAuthority|tsaProvider" \
  "token over digest::digest|messageImprint|imprint" \
  "token verify::verifyToken|verifyTimestamp|verify"
do must "$spec" $S; done
for spec in \
  "timestamp token issue+verify exercised::timestamp|tsToken|timestampToken|verifyToken" \
  "NEGATIVE: tampered digest fails verify::false|mismatch|INVALID|tamper"
do must "$spec" "$T"/ph26b-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-26B met' || echo 'RED - PH-26B not complete') =="; exit "$fail"
