#!/usr/bin/env bash
# PH-24B oracle: G06 FR-018 correction lineage + recompute cascade — correction_events with an
# UNDER_CORRECTION marker and a re-rank/re-snapshot cascade over affected seniority.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g06 apps/api/src/routes/g06.routes.ts"; T=apps/api/test
echo "== PH-24B exit-criteria (G06 correction cascade) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "correction events consumed (correction_events)::correction_events|correctionEvent" \
  "under-correction marker::UNDER_CORRECTION|underCorrection" \
  "re-rank / recompute cascade::re.?rank|reRank|recompute|cascade" \
  "affected set recomputed::affected|cascade|recompute"
do must "$spec" $S; done
for spec in \
  "correction cascade exercised (correction_events)::correction_events|correctionEvent|cascade" \
  "NEGATIVE: correction on non-final guard::PRECONDITION_FAILED|NOT_FINAL|SENIORITY_LIST_NOT_FINAL|final"
do must "$spec" "$T"/ph24b-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-24B met' || echo 'RED - PH-24B not complete') =="; exit "$fail"
