#!/usr/bin/env bash
# PH-04A oracle: API kernel and contract harness.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }
has_ts(){ [ -d "$1" ] && find "$1" -name '*.ts' -print -quit 2>/dev/null | grep -q .; }

echo "== PH-04A exit-criteria (API kernel) =="

need_file docs/spec/ph-04-api-contract-implementation-plan.md 2000
need_file docs/spec/pipeline/prompts/PH-04A.md 1000

has_ts apps/api/src/http && grn "apps/api/src/http present" || red "missing API kernel: apps/api/src/http"
has_ts apps/api/src/openapi && grn "apps/api/src/openapi present" || red "missing OpenAPI registry: apps/api/src/openapi"
need_file apps/api/test/ph04-api-kernel.test.cjs 1000

kernel="$(find apps/api/src/http apps/api/src/openapi -name '*.ts' -print0 2>/dev/null | xargs -0 cat 2>/dev/null || true)"
echo "$kernel" | grep -q "/api/v1" && grn "base path /api/v1 present" || red "base path /api/v1 missing"
echo "$kernel" | grep -qiE "protected|public|isPublic|requiresAuth|permission" && grn "explicit route protection metadata present" || red "route protection metadata missing"
echo "$kernel" | grep -qiE "Authorization\\.check|authorization\\.check|authz\\.check|permission" && grn "P02 authorization hook present" || red "P02 authorization hook missing"
echo "$kernel" | grep -q "X-Correlation-Id" && grn "correlation-id handling present" || red "X-Correlation-Id handling missing"
echo "$kernel" | grep -q "Idempotency-Key" && grn "idempotency-key handling present" || red "Idempotency-Key handling missing"
echo "$kernel" | grep -qiE "limit|cursor|next_cursor" && echo "$kernel" | grep -q "100" && grn "cursor pagination bound present" || red "cursor pagination bound missing"
for code in VALIDATION_FAILED UNAUTHENTICATED FORBIDDEN NOT_FOUND CONFLICT PRECONDITION_FAILED RATE_LIMITED INTERNAL; do
  echo "$kernel" | grep -q "$code" && grn "error code $code" || red "missing canonical error code: $code"
done

python3 - <<'PY' && grn "P01/G01/G12/G13 OpenAPI contracts parse" || red "OpenAPI parse failed"
import yaml
for path in [
    "docs/contracts/openapi/P01-workflow.yaml",
    "docs/contracts/openapi/G01.yaml",
    "docs/contracts/openapi/G12.yaml",
    "docs/contracts/openapi/G13.yaml",
    "docs/contracts/error-taxonomy.yaml",
]:
    yaml.safe_load(open(path))
PY

python3 - <<'PY' && grn "pipeline manifest wires PH-04A after PH-03C" || red "PH-04A missing from pipeline"
import yaml, sys
phase = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}.get("PH-04A")
if not phase or phase.get("gate") != "auto" or phase.get("depends_on") != ["PH-03C"]:
    sys.exit(1)
if phase.get("exit_criteria") != "bash docs/spec/pipeline/checks/ph-04a.sh":
    sys.exit(1)
PY

if rg -n "\\bany\\b|as any|console\\.log" apps/api/src/http apps/api/src/openapi apps/api/test/ph04-api-kernel.test.cjs >/tmp/ph04a-hygiene.log 2>&1; then
  red "TypeScript hygiene failed in PH-04A files"
  sed -n '1,80p' /tmp/ph04a-hygiene.log
else
  grn "PH-04A hygiene scan clean"
fi

if npm run check; then
  grn "npm run check passed"
else
  red "npm run check failed"
fi

python3 - <<'PY' && grn "manifest records PH-04A" || red "manifest missing PH-04A"
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-04A")
sys.exit(0 if isinstance(phase, dict) and {"status", "artifacts", "tests"}.issubset(phase) else 1)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-04A met' || echo 'RED - PH-04A not complete') =="
exit "$fail"
