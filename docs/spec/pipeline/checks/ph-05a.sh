#!/usr/bin/env bash
# PH-05A oracle: web scaffold and typed API client foundation.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }
has_ts(){ [ -d "$1" ] && find "$1" \( -name '*.ts' -o -name '*.tsx' \) -print -quit 2>/dev/null | grep -q .; }

echo "== PH-05A exit-criteria (web scaffold + API client) =="

if [ "$(cat docs/spec/pipeline/.state/PH-04D.status 2>/dev/null || echo pending)" = "done" ]; then
  grn "PH-04D approved/done before PH-05A"
else
  red "PH-04D is not approved/done; do not start PH-05A"
fi

need_file docs/spec/ph-05-ui-implementation-plan.md 2000
need_file docs/spec/pipeline/prompts/PH-05A.md 1000

has_ts apps/web/src && grn "apps/web/src present" || red "missing web source tree"
need_file apps/web/src/main.tsx 300
need_file apps/web/src/App.tsx 500
need_file apps/web/src/api/hrmsClient.ts 1000
need_file apps/web/src/api/fixtureHrmsClient.ts 1000
need_file apps/web/test/ph05-api-client.test.cjs 1000

grep -q '"web:check"' package.json && grn "root web:check script present" || red "missing root web:check script"
grep -q '"web:build"' package.json && grn "root web:build script present" || red "missing root web:build script"
grep -q '"web:test"' package.json && grn "root web:test script present" || red "missing root web:test script"

client="$(cat apps/web/src/api/hrmsClient.ts apps/web/src/api/fixtureHrmsClient.ts 2>/dev/null || true)"
for marker in "/api/v1/workflow/tasks" "/api/v1/employees" "/api/v1/sr/ingest" "/api/v1/documents" "X-Correlation-Id" "Idempotency-Key"; do
  echo "$client" | grep -q "$marker" && grn "API client marker: $marker" || red "missing API client marker: $marker"
done
echo "$client" | grep -qi "fixture" && grn "fixture adapter marker present" || red "fixture adapter marker missing"

python3 - <<'PY' && grn "pipeline manifest wires PH-05A after PH-04D" || red "PH-05A missing from pipeline"
import yaml, sys
phase = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}.get("PH-05A")
sys.exit(0 if phase and phase.get("gate") == "auto" and phase.get("depends_on") == ["PH-04D"] else 1)
PY

if [ -d apps/web ] && rg -n "\\bany\\b|as any|console\\.log|localhost" apps/web >/tmp/ph05a-hygiene.log 2>&1; then
  red "PH-05A hygiene failed"
  sed -n '1,80p' /tmp/ph05a-hygiene.log
else
  grn "PH-05A hygiene scan clean"
fi

if npm run web:check; then grn "npm run web:check passed"; else red "npm run web:check failed"; fi

python3 - <<'PY' && grn "manifest records PH-05A" || red "manifest missing PH-05A"
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-05A")
sys.exit(0 if isinstance(phase, dict) and {"status", "artifacts", "tests"}.issubset(phase) else 1)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-05A met' || echo 'RED - PH-05A not complete') =="
exit "$fail"
