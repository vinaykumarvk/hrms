#!/usr/bin/env bash
# Exit-criteria for PH-00C (minimum pure workflow-core extraction).
# GREEN only if workflow-platform builds/tests, PUDA facade conformance consumes the extracted core/test-kit,
# no obvious PUDA/domain identifiers leak into workflow-core, provenance exists, and no PUDA core runtime files changed.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

PUDA="/Users/n15318/PUDA_workflow_engine"
WFP="/Users/n15318/workflow-platform"
PIN="cadf39739e6f27c17d44767ca61d1a362034ac64"
fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-00C exit-criteria =="

need_file "$WFP/package.json" 100
need_file "$WFP/packages/workflow-core/src/index.ts" 50
need_file "$WFP/packages/workflow-test-kit/src/index.ts" 20
need_file docs/spec/workflow-platform-extraction.md 300
need_file docs/spec/ph-00c-verdict.md 200

if [ -d "$WFP" ]; then
  echo "  .. running workflow-platform check"
  if ( cd "$WFP" && npm run check ); then
    grn "workflow-platform typecheck/tests passed"
  else
    red "workflow-platform check failed"
  fi

  if rg -n "PUDA|LAC|LOI|payment|Payment|letter of intent|Letter of Intent|authority_id|authorityId|allottee|lac_" \
    "$WFP/packages/workflow-core/src" "$WFP/packages/workflow-core/test" \
    "$WFP/packages/workflow-test-kit/src" "$WFP/packages/workflow-test-kit/test" >/tmp/ph00c-domain-leaks.txt 2>/dev/null; then
    red "domain leakage scan found blocked terms:"
    sed -n '1,40p' /tmp/ph00c-domain-leaks.txt
  else
    grn "domain leakage scan clean for workflow-core/test-kit source"
  fi
fi

echo "  .. running PUDA facade conformance against extracted core/test-kit"
if bash docs/spec/pipeline/checks/ph-00b-conformance.sh; then
  grn "PUDA facade conformance passed"
else
  red "PUDA facade conformance failed"
fi

if [ -f docs/spec/manifest.json ]; then
  python3 - <<'PY' && grn "manifest.json contains structural PH-00C phase record" || red "manifest.json missing structural PH-00C phase record"
import json,sys
try:
    m=json.load(open("docs/spec/manifest.json"))
except Exception:
    sys.exit(1)
phase=m.get("phases",{}).get("PH-00C")
if not isinstance(phase, dict):
    sys.exit(1)
required={"status","gate_verdict","artifacts","tests"}
sys.exit(0 if required.issubset(phase.keys()) else 1)
PY
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

echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-00C exit-criteria met' || echo 'RED — PH-00C not complete') =="
exit $fail
