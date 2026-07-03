#!/usr/bin/env bash
# PH-19C oracle: G06 FR-014 career-path & succession — career_paths + stages, succession_plans +
# candidates, ordered stages, duplicate-candidate guard.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g06 apps/api/src/routes/g06.routes.ts"; T=apps/api/test
echo "== PH-19C exit-criteria (G06 career-path + succession) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "career paths consumed (career_paths)::career_paths|careerPaths" \
  "career stages consumed (career_path_stages)::career_path_stages|careerPathStages|stages" \
  "succession plans consumed (succession_plans)::succession_plans|successionPlans" \
  "succession candidates consumed (succession_candidates)::succession_candidates|successionCandidates|candidates" \
  "duplicate-candidate guard::DUPLICATE|already|PRECONDITION_FAILED"
do must "$spec" $S; done
for spec in \
  "career path + stages exercised::career_paths|careerPaths" \
  "NEGATIVE: duplicate candidate asserted::PRECONDITION_FAILED|DUPLICATE|already"
do must "$spec" "$T"/ph19c-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-19C met' || echo 'RED - PH-19C not complete') =="; exit "$fail"
