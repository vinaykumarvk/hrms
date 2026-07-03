#!/usr/bin/env bash
# PH-18B oracle: G03 FR-07/FR-08 attendance exceptions — attendance_exceptions (WFH, ON_DUTY/TOUR),
# EXCEPTION_OVERLAP, WFH_CAP_EXCEEDED, DOCUMENT_REQUIRED (order-doc for tour).
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g03 apps/api/src/routes/g03.routes.ts"; T=apps/api/test
echo "== PH-18B exit-criteria (G03 WFH / on-duty attendance exceptions) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "exceptions entity consumed (attendance_exceptions)::attendance_exceptions" \
  "WFH exception type::WFH" \
  "on-duty / tour type::ON_DUTY|TOUR" \
  "overlap guard (EXCEPTION_OVERLAP)::EXCEPTION_OVERLAP" \
  "WFH cap guard (WFH_CAP_EXCEEDED)::WFH_CAP_EXCEEDED" \
  "tour document guard (DOCUMENT_REQUIRED)::DOCUMENT_REQUIRED"
do must "$spec" $S; done
for spec in \
  "NEGATIVE: overlap rejected (EXCEPTION_OVERLAP)::EXCEPTION_OVERLAP" \
  "NEGATIVE: WFH cap rejected (WFH_CAP_EXCEEDED)::WFH_CAP_EXCEEDED" \
  "attendance exception lifecycle exercised (attendance_exceptions)::attendance_exceptions"
do must "$spec" "$T"/ph18b-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-18B met' || echo 'RED - PH-18B not complete') =="; exit "$fail"
