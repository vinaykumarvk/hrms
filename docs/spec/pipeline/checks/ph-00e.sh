#!/usr/bin/env bash
# Exit-criteria for PH-00E (PUDA and HRMS conformance proof; PH-00 gate).
# GREEN only if the workflow-platform conformance packages build/test, PUDA-shape and HRMS synthetic adapter
# tests pass, prior PH-00 executable gates remain green, PH-00 evidence is present, and no PUDA runtime behavior
# files changed.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

PUDA="/Users/n15318/PUDA_workflow_engine"
WFP="/Users/n15318/workflow-platform"
PIN="cadf39739e6f27c17d44767ca61d1a362034ac64"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-00E exit-criteria =="

need_file "$WFP/packages/adapters-puda/src/conformance.ts" 200
need_file "$WFP/packages/adapters-puda/test/conformance.test.ts" 100
need_file "$WFP/packages/adapters-hrms/src/synthetic-flow.ts" 300
need_file "$WFP/packages/adapters-hrms/test/synthetic-flow.test.ts" 100
need_file docs/spec/workflow-conformance-suite.md 300
need_file docs/spec/migration-coexistence-inventory.md 300
need_file docs/spec/ph-00-gate-verdict.md 300

python3 - <<'PY' && grn "pipeline manifest uses agentic gates for PH-00A..PH-00E" || red "pipeline manifest gate policy invalid"
import sys, yaml
data = yaml.safe_load(open("docs/spec/pipeline/phases.yaml"))
if data.get("gate_policy", {}).get("model") != "agentic_by_default":
    sys.exit(1)
phases = {phase.get("id"): phase for phase in data.get("phases", [])}
for phase_id in ["PH-00A", "PH-00B", "PH-00C", "PH-00D", "PH-00E"]:
    phase = phases.get(phase_id)
    if not phase or phase.get("gate") != "auto" or not str(phase.get("exit_criteria", "")).startswith("bash "):
        sys.exit(1)
sys.exit(0)
PY

if [ -d "$WFP" ]; then
  echo "  .. running workflow-platform check"
  if ( cd "$WFP" && npm run check ); then
    grn "workflow-platform typecheck/build/tests passed"
  else
    red "workflow-platform check failed"
  fi

  echo "  .. running focused adapter conformance tests"
  if ( cd "$WFP" && npm --workspace @hrms-workflow/adapters-puda run test ); then
    grn "PUDA adapter shape conformance passed"
  else
    red "PUDA adapter shape conformance failed"
  fi
  if ( cd "$WFP" && npm --workspace @hrms-workflow/adapters-hrms run test ); then
    grn "HRMS synthetic workflow conformance passed"
  else
    red "HRMS synthetic workflow conformance failed"
  fi

  if rg -n "PUDA|LAC|LOI|letter of intent|Letter of Intent|allottee|lac_" \
    "$WFP/packages/workflow-core/src" "$WFP/packages/workflow-postgres/src" \
    "$WFP/packages/workflow-config/src" "$WFP/packages/workflow-resolvers/src" \
    "$WFP/packages/adapters-hrms/src" >/tmp/ph00e-domain-leaks.txt 2>/dev/null; then
    red "domain leakage scan found blocked terms:"
    sed -n '1,60p' /tmp/ph00e-domain-leaks.txt
  else
    grn "domain leakage scan clean for reusable packages and HRMS adapter"
  fi
fi

echo "  .. running prior PH-00 regression gates"
if bash docs/spec/pipeline/checks/ph-00b.sh; then
  grn "PH-00B regression gate passed"
else
  red "PH-00B regression gate failed"
fi
if bash docs/spec/pipeline/checks/ph-00d.sh; then
  grn "PH-00D regression gate passed"
else
  red "PH-00D regression gate failed"
fi

if [ -f docs/spec/manifest.json ]; then
  python3 - <<'PY' && grn "manifest.json contains structural PH-00E phase record" || red "manifest.json missing structural PH-00E phase record"
import json, sys
try:
    manifest = json.load(open("docs/spec/manifest.json"))
except Exception:
    sys.exit(1)
phase = manifest.get("phases", {}).get("PH-00E")
if not isinstance(phase, dict):
    sys.exit(1)
required = {"status", "gate_verdict", "artifacts", "tests"}
sys.exit(0 if required.issubset(phase.keys()) else 1)
PY
else
  red "docs/spec/manifest.json missing"
fi

if [ -d "$PUDA/.git" ]; then
  head="$(git -C "$PUDA" rev-parse HEAD 2>/dev/null || true)"
  if [ "$head" = "$PIN" ]; then
    grn "PUDA pinned commit ${PIN:0:12}"
  else
    red "PUDA HEAD is ${head:-unknown}, expected ${PIN:0:12}"
  fi
  if git -C "$PUDA" status --porcelain -- apps/api/src/workflow.ts apps/api/src/tasks.ts 2>/dev/null | grep -q .; then
    red "PUDA core workflow.ts/tasks.ts show local changes"
  else
    grn "PUDA core workflow files unmodified"
  fi
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN - PH-00E exit-criteria met' || echo 'RED - PH-00E not complete') =="
exit $fail
