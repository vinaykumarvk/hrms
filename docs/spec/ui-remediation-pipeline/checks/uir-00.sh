#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
echo "== UIR-00 conflict and envelope oracle =="
for f in \
  docs/spec/ui-remediation/design-system-decision.md \
  docs/spec/ui-remediation/route-workspace-contract.md \
  docs/spec/ui-remediation/auth-action-contract-decisions.md \
  docs/spec/ui-remediation/critical-journey-acceptance.md \
  docs/spec/ui-remediation/finding-closure-ledger.yaml; do need_file "$f" 300; done
python3 - <<'PY' || red "closure ledger invalid"
import yaml
p='docs/spec/ui-remediation/finding-closure-ledger.yaml'
d=yaml.safe_load(open(p))
rows=d.get('findings',[])
ids=[r.get('id') for r in rows]
want=[f'UI-{i:02d}' for i in range(1,29)]
assert sorted(ids)==want and len(ids)==len(set(ids)), (ids,want)
required={'id','source_evidence','disposition','blocking_gate','affected_personas','affected_journeys','expected_files','automated_tests','manual_evidence','viewport_matrix','theme_matrix','authorization_negative_cases','rollback_trigger','owner','target_date','closure_status'}
for row in rows:
    missing=required-set(row)
    assert not missing,(row.get('id'),missing)
print('  ok   UI-01..UI-28 closure schema')
PY
finish
