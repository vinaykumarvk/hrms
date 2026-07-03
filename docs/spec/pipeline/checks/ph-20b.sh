#!/usr/bin/env bash
# PH-20B oracle: G13 FR-011 watermarking + certified true copies — certified_copies with a watermark
# stamp + issuing authority; only an ACTIVE source document may be certified.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g13 apps/api/src/routes/g13.routes.ts"; T=apps/api/test
echo "== PH-20B exit-criteria (G13 watermark + certified copies) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "certified copies consumed (certified_copies)::certified_copies|certifiedCop" \
  "watermark stamp::watermark|Watermark" \
  "issuing authority recorded::issuing|issuedBy|issued_by|certifiedBy" \
  "source-status guard::ACTIVE|NOT_ACTIVE|PRECONDITION_FAILED"
do must "$spec" $S; done
for spec in \
  "certified copy exercised (certified_copies)::certified_copies|certifiedCop|watermark" \
  "NEGATIVE: non-active source rejected::PRECONDITION_FAILED|NOT_ACTIVE"
do must "$spec" "$T"/ph20b-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-20B met' || echo 'RED - PH-20B not complete') =="; exit "$fail"
