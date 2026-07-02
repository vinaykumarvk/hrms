#!/usr/bin/env bash
# PH-05C oracle: P01 workflow operations UI and minimum workflow config UI.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-05C exit-criteria (workflow UI) =="

bash docs/spec/pipeline/checks/ph-05b.sh && grn "PH-05B regression passed" || red "PH-05B regression failed"

need_file docs/spec/pipeline/prompts/PH-05C.md 1000
need_file apps/web/src/workflow/Inbox.tsx 1000
need_file apps/web/src/workflow/TaskDetail.tsx 1000
need_file apps/web/src/workflow/TaskActionPanel.tsx 1000
need_file apps/web/src/workflow/WorkflowConfigConsole.tsx 1000
need_file apps/web/src/workflow/workflowConfigModel.ts 1000
need_file apps/web/test/ph05-workflow.test.cjs 1000

workflow="$(find apps/web/src/workflow -name '*.ts' -o -name '*.tsx' 2>/dev/null | xargs cat 2>/dev/null || true)"
for marker in "approve" "reject" "send-back" "delegate" "cancel" "query" "advance" "mandatory reason" "audit history"; do
  echo "$workflow" | grep -qi "$marker" && grn "workflow marker: $marker" || red "missing workflow marker: $marker"
done
for marker in "YAML" "validate" "simulate" "submit for review" "publish" "maker-checker" "evidence export"; do
  echo "$workflow" | grep -qi "$marker" && grn "config marker: $marker" || red "missing config marker: $marker"
done

python3 - <<'PY' && grn "pipeline manifest wires PH-05C after PH-05B" || red "PH-05C missing from pipeline"
import yaml, sys
phase = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}.get("PH-05C")
sys.exit(0 if phase and phase.get("gate") == "auto" and phase.get("depends_on") == ["PH-05B"] else 1)
PY

if rg -n "\\bany\\b|as any|console\\.log|localhost" apps/web >/tmp/ph05c-hygiene.log 2>&1; then
  red "PH-05C hygiene failed"
  sed -n '1,80p' /tmp/ph05c-hygiene.log
else
  grn "PH-05C hygiene scan clean"
fi

if npm run web:check; then grn "npm run web:check passed"; else red "npm run web:check failed"; fi

python3 - <<'PY' && grn "manifest records PH-05C" || red "manifest missing PH-05C"
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-05C")
sys.exit(0 if isinstance(phase, dict) and {"status", "artifacts", "tests"}.issubset(phase) else 1)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-05C met' || echo 'RED - PH-05C not complete') =="
exit "$fail"
