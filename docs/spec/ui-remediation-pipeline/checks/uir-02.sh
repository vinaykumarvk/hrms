#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
echo "== UIR-02 deterministic fixture oracle =="
for f in apps/web/test/fixtures/ui-personas.ts apps/web/test/fixtures/ui-workspaces.ts apps/web/test/fixtures/ui-state-controls.ts docs/spec/ui-remediation/gate-acceptance-matrix.yaml docs/spec/ui-remediation/authorization-negative-matrix.yaml; do need_file "$f" 250; done
run node --test apps/web/test/ui-remediation-fixtures.test.cjs
python3 - <<'PY' || red "acceptance matrices invalid"
import yaml
for p in ['docs/spec/ui-remediation/gate-acceptance-matrix.yaml','docs/spec/ui-remediation/authorization-negative-matrix.yaml']:
 d=yaml.safe_load(open(p)); assert d, p
print('  ok   matrices parse')
PY
finish
