#!/usr/bin/env bash
# PH-25A oracle: G10 FR-19 GL->ERP posting — gl_export_batches post to an ERP with idempotency
# (duplicate batch is a no-op) and an ACK reconciliation (POSTED->ACKNOWLEDGED, mismatch flagged).
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
must(){ local spec="$1"; shift; local label="${spec%%::*}"; local pat="${spec#*::}"
  if grep -rqE "$pat" "$@" 2>/dev/null; then grn "$label"; else red "missing: $label"; fi; }
S="apps/api/src/modules/g10 apps/api/src/routes/g10.routes.ts"; T=apps/api/test
echo "== PH-25A exit-criteria (G10 GL->ERP posting) =="
[ -d node_modules ] || red "node_modules absent"
for spec in \
  "export batch consumed (gl_export_batches)::gl_export_batches|glExportBatch" \
  "ERP posting::erp|ERP|posting" \
  "idempotent post::idempoten|duplicate|no.?op" \
  "ack reconciliation (ACKNOWLEDGED)::ACKNOWLEDGED|reconcil|mismatch"
do must "$spec" $S; done
for spec in \
  "GL->ERP export exercised (gl_export_batches)::gl_export_batches|glExportBatch|erp|ERP" \
  "NEGATIVE: duplicate post / ack mismatch guard::PRECONDITION_FAILED|duplicate|mismatch|no.?op"
do must "$spec" "$T"/ph25a-*.test.cjs; done
if [ -d node_modules ]; then
  npm run -s typecheck >/dev/null 2>&1 && grn "npm run typecheck green" || red "typecheck failed"
  npm test >/dev/null 2>&1 && grn "npm test green (build + executed api suite)" || red "npm test failed"
fi
echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-25A met' || echo 'RED - PH-25A not complete') =="; exit "$fail"
