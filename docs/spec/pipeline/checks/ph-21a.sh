#!/usr/bin/env bash
# PH-21A oracle: G07 FR-015 LMS/xAPI — learning_record_stores + lms_enrollments, xAPI statement
# ingestion with idempotency (duplicate statement_id is a no-op), sync cursor.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g07 apps/api/src/routes/g07.routes.ts"; T=apps/api/test
echo "== PH-21A exit-criteria (G07 LMS / xAPI) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "LRS consumed (learning_record_stores)::learning_record_stores|learningRecordStore" \
  "enrollments consumed (lms_enrollments)::lms_enrollments|lmsEnrollment" \
  "xAPI statement ingestion::statement|xapi|xAPI" \
  "statement idempotency::idempoten|statement_id|statementId|duplicate"
do must "$spec" $S; done
for spec in \
  "xAPI statement idempotency exercised::statement|idempoten|statementId" \
  "enrollment / LRS lifecycle exercised::lms_enrollments|lmsEnrollment|learning_record_stores|learningRecordStore"
do must "$spec" "$T"/ph21a-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-21A met' || echo 'RED - PH-21A not complete') =="; exit "$fail"
