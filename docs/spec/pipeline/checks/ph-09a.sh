#!/usr/bin/env bash
# PH-09A oracle: payroll/pension wave plan, contract markers, and pipeline wiring.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-09A exit-criteria (payroll/pension wave plan + pipeline wiring) =="

need_file docs/spec/ph-09-payroll-pension-wave-plan.md 1800
for id in PH-09A PH-09B PH-09C PH-09D PH-09E; do
  need_file "docs/spec/pipeline/prompts/$id.md" 500
done

for module in G10 G11; do
  grep -q "x-ph09-compensation-wave" "docs/contracts/openapi/$module.yaml" && grn "$module OpenAPI PH-09 marker" || red "missing $module PH-09 marker"
done

python3 - <<'PY' && grn "pipeline wires PH-09A..PH-09E as auto gates" || red "PH-09 pipeline wiring invalid"
import sys, yaml
phases = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}
expected = {
    "PH-09A": ["PH-08F"],
    "PH-09B": ["PH-09A"],
    "PH-09C": ["PH-09B"],
    "PH-09D": ["PH-09C"],
    "PH-09E": ["PH-09D"],
}
for phase_id, deps in expected.items():
    phase = phases.get(phase_id)
    if not phase or phase.get("gate") != "auto" or phase.get("depends_on") != deps:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-09A met' || echo 'RED - PH-09A not complete') =="
exit "$fail"
