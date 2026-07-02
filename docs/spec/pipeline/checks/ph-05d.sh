#!/usr/bin/env bash
# PH-05D oracle: G01/G12/G13 foundation views.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-05D exit-criteria (foundation record views) =="

bash docs/spec/pipeline/checks/ph-05c.sh && grn "PH-05C regression passed" || red "PH-05C regression failed"

need_file docs/spec/pipeline/prompts/PH-05D.md 1000
need_file apps/web/src/modules/g01/EmployeeProfile.tsx 1000
need_file apps/web/src/modules/g12/ServiceRegisterTimeline.tsx 1000
need_file apps/web/src/modules/g13/DocumentVaultView.tsx 1000
need_file apps/web/test/ph05-records.test.cjs 1000

records="$(cat apps/web/src/modules/g01/EmployeeProfile.tsx apps/web/src/modules/g12/ServiceRegisterTimeline.tsx apps/web/src/modules/g13/DocumentVaultView.tsx 2>/dev/null || true)"
for marker in "profile-360" "masked" "PII" "fieldGrants" "append-only" "hash" "sequence" "provenance" "legal hold" "retention" "fail-closed"; do
  echo "$records" | grep -qi "$marker" && grn "record-view marker: $marker" || red "missing record-view marker: $marker"
done

python3 - <<'PY' && grn "pipeline manifest wires PH-05D after PH-05C" || red "PH-05D missing from pipeline"
import yaml, sys
phase = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}.get("PH-05D")
sys.exit(0 if phase and phase.get("gate") == "auto" and phase.get("depends_on") == ["PH-05C"] else 1)
PY

if rg -n "\\bany\\b|as any|console\\.log|localhost" apps/web >/tmp/ph05d-hygiene.log 2>&1; then
  red "PH-05D hygiene failed"
  sed -n '1,80p' /tmp/ph05d-hygiene.log
else
  grn "PH-05D hygiene scan clean"
fi

if npm run web:check; then grn "npm run web:check passed"; else red "npm run web:check failed"; fi

python3 - <<'PY' && grn "manifest records PH-05D" || red "manifest missing PH-05D"
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-05D")
sys.exit(0 if isinstance(phase, dict) and {"status", "artifacts", "tests"}.issubset(phase) else 1)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-05D met' || echo 'RED - PH-05D not complete') =="
exit "$fail"
