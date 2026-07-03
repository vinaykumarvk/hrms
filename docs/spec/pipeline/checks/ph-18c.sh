#!/usr/bin/env bash
# PH-18C oracle: G05 FR-021 joining-sequence + inter-se seniority — deterministic sequence assignment
# on joining with a stable tie-break, feeding a seniority order consumable by G06.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g05 apps/api/src/routes/g05.routes.ts"; T=apps/api/test
echo "== PH-18C exit-criteria (G05 joining-sequence + inter-se seniority) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "joining sequence consumed (joining_sequence)::joining_sequence|joiningSequence" \
  "inter-se seniority::inter.?se|interSe|seniority.?sequence|senioritySequence" \
  "sequence number assigned (sequence_no)::sequence_no|sequenceNo" \
  "deterministic tie-break::tie.?break|tieBreak" \
  "duplicate-sequence guard::SEQUENCE_CONFLICT|DUPLICATE_SEQUENCE|already"
do must "$spec" $S; done
for spec in \
  "deterministic sequence exercised (joining_sequence)::joining_sequence|joiningSequence|senioritySequence" \
  "NEGATIVE: duplicate/late guard asserted::SEQUENCE_CONFLICT|DUPLICATE_SEQUENCE|PRECONDITION_FAILED|already"
do must "$spec" "$T"/ph18c-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-18C met' || echo 'RED - PH-18C not complete') =="; exit "$fail"
