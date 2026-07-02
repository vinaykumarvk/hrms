#!/usr/bin/env bash
# PH-04B oracle: P01 workflow and G01 employee route groups.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-04B exit-criteria (P01/G01 routes) =="

bash docs/spec/pipeline/checks/ph-04a.sh && grn "PH-04A regression passed" || red "PH-04A regression failed"

need_file docs/spec/pipeline/prompts/PH-04B.md 1000
need_file apps/api/src/routes/p01-workflow.routes.ts 1000
need_file apps/api/src/routes/g01.routes.ts 1000
need_file apps/api/test/ph04-p01-g01-routes.test.cjs 1000

p01="$(cat apps/api/src/routes/p01-workflow.routes.ts 2>/dev/null || true)"
g01="$(cat apps/api/src/routes/g01.routes.ts 2>/dev/null || true)"

for path in \
  "/api/v1/workflow/instances" \
  "/api/v1/workflow/tasks" \
  "approve" "reject" "send-back" "delegate" "cancel" "query" "advance"; do
  echo "$p01" | grep -q "$path" && grn "P01 route marker: $path" || red "missing P01 route marker: $path"
done
for path in \
  "/api/v1/employees" \
  "profile-360" \
  "governed-changes" \
  "changes"; do
  echo "$g01" | grep -q "$path" && grn "G01 route marker: $path" || red "missing G01 route marker: $path"
done

for file in apps/api/src/routes/p01-workflow.routes.ts apps/api/src/routes/g01.routes.ts; do
  grep -qiE "permission|Authorization\\.check|authorization\\.check|authz\\.check" "$file" && grn "auth hook: $file" || red "missing auth hook: $file"
  grep -q "X-Correlation-Id" "$file" && grn "correlation metadata: $file" || red "missing correlation metadata: $file"
done
echo "$p01$g01" | grep -q "Idempotency-Key" && grn "unsafe route idempotency metadata present" || red "Idempotency-Key metadata missing"
echo "$g01" | grep -qiE "limit|cursor|next_cursor" && echo "$g01" | grep -q "100" && grn "G01 pagination metadata present" || red "G01 pagination metadata missing"
echo "$g01" | grep -qiE "mask|fieldGrants|field.*access|P02" && grn "G01 masking/P02 evidence present" || red "G01 masking evidence missing"
echo "$g01" | grep -qiE "serviceRegister|srEvent|G12|sr\\.ingest" && grn "G01 governed-change SR posting evidence present" || red "G01->G12 posting evidence missing"

python3 - <<'PY' && grn "P01/G01 OpenAPI contracts parse" || red "P01/G01 OpenAPI parse failed"
import yaml
for path in ["docs/contracts/openapi/P01-workflow.yaml", "docs/contracts/openapi/G01.yaml"]:
    yaml.safe_load(open(path))
PY

python3 - <<'PY' && grn "pipeline manifest wires PH-04B after PH-04A" || red "PH-04B missing from pipeline"
import yaml, sys
phase = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}.get("PH-04B")
sys.exit(0 if phase and phase.get("gate") == "auto" and phase.get("depends_on") == ["PH-04A"] else 1)
PY

if rg -n "\\bany\\b|as any|console\\.log" apps/api/src/routes/p01-workflow.routes.ts apps/api/src/routes/g01.routes.ts apps/api/test/ph04-p01-g01-routes.test.cjs >/tmp/ph04b-hygiene.log 2>&1; then
  red "TypeScript hygiene failed in PH-04B files"
  sed -n '1,80p' /tmp/ph04b-hygiene.log
else
  grn "PH-04B hygiene scan clean"
fi

if npm run check; then grn "npm run check passed"; else red "npm run check failed"; fi

python3 - <<'PY' && grn "manifest records PH-04B" || red "manifest missing PH-04B"
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-04B")
sys.exit(0 if isinstance(phase, dict) and {"status", "artifacts", "tests"}.issubset(phase) else 1)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-04B met' || echo 'RED - PH-04B not complete') =="
exit "$fail"
