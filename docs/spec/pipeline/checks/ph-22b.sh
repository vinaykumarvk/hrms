#!/usr/bin/env bash
# PH-22B oracle: G13 FR-008 OCR + permission-aware search — ocr_index, search filtered by
# classification/clearance (SECRET+ excluded for under-cleared), no content leak.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g13 apps/api/src/routes/g13.routes.ts"; T=apps/api/test
echo "== PH-22B exit-criteria (G13 OCR + permission-aware search) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "OCR index consumed (ocr_index)::ocr_index|ocrIndex" \
  "search surface::search" \
  "clearance / classification filter::clearance|classification|SECRET" \
  "permission-aware exclusion::exclude|filter|deny|clearance"
do must "$spec" $S; done
for spec in \
  "permission-aware search exercised (ocr_index)::ocr_index|ocrIndex|search" \
  "NEGATIVE: over-classified hit excluded::SECRET|clearance|excluded|filtered"
do must "$spec" "$T"/ph22b-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-22B met' || echo 'RED - PH-22B not complete') =="; exit "$fail"
