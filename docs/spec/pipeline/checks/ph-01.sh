#!/usr/bin/env bash
# Exit-criteria for PH-01 (P01 contract/schema freeze).
# GREEN only if PH-01 contract artifacts exist and parse, P01 runtime schema contradictions are resolved, OpenAPI
# refs resolve, full schema load remains green, and PH-00 conformance still passes.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-01 exit-criteria =="

need_file docs/spec/p01-schema-amendment.yaml 500
need_file docs/spec/authority-resolution-contract.yaml 500
need_file docs/spec/legacy-workflow-coexistence-map.yaml 500
need_file docs/tests/P01-workflow-platform-tests.md 300
need_file docs/spec/pipeline/prompts/PH-01.md 300

python3 - <<'PY' && grn "PH-01 YAML artifacts parse" || red "PH-01 YAML artifacts failed to parse"
import yaml
for path in [
    "docs/spec/p01-schema-amendment.yaml",
    "docs/spec/authority-resolution-contract.yaml",
    "docs/spec/legacy-workflow-coexistence-map.yaml",
    "docs/contracts/state-machines.yaml",
    "docs/contracts/auth-matrix.yaml",
]:
    yaml.safe_load(open(path))
PY

python3 - <<'PY' && grn "P01 OpenAPI refs resolve" || red "P01 OpenAPI invalid or unresolved refs"
import sys, yaml
data = yaml.safe_load(open("docs/contracts/openapi/P01-workflow.yaml"))
if not str(data.get("openapi", "")).startswith("3."):
    sys.exit(1)
refs = []
def walk(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref" and isinstance(value, str) and value.startswith("#/"):
                refs.append(value)
            else:
                walk(value)
    elif isinstance(node, list):
        for item in node:
            walk(item)
walk(data)
for ref in refs:
    cur = data
    for part in ref[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if not isinstance(cur, dict) or part not in cur:
            sys.exit(1)
        cur = cur[part]
PY

python3 - <<'PY' && grn "P01 runtime tables and RLS block present in schema" || red "P01 runtime schema incomplete"
from pathlib import Path
sql = Path("docs/data-model/00-platform-core.sql").read_text()
required = [
    "CREATE TABLE workflow_instances",
    "CREATE TABLE workflow_actions",
    "CREATE TABLE workflow_idempotency_records",
    "CREATE TABLE workflow_resolution_snapshots",
    "CREATE TABLE workflow_tasks",
    "CREATE TABLE workflow_waits",
    "CREATE TABLE workflow_fork_executions",
    "CREATE TABLE workflow_fork_branches",
    "CREATE TABLE workflow_references",
    "'workflow_tasks'",
    "'workflow_resolution_snapshots'",
]
missing = [item for item in required if item not in sql]
raise SystemExit(1 if missing else 0)
PY

python3 - <<'PY' && grn "PH-01 contract records task/action split and resolver errors" || red "PH-01 contract missing required decisions"
import yaml, sys
schema = yaml.safe_load(open("docs/spec/p01-schema-amendment.yaml"))
auth = yaml.safe_load(open("docs/spec/authority-resolution-contract.yaml"))
if schema.get("decision", {}).get("workflow_task_naming") != "workflow_tasks":
    sys.exit(1)
errors = set((auth.get("error_taxonomy") or {}).keys())
required = {"P01_RESOLVER_NOT_RESOLVED", "P01_RESOLVER_AMBIGUOUS", "P01_RESOLVER_SOD_BLOCKED", "P01_DELEGATION_EXPIRED"}
if not required.issubset(errors):
    sys.exit(1)
PY

if rg -n 'use `workflow_actions` \(not `workflow_tasks`\)|not `workflow_tasks`' docs/brd/MODULE_RECONCILIATION.md >/tmp/ph01-stale-task-text.txt 2>/dev/null; then
  red "stale workflow_tasks prohibition remains in MODULE_RECONCILIATION.md"
  sed -n '1,20p' /tmp/ph01-stale-task-text.txt
else
  grn "MODULE_RECONCILIATION task/action contradiction removed"
fi

if rg -n "p01_runtime_contract|authority_resolution_contract" docs/contracts/state-machines.yaml docs/contracts/auth-matrix.yaml >/dev/null 2>&1; then
  grn "state-machine/auth contracts reference PH-01 runtime resolution contracts"
else
  red "state-machine/auth contracts missing PH-01 runtime references"
fi

if bash docs/spec/pipeline/checks/ph-00d.sh; then
  grn "full schema load regression passed"
else
  red "full schema load regression failed"
fi

if bash docs/spec/pipeline/checks/ph-00b.sh; then
  grn "P01 facade/OpenAPI regression passed"
else
  red "P01 facade/OpenAPI regression failed"
fi

if [ -f docs/spec/manifest.json ]; then
  python3 - <<'PY' && grn "manifest.json contains structural PH-01 phase record" || red "manifest.json missing structural PH-01 phase record"
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-01")
required = {"status", "gate_verdict", "artifacts", "tests"}
sys.exit(0 if isinstance(phase, dict) and required.issubset(phase.keys()) else 1)
PY
else
  red "docs/spec/manifest.json missing"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN - PH-01 exit-criteria met' || echo 'RED - PH-01 not complete') =="
exit $fail
