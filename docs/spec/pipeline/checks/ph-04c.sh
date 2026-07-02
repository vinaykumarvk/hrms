#!/usr/bin/env bash
# PH-04C oracle: G12 Service Register and G13 Document Vault route groups.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-04C exit-criteria (G12/G13 routes) =="

bash docs/spec/pipeline/checks/ph-04a.sh && grn "PH-04A regression passed" || red "PH-04A regression failed"

need_file docs/spec/pipeline/prompts/PH-04C.md 1000
need_file apps/api/src/routes/g12.routes.ts 1000
need_file apps/api/src/routes/g13.routes.ts 1000
need_file apps/api/test/ph04-g12-g13-routes.test.cjs 1000

g12="$(cat apps/api/src/routes/g12.routes.ts 2>/dev/null || true)"
g13="$(cat apps/api/src/routes/g13.routes.ts 2>/dev/null || true)"

for path in \
  "/api/v1/sr/ingest" \
  "ingest/reversal" \
  "timeline" \
  "corrigendum" \
  "dispute" \
  "resolve"; do
  echo "$g12" | grep -q "$path" && grn "G12 route marker: $path" || red "missing G12 route marker: $path"
done
for path in \
  "/api/v1/documents" \
  "documents:attach" \
  "versions" \
  "checkin" \
  "supersede" \
  "legal-holds" \
  "retention"; do
  echo "$g13" | grep -q "$path" && grn "G13 route marker: $path" || red "missing G13 route marker: $path"
done

for file in apps/api/src/routes/g12.routes.ts apps/api/src/routes/g13.routes.ts; do
  grep -qiE "permission|Authorization\\.check|authorization\\.check|authz\\.check" "$file" && grn "auth hook: $file" || red "missing auth hook: $file"
  grep -q "X-Correlation-Id" "$file" && grn "correlation metadata: $file" || red "missing correlation metadata: $file"
  grep -q "Idempotency-Key" "$file" && grn "idempotency metadata: $file" || red "missing idempotency metadata: $file"
done
echo "$g12" | grep -qiE "append|reversal|semantic|dedup|idempot" && grn "G12 append/idempotency evidence present" || red "G12 append/idempotency evidence missing"
if echo "$g12" | grep -qiE "\\b(update|delete)\\b.*service_register_events|service_register_events.*\\b(update|delete)\\b"; then
  red "G12 route appears to update/delete SR ledger"
else
  grn "G12 no direct update/delete marker"
fi
echo "$g13" | grep -qiE "legal.?hold|WORM|retention|fail.?closed|PRECONDITION" && grn "G13 legal-hold/retention evidence present" || red "G13 legal-hold/retention evidence missing"

python3 - <<'PY' && grn "G12/G13 OpenAPI contracts parse" || red "G12/G13 OpenAPI parse failed"
import yaml
for path in ["docs/contracts/openapi/G12.yaml", "docs/contracts/openapi/G13.yaml"]:
    yaml.safe_load(open(path))
PY

python3 - <<'PY' && grn "pipeline manifest wires PH-04C after PH-04B" || red "PH-04C missing from pipeline"
import yaml, sys
phase = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}.get("PH-04C")
sys.exit(0 if phase and phase.get("gate") == "auto" and phase.get("depends_on") == ["PH-04B"] else 1)
PY

if rg -n "\\bany\\b|as any|console\\.log" apps/api/src/routes/g12.routes.ts apps/api/src/routes/g13.routes.ts apps/api/test/ph04-g12-g13-routes.test.cjs >/tmp/ph04c-hygiene.log 2>&1; then
  red "TypeScript hygiene failed in PH-04C files"
  sed -n '1,80p' /tmp/ph04c-hygiene.log
else
  grn "PH-04C hygiene scan clean"
fi

if npm run check; then grn "npm run check passed"; else red "npm run check failed"; fi

python3 - <<'PY' && grn "manifest records PH-04C" || red "manifest missing PH-04C"
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-04C")
sys.exit(0 if isinstance(phase, dict) and {"status", "artifacts", "tests"}.issubset(phase) else 1)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-04C met' || echo 'RED - PH-04C not complete') =="
exit "$fail"
