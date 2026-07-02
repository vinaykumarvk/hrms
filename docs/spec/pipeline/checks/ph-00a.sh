#!/usr/bin/env bash
# Exit-criteria for PH-00A. Prints reasons; exits 0 (GREEN) only if every check passes.
# This runs OUTSIDE the model — it is the independent oracle, not the agent's self-assessment.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

PIN="cadf39739e6f27c17d44767ca61d1a362034ac64"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }

need_file(){ # path minbytes
  if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi
}

echo "== PH-00A exit-criteria =="

# 1) Required evidence artifacts exist and are non-trivial
need_file docs/spec/puda-vs-hrms-capability-gap.md 2000
need_file docs/spec/ph-00-candidate-set-reconciliation.md 1000
need_file docs/spec/puda-workflow-inventory.yaml 500
need_file docs/spec/puda-workflow-provenance-map.md 300
need_file docs/spec/puda-golden-behavior-baseline.md 300
need_file docs/spec/workflow-extraction-risk-register.md 200
need_file docs/spec/ph-00a-verdict.md 300
need_file docs/spec/manifest.json 2

# 2) Inventory parses as YAML and reconciles candidate/golden/adapter classification counts
if [ -f docs/spec/puda-workflow-inventory.yaml ]; then
  python3 - <<'PY' || red "inventory yaml failed parse/reconcile"
import sys,yaml,glob
try:
    d=yaml.safe_load(open("docs/spec/puda-workflow-inventory.yaml"))
except Exception as e:
    print("  RED  inventory parse error:",e); sys.exit(1)
counts=d.get("counts") or {}
pairs=[
    ("expanded_candidate_paths","count_classified_candidate_paths"),
    ("golden_test_paths","count_classified_golden_paths"),
    ("adapter_only_or_excluded_patterns","count_classified_adapter_patterns"),
]
for left,right in pairs:
    if counts.get(left) != counts.get(right):
        print(f"  RED  inventory {left}({counts.get(left)}) != {right}({counts.get(right)})")
        sys.exit(1)
if counts.get("missing_paths") != 0:
    print(f"  RED  inventory missing_paths({counts.get('missing_paths')}) != 0")
    sys.exit(1)
group_sum=sum((g or {}).get("count",0) for g in (d.get("classified_candidate_groups") or {}).values())
if group_sum != counts.get("expanded_candidate_paths"):
    print(f"  RED  inventory group count sum({group_sum}) != expanded_candidate_paths({counts.get('expanded_candidate_paths')})")
    sys.exit(1)
print(f"  ok   inventory parses and reconciles: candidates={counts.get('expanded_candidate_paths')}, golden={counts.get('golden_test_paths')}, adapter={counts.get('adapter_only_or_excluded_patterns')}")
sys.exit(0)
PY
fi

# 3) Golden baseline pins the exact PUDA commit
if [ -f docs/spec/puda-golden-behavior-baseline.md ]; then
  grep -q "$PIN" docs/spec/puda-golden-behavior-baseline.md \
    && grn "golden baseline pins commit ${PIN:0:12}" \
    || red "golden baseline does not record pinned commit ${PIN:0:12}"
fi

# 4) manifest.json records a PH-00A verdict
if [ -f docs/spec/manifest.json ]; then
  python3 - <<'PY' || red "manifest.json missing PH-00A verdict"
import json,sys
try: m=json.load(open("docs/spec/manifest.json"))
except Exception as e: print("  RED  manifest parse error:",e); sys.exit(1)
s=json.dumps(m)
sys.exit(0 if "PH-00A" in s else 1)
PY
  [ $? -eq 0 ] && grn "manifest.json references PH-00A"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-00A exit-criteria met' || echo 'RED — PH-00A not complete') =="
exit $fail
