#!/usr/bin/env bash
source "$(dirname "$0")/lib.sh"
echo "== UIR-07 module migration oracle =="
run node --test apps/web/test/ui-remediation-modules.test.cjs
run npm run web:check
python3 - <<'PY' || red "finding ledger not disposition-complete"
import yaml
d=yaml.safe_load(open('docs/spec/ui-remediation/finding-closure-ledger.yaml'))
allowed={'closed','partial','deferred','rejected','merged_closed'}
bad=[(r.get('id'),r.get('closure_status')) for r in d['findings'] if r.get('closure_status') not in allowed]
assert not bad,bad
print('  ok   all finding dispositions complete')
PY
finish
