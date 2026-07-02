#!/usr/bin/env bash
# PH-08A oracle: statutory wave plan, contract markers, and pipeline wiring.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-08A exit-criteria (statutory wave plan + pipeline wiring) =="

need_file docs/spec/ph-08-statutory-administration-wave-plan.md 1200
for id in PH-08A PH-08B PH-08C PH-08D PH-08E PH-08F; do
  need_file "docs/spec/pipeline/prompts/$id.md" 500
done

for module in G05 G06 G07 G08 G09; do
  grep -q "x-ph08-statutory-wave" "docs/contracts/openapi/$module.yaml" && grn "$module OpenAPI PH-08 marker" || red "missing $module PH-08 marker"
done

python3 - <<'PY' && grn "pipeline wires PH-08A..PH-08F as auto gates" || red "PH-08 pipeline wiring invalid"
import sys, yaml
phases = {p.get("id"): p for p in yaml.safe_load(open("docs/spec/pipeline/phases.yaml")).get("phases", [])}
expected = {
    "PH-08A": ["PH-07E"],
    "PH-08B": ["PH-08A"],
    "PH-08C": ["PH-08B"],
    "PH-08D": ["PH-08C"],
    "PH-08E": ["PH-08D"],
    "PH-08F": ["PH-08E"],
}
for phase_id, deps in expected.items():
    phase = phases.get(phase_id)
    if not phase or phase.get("gate") != "auto" or phase.get("depends_on") != deps:
        sys.exit(1)
sys.exit(0)
PY

echo "== $([ "$fail" -eq 0 ] && echo 'GREEN - PH-08A met' || echo 'RED - PH-08A not complete') =="
exit "$fail"
