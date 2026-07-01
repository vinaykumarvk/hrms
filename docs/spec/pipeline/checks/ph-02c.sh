#!/usr/bin/env bash
# PH-02C oracle: seed-data plan + authority fixtures for G03/G05, incl. the six hard resolver cases.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }
echo "== PH-02C exit-criteria (seed data & fixtures) =="
need_file docs/spec/hrms-seed-data-plan.yaml 600
python3 - <<'PY' || red "seed-data plan invalid or fixtures table wrong"
import yaml,sys
s=yaml.safe_load(open("docs/spec/hrms-seed-data-plan.yaml"))
tbl=(((s.get("fixtures") or {}).get("statutory_authority") or {}).get("table"))
if tbl!="g01_authority_assignments":
    print(f"  RED  fixtures.statutory_authority.table={tbl!r}, expected g01_authority_assignments"); sys.exit(1)
print("  ok   seed plan parses; statutory_authority fixture table correct"); sys.exit(0)
PY
blob="$(cat docs/spec/hrms-seed-data-plan.yaml docs/tests/authority-resolution-tests.md 2>/dev/null | tr '[:lower:]' '[:upper:]')"
# indexed array of "label::pattern" (bash 3.2 has no associative arrays)
cases="vacant_manager::VACAN delegated_manager::DELEGAT acting_charge::ACTING conflict_of_interest::CONFLICT|COI|RECUS cross_entity::CROSS.?ENTITY|CROSS.?TENANT|MULTI.?ENTITY|CROSS.?ORG historical_correction::HISTORIC|CORRECTION|AS.?OF|POINT.?IN.?TIME"
for entry in $cases; do
  name="${entry%%::*}"; pat="${entry#*::}"
  echo "$blob" | grep -qiE "$pat" && grn "fixture case: $name" || red "missing fixture case: $name"
done
echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-02C met' || echo 'RED — PH-02C not complete') =="; exit $fail
