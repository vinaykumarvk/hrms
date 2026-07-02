#!/usr/bin/env bash
# PH-05B oracle: shell, workspaces, route guard, and operational states.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-05B exit-criteria (HRMS shell) =="

bash docs/spec/pipeline/checks/ph-05a.sh && grn "PH-05A regression passed" || red "PH-05A regression failed"

need_file docs/spec/pipeline/prompts/PH-05B.md 1000
need_file apps/web/src/app/AppShell.tsx 1000
need_file apps/web/src/app/WorkspaceSwitcher.tsx 700
need_file apps/web/src/app/navigation.ts 600
need_file apps/web/src/app/RouteGuard.tsx 700
need_file apps/web/src/app/OperationalStates.tsx 1000
need_file apps/web/test/ph05-shell.test.cjs 1000

shell="$(find apps/web/src/app -name '*.ts' -o -name '*.tsx' 2>/dev/null | xargs cat 2>/dev/null || true)"
for marker in "Me" "My Team" "Admin" "Inbox" "Employees" "Service Register" "Documents" "Workflow Config"; do
  echo "$shell" | grep -q "$marker" && grn "shell marker: $marker" || red "missing shell marker: $marker"
done
for marker in "loading" "empty" "error" "no-permission" "partial-data" "route guard"; do
  echo "$shell" | grep -qi "$marker" && grn "state/guard marker: $marker" || red "missing state/guard marker: $marker"
done

python3 - <<'PY' && grn "pipeline manifest wires PH-05B after PH-05A" || red "PH-05B missing from pipeline"
import yaml, sys
phase = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}.get("PH-05B")
sys.exit(0 if phase and phase.get("gate") == "auto" and phase.get("depends_on") == ["PH-05A"] else 1)
PY

if rg -n "\\bany\\b|as any|console\\.log|localhost" apps/web >/tmp/ph05b-hygiene.log 2>&1; then
  red "PH-05B hygiene failed"
  sed -n '1,80p' /tmp/ph05b-hygiene.log
else
  grn "PH-05B hygiene scan clean"
fi

if npm run web:check; then grn "npm run web:check passed"; else red "npm run web:check failed"; fi

python3 - <<'PY' && grn "manifest records PH-05B" || red "manifest missing PH-05B"
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-05B")
sys.exit(0 if isinstance(phase, dict) and {"status", "artifacts", "tests"}.issubset(phase) else 1)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-05B met' || echo 'RED - PH-05B not complete') =="
exit "$fail"
