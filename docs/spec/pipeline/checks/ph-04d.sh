#!/usr/bin/env bash
# PH-04D oracle: API conformance, smoke/security checks, and API-freeze verdict.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-04D exit-criteria (API conformance + freeze packet) =="

bash docs/spec/pipeline/checks/ph-04a.sh && grn "PH-04A regression passed" || red "PH-04A regression failed"
bash docs/spec/pipeline/checks/ph-04b.sh && grn "PH-04B regression passed" || red "PH-04B regression failed"
bash docs/spec/pipeline/checks/ph-04c.sh && grn "PH-04C regression passed" || red "PH-04C regression failed"

need_file docs/spec/pipeline/prompts/PH-04D.md 1000
need_file apps/api/test/ph04-contract-conformance.test.cjs 1500
need_file docs/spec/ph-04-verdict.md 1500

python3 - <<'PY' && grn "OpenAPI and error taxonomy parse" || red "contract parse failed"
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

python3 - <<'PY' && grn "pipeline manifest wires PH-04D as human gate after PH-04C" || red "PH-04D missing/human gate not configured"
import yaml, sys
phase = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}.get("PH-04D")
sys.exit(0 if phase and phase.get("gate") == "human" and phase.get("depends_on") == ["PH-04C"] else 1)
PY

routes="$(find apps/api/src/routes apps/api/src/http -name '*.ts' -print0 2>/dev/null | xargs -0 cat 2>/dev/null || true)"
for marker in \
  "/api/v1/workflow/instances" \
  "/api/v1/employees" \
  "/api/v1/sr/ingest" \
  "/api/v1/documents"; do
  echo "$routes" | grep -q "$marker" && grn "minimum route family present: $marker" || red "missing minimum route family: $marker"
done
for marker in "Authorization.check" "Idempotency-Key" "X-Correlation-Id" "next_cursor" "VALIDATION_FAILED" "FORBIDDEN" "INTERNAL"; do
  echo "$routes" | grep -q "$marker" && grn "conformance marker: $marker" || red "missing conformance marker: $marker"
done

if rg -n "\\.stack|stacktrace|console\\.log|\\bany\\b|as any" apps/api/src apps/api/test >/tmp/ph04d-hygiene.log 2>&1; then
  red "PH-04 hygiene failed"
  sed -n '1,100p' /tmp/ph04d-hygiene.log
else
  grn "PH-04 hygiene scan clean"
fi

if npm run check; then grn "npm run check passed"; else red "npm run check failed"; fi

python3 - <<'PY' && grn "manifest records PH-04D" || red "manifest missing PH-04D"
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-04D")
sys.exit(0 if isinstance(phase, dict) and {"status", "artifacts", "tests"}.issubset(phase) else 1)
PY

grep -qiE "contract delta|contract_delta|no contract" docs/spec/ph-04-verdict.md 2>/dev/null && grn "PH-04 verdict records contract delta status" || red "PH-04 verdict missing contract-delta status"
grep -qiE "auth|idempotenc|pagination|correlation|error envelope" docs/spec/ph-04-verdict.md 2>/dev/null && grn "PH-04 verdict maps cross-cutting evidence" || red "PH-04 verdict missing cross-cutting evidence"

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-04D met' || echo 'RED - PH-04D not complete') =="
exit "$fail"
