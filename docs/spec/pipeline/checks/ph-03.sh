#!/usr/bin/env bash
# Exit-criteria for PH-03 (core platform services and systems of record).
# GREEN only if PH-02 remains green, PH-03 service code builds/tests, security hygiene holds, and
# manifest/dependency evidence records the foundation-service boundary.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-03 exit-criteria =="

need_file package.json 400
need_file tsconfig.json 200
need_file apps/api/src/platform/foundationServices.ts 500
need_file apps/api/src/platform/authority-resolution/authorityResolutionService.ts 2000
need_file apps/api/src/modules/g01/employeeMasterService.ts 1000
need_file apps/api/src/modules/g12/serviceRegisterService.ts 1500
need_file apps/api/src/modules/g13/documentVaultService.ts 1000
need_file apps/api/src/platform/workflow/hrmsWorkflowService.ts 1000
need_file apps/api/src/jobs/jobService.ts 500
need_file apps/api/src/notifications/notificationService.ts 500
need_file apps/api/src/migration/staging/migrationStagingService.ts 800
need_file apps/api/src/security/foundationServiceRegistry.ts 500
need_file apps/api/test/ph03-foundation.test.cjs 2000
need_file docs/tests/foundation-services-tests.md 500
need_file docs/spec/pipeline/prompts/PH-03.md 500

python3 - <<'PY' && echo "  ok   pipeline manifest wires PH-03 as gate:auto after PH-02" || { echo "  RED  PH-03 missing from pipeline phases"; fail=1; }
import yaml, sys
data = yaml.safe_load(open("docs/spec/pipeline/phases.yaml"))
phase = {p.get("id"): p for p in data.get("phases", [])}.get("PH-03")
if not phase:
    sys.exit(1)
if phase.get("gate") != "auto" or phase.get("depends_on") != ["PH-02"]:
    sys.exit(1)
if phase.get("exit_criteria") != "bash docs/spec/pipeline/checks/ph-03.sh":
    sys.exit(1)
PY

python3 - <<'PY' && echo "  ok   package records local workflow-platform path dependencies" || { echo "  RED  workflow-platform path dependencies missing"; fail=1; }
import json, sys
pkg = json.load(open("package.json"))
deps = pkg.get("dependencies", {})
required = [
    "@hrms-workflow/workflow-core",
    "@hrms-workflow/workflow-postgres",
    "@hrms-workflow/workflow-config",
    "@hrms-workflow/workflow-resolvers",
    "@hrms-workflow/adapters-hrms",
]
if any(not str(deps.get(dep, "")).startswith("file:../workflow-platform/") for dep in required):
    sys.exit(1)
PY

python3 - <<'PY' && echo "  ok   dependency register records PH-03 foundation boundary" || { echo "  RED  dependency register missing PH-03 boundary"; fail=1; }
import yaml, sys
data = yaml.safe_load(open("docs/contracts/dependency-register.yaml"))
shared = data.get("shared_contracts", {})
record = shared.get("ph03_foundation_services")
if not record:
    sys.exit(1)
for key in ["g01_employee_master", "g12_sr_ingestion", "g13_document_vault", "p01_workflow_adapter"]:
    if key not in record.get("service_boundaries", {}):
        sys.exit(1)
PY

if rg -n "\\bany\\b|as any|console\\.log" apps/api/src apps/api/test >/tmp/ph03-hygiene.log 2>&1; then
  red "TypeScript hygiene failed: any/as any/console.log found"
  sed -n '1,80p' /tmp/ph03-hygiene.log
else
  grn "TypeScript hygiene scan clean"
fi

if bash docs/spec/pipeline/checks/ph-02.sh; then
  grn "PH-02 regression gate passed"
else
  red "PH-02 regression gate failed"
fi

if npm run check; then
  grn "PH-03 TypeScript typecheck/build/tests passed"
else
  red "PH-03 npm check failed"
fi

python3 - <<'PY' && echo "  ok   G01/G12/G13 OpenAPI contracts parse" || { echo "  RED  G01/G12/G13 OpenAPI contracts invalid"; fail=1; }
import yaml
for path in ["docs/contracts/openapi/G01.yaml", "docs/contracts/openapi/G12.yaml", "docs/contracts/openapi/G13.yaml"]:
    yaml.safe_load(open(path))
PY

if [ -f docs/spec/manifest.json ]; then
  python3 - <<'PY' && echo "  ok   manifest.json contains structural PH-03 phase record" || { echo "  RED  manifest.json missing structural PH-03 phase record"; fail=1; }
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-03")
required = {"status", "gate_verdict", "artifacts", "tests"}
sys.exit(0 if isinstance(phase, dict) and required.issubset(phase.keys()) else 1)
PY
else
  red "docs/spec/manifest.json missing"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN - PH-03 exit-criteria met' || echo 'RED - PH-03 not complete') =="
exit $fail
