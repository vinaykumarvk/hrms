#!/usr/bin/env bash
# PH-05E oracle: UI conformance and review packet.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-05E exit-criteria (UI conformance + review packet) =="

bash docs/spec/pipeline/checks/ph-05d.sh && grn "PH-05D regression passed" || red "PH-05D regression failed"

need_file docs/spec/pipeline/prompts/PH-05E.md 1000
need_file apps/web/test/ph05-ui-conformance.test.cjs 1500
need_file docs/spec/ph-05-verdict.md 1500

python3 - <<'PY' && grn "pipeline manifest wires PH-05E as human gate after PH-05D" || red "PH-05E missing/human gate not configured"
import yaml, sys
phase = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}.get("PH-05E")
sys.exit(0 if phase and phase.get("gate") == "human" and phase.get("depends_on") == ["PH-05D"] else 1)
PY

for marker in "HRMS shell" "workspace" "inbox" "task" "workflow config" "G01" "G12" "G13" "fixture" "accessibility" "PH-06"; do
  grep -qi "$marker" docs/spec/ph-05-verdict.md 2>/dev/null && grn "verdict marker: $marker" || red "missing verdict marker: $marker"
done

if rg -n "\\bany\\b|as any|console\\.log|localhost" apps/web >/tmp/ph05e-hygiene.log 2>&1; then
  red "PH-05E hygiene failed"
  sed -n '1,80p' /tmp/ph05e-hygiene.log
else
  grn "PH-05E hygiene scan clean"
fi

if npm run web:check; then grn "npm run web:check passed"; else red "npm run web:check failed"; fi
if npm run check; then grn "npm run check passed"; else red "npm run check failed"; fi

python3 - <<'PY' && grn "manifest records PH-05E" || red "manifest missing PH-05E"
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-05E")
sys.exit(0 if isinstance(phase, dict) and {"status", "artifacts", "tests"}.issubset(phase) else 1)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-05E met' || echo 'RED - PH-05E not complete') =="
exit "$fail"
