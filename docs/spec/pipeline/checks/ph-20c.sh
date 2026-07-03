#!/usr/bin/env bash
# PH-20C oracle: G02 FR-014 change-request templates — change_request_templates CRUD, start-from-
# template pre-fill (P02 field filter), deactivation.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g02 apps/api/src/routes/g02.routes.ts"; T=apps/api/test
echo "== PH-20C exit-criteria (G02 change-request templates) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "templates entity consumed (change_request_templates)::change_request_templates|changeRequestTemplate" \
  "start-from-template pre-fill::startFromTemplate|start_from_template|prefill|preFill|fromTemplate" \
  "template deactivation::deactivat|INACTIVE|RETIRED" \
  "field filter::field|allowedFields|fieldCode"
do must "$spec" $S; done
for spec in \
  "template lifecycle exercised (change_request_templates)::change_request_templates|changeRequestTemplate|fromTemplate" \
  "NEGATIVE: inactive-template use rejected::PRECONDITION_FAILED|INACTIVE|RETIRED|NOT_FOUND"
do must "$spec" "$T"/ph20c-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-20C met' || echo 'RED - PH-20C not complete') =="; exit "$fail"
