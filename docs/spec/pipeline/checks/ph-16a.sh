#!/usr/bin/env bash
# PH-16A oracle: G01 alias-based dedup/merge (dedup_candidates, employee_id_aliases, RECORDS_MERGED, windowed
# undo), PROVISIONAL bulk import (staging -> validate -> commit -> remediation queue -> promote-active), and
# profile lifecycle :separate/:reactivate/:archive with transition guards. Behavior + executed tests only.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S01="apps/api/src/modules/g01 apps/api/src/routes/g01.routes.ts"
T=apps/api/test

echo "== PH-16A exit-criteria (G01 dedup/alias-merge + bulk import + lifecycle to BRD depth) =="

[ -d node_modules ] || red "node_modules absent — toolchain oracle cannot run; refusing GREEN without it"

# 1) behavior present in module source (BRD entities + registered codes, not markers)
for spec in \
  "dedup candidate queue consumed (dedup_candidates)::dedup_candidates" \
  "alias table consumed (employee_id_aliases)::employee_id_aliases" \
  "merge snapshot persisted (merge_snapshot)::merge_snapshot" \
  "merge feed event emitted (RECORDS_MERGED)::RECORDS_MERGED" \
  "conflicting-state merge guard (MERGE_CONFLICT)::MERGE_CONFLICT" \
  "undo window guard (UNDO_EXPIRED)::UNDO_EXPIRED" \
  "4-eyes merge guard (SOD_VIOLATION)::SOD_VIOLATION" \
  "import batches consumed (employee_import_batches)::employee_import_batches" \
  "staging rows consumed (import_staging_rows)::import_staging_rows" \
  "PROVISIONAL record state applied::PROVISIONAL" \
  "remediation queue state (remediation_state / QUEUED)::remediation_state|QUEUED" \
  "import validation profiles applied (validation_profile)::validation_profile" \
  "promote-active re-validation::promote[-_]?[Aa]ctive|promoteActive" \
  "lifecycle separation flow (separation_reason)::separation_reason" \
  "reactivation supported::reactivat" \
  "archival supported (record_state ARCHIVED)::ARCHIVED" \
  "invalid transition guard (INVALID_STATE)::INVALID_STATE" \
  "archive-under-hold guard (LEGAL_HOLD_ACTIVE)::LEGAL_HOLD_ACTIVE"
do must "$spec" $S01; done

# 2) executed oracle tests. SOD_VIOLATION and LEGAL_HOLD_ACTIVE are shared platform codes already asserted
# by G13 tests, so those two negatives must live in this phase's own executed test file (ph16a-*.test.cjs,
# run by npm test) — a repo-wide grep would rubber-stamp them.
for spec in \
  "NEGATIVE: undo past window asserted (UNDO_EXPIRED)::UNDO_EXPIRED" \
  "NEGATIVE: conflicting-state merge asserted (MERGE_CONFLICT)::MERGE_CONFLICT" \
  "alias resolution asserted (loser resolves to survivor via employee_id_aliases)::employee_id_aliases" \
  "merge feed event asserted (RECORDS_MERGED)::RECORDS_MERGED" \
  "PROVISIONAL commit + promote-active exercised (import_staging_rows)::import_staging_rows" \
  "NEGATIVE: invalid lifecycle transition asserted (INVALID_STATE)::INVALID_STATE"
do must "$spec" "$T"; done
for spec in \
  "NEGATIVE: maker=checker merge asserted in ph16a tests (SOD_VIOLATION)::SOD_VIOLATION" \
  "NEGATIVE: archive under legal hold asserted in ph16a tests (LEGAL_HOLD_ACTIVE)::LEGAL_HOLD_ACTIVE"
do must "$spec" "$T"/ph16a-*.test.cjs; done

# 3) suites — RED on any failure
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-16A met' || echo 'RED - PH-16A not complete') =="
exit "$fail"
