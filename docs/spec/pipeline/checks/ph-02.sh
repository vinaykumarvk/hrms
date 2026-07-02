#!/usr/bin/env bash
# Exit-criteria for PH-02 (HRMS hierarchy/authority fixture substrate).
# GREEN only if authority contracts parse, schema contains the resolver data substrates, auth matrix covers G03/G05,
# full schema loads, and fixture queries prove reporting-chain, statutory-authority, delegation, and committee data.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"

fail=0
red(){ echo "  RED  $*"; fail=1; }
grn(){ echo "  ok   $*"; }
need_file(){ if [ -s "$1" ] && [ "$(wc -c < "$1")" -ge "${2:-1}" ]; then grn "$1"; else red "missing/too-small: $1"; fi; }

echo "== PH-02 exit-criteria =="

need_file docs/spec/hrms-authority-model.yaml 800
need_file docs/spec/hrms-seed-data-plan.yaml 600
need_file docs/tests/authority-resolution-tests.md 400
need_file docs/spec/pipeline/prompts/PH-02.md 300

python3 - <<'PY' && grn "PH-02 YAML artifacts parse and cover G03/G05" || red "PH-02 YAML artifacts invalid"
import yaml, sys
model = yaml.safe_load(open("docs/spec/hrms-authority-model.yaml"))
seed = yaml.safe_load(open("docs/spec/hrms-seed-data-plan.yaml"))
required_resolvers = {"REPORTING_CHAIN", "STATUTORY_AUTHORITY", "ORG_UNIT_HEAD", "COMMITTEE"}
if not required_resolvers.issubset(set((model.get("resolver_types") or {}).keys())):
    sys.exit(1)
vertical = model.get("vertical_slice_bindings") or {}
if not {"G03_leave", "G05_transfer"}.issubset(vertical):
    sys.exit(1)
if seed.get("fixtures", {}).get("statutory_authority", {}).get("table") != "g01_authority_assignments":
    sys.exit(1)
for path in ["docs/contracts/auth-matrix.yaml", "docs/contracts/state-machines.yaml", "docs/spec/authority-resolution-contract.yaml"]:
    yaml.safe_load(open(path))
PY

python3 - <<'PY' && grn "pipeline manifest wires PH-02 as gate:auto after PH-01" || red "PH-02 missing from pipeline phases"
import yaml, sys
data = yaml.safe_load(open("docs/spec/pipeline/phases.yaml"))
phase = {p.get("id"): p for p in data.get("phases", [])}.get("PH-02")
if not phase:
    sys.exit(1)
if phase.get("gate") != "auto" or phase.get("depends_on") != ["PH-01"]:
    sys.exit(1)
if phase.get("exit_criteria") != "bash docs/spec/pipeline/checks/ph-02.sh":
    sys.exit(1)
PY

python3 - <<'PY' && grn "schema/contracts contain PH-02 authority substrates" || red "schema/contracts missing PH-02 substrates"
from pathlib import Path
sql = Path("docs/data-model/01-G01-employee-profile.sql").read_text()
required_sql = [
    "CREATE TABLE g01_authority_assignments",
    "CREATE TABLE g01_authority_delegations",
    "CREATE TABLE g01_committees",
    "CREATE TABLE g01_committee_members",
    "'g01_authority_assignments'",
    "'g01_committee_members'",
    "G05_TRANSFER_REVENUE",
    "G03_LEAVE_HEAD_ASSESSMENT",
]
if any(item not in sql for item in required_sql):
    raise SystemExit(1)
g06 = Path("docs/data-model/06-G06-promotion-posting-progression.sql").read_text()
g09 = Path("docs/data-model/09-G09-disciplinary-punishment.sql").read_text()
if "ck_g06_panel_quorum" not in g06 or "ck_g06_pm_recusal" not in g06:
    raise SystemExit(1)
if "ck_inquiry_appointment_recusal" not in g09 or "PH-02 statutory-authority resolver input" not in g09:
    raise SystemExit(1)
auth = Path("docs/contracts/auth-matrix.yaml").read_text()
for item in ["ph02_authority_fixture_contract", "G03_leave", "G05_transfer", "g01_authority_assignments"]:
    if item not in auth:
        raise SystemExit(1)
PY

if bash docs/spec/pipeline/checks/ph-01.sh; then
  grn "PH-01 regression gate passed"
else
  red "PH-01 regression gate failed"
fi

run_fixture_queries() {
  if ! command -v initdb >/dev/null 2>&1 || ! command -v pg_ctl >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1; then
    red "PostgreSQL client/server tools not available for PH-02 fixture load"
    return
  fi
  echo "  .. running disposable PostgreSQL PH-02 fixture load"
  export LC_ALL=C
  local tmpdir dbdir log port
  tmpdir="$(mktemp -d /tmp/hrms-ph02-schema.XXXXXX)"
  dbdir="$tmpdir/db"
  log="$tmpdir/postgres.log"
  port="$(python3 - <<'PY'
import socket
s=socket.socket()
s.bind(("127.0.0.1",0))
print(s.getsockname()[1])
s.close()
PY
)"
  if ! initdb -D "$dbdir" >/tmp/ph02-initdb.log 2>&1; then red "initdb failed"; sed -n '1,80p' /tmp/ph02-initdb.log; return; fi
  if ! pg_ctl -D "$dbdir" -o "-p $port -k $tmpdir" -l "$log" start >/tmp/ph02-pg-start.log 2>&1; then red "pg_ctl start failed"; sed -n '1,80p' "$log"; return; fi
  if ! createdb -h "$tmpdir" -p "$port" hrms_ph02 >/tmp/ph02-createdb.log 2>&1; then red "createdb failed"; pg_ctl -D "$dbdir" -m fast stop >/tmp/ph02-pg-stop.log 2>&1 || true; return; fi

  local load_ok=1
  for f in docs/data-model/[0-9][0-9]-*.sql; do
    if ! psql -h "$tmpdir" -p "$port" -d hrms_ph02 -v ON_ERROR_STOP=1 -f "$f" >/tmp/ph02-load-"$(basename "$f")".log 2>&1; then
      load_ok=0
      red "schema load failed at $(basename "$f")"
      sed -n '1,100p' /tmp/ph02-load-"$(basename "$f")".log
      break
    fi
  done
  if [ "$load_ok" = 1 ]; then
    grn "full 00->14 schema load passed"
    assert_sql "$tmpdir" "$port" "select count(*) from employee_job_assignments where employee_id='99999999-9999-9999-9999-999999999902' and reporting_manager_id='99999999-9999-9999-9999-999999999901';" "1" "G03 reporting-chain fixture"
    assert_sql "$tmpdir" "$port" "select count(*) from positions p join positions mgr on p.reports_to_position_id=mgr.id where p.position_code='POS-REV-AS-05' and mgr.position_code='POS-REV-DC-01';" "1" "reports_to_position fixture"
    assert_sql "$tmpdir" "$port" "select count(*) from g01_authority_assignments where authority_type='TRANSFER_AUTHORITY' and authority_code='G05_TRANSFER_REVENUE' and authority_employee_id='99999999-9999-9999-9999-999999999901' and status='ACTIVE';" "1" "G05 transfer authority fixture"
    assert_sql "$tmpdir" "$port" "select count(*) from g01_authority_assignments where authority_type='ORG_UNIT_HEAD' and authority_code='G03_LEAVE_HEAD_ASSESSMENT' and authority_employee_id='99999999-9999-9999-9999-999999999901' and status='ACTIVE';" "1" "G03 org-unit-head fallback fixture"
    assert_sql "$tmpdir" "$port" "select count(*) from g01_authority_delegations where authority_assignment_id='a1000000-0000-0000-0000-000000000001' and from_employee_id <> to_employee_id and status='ACTIVE';" "1" "delegation/acting-charge fixture"
    assert_sql "$tmpdir" "$port" "select count(*) from g01_committees c where c.committee_code='PH02-DPC-REVENUE' and (select count(*) from g01_committee_members m where m.committee_id=c.id and m.status='ACTIVE' and m.is_required_for_quorum) >= c.quorum_required;" "1" "DPC committee quorum fixture"
    assert_sql "$tmpdir" "$port" "select count(*) from pg_class where relname in ('g01_authority_assignments','g01_authority_delegations','g01_committees','g01_committee_members') and relrowsecurity and relforcerowsecurity;" "4" "PH-02 tables have forced RLS"
    assert_sql "$tmpdir" "$port" "select count(*) from g01_authority_assignments a join g01_authority_assignments b on a.id < b.id and a.tenant_id=b.tenant_id and a.authority_type=b.authority_type and a.authority_code=b.authority_code and daterange(a.effective_from, coalesce(a.effective_to,'infinity'::date),'[]') && daterange(b.effective_from, coalesce(b.effective_to,'infinity'::date),'[]');" "0" "no overlapping authority fixture rows"
  fi
  pg_ctl -D "$dbdir" -m fast stop >/tmp/ph02-pg-stop.log 2>&1 || true
}

assert_sql() {
  local sock="$1" port="$2" sql="$3" expected="$4" label="$5"
  local actual
  actual="$(psql -h "$sock" -p "$port" -d hrms_ph02 -At -v ON_ERROR_STOP=1 -c "$sql" 2>/tmp/ph02-query.err || true)"
  if [ "$actual" = "$expected" ]; then
    grn "$label"
  else
    red "$label expected $expected got ${actual:-<error>}"
    sed -n '1,80p' /tmp/ph02-query.err
  fi
}

run_fixture_queries

if [ -f docs/spec/manifest.json ]; then
  python3 - <<'PY' && grn "manifest.json contains structural PH-02 phase record" || red "manifest.json missing structural PH-02 phase record"
import json, sys
phase = json.load(open("docs/spec/manifest.json")).get("phases", {}).get("PH-02")
required = {"status", "gate_verdict", "artifacts", "tests"}
sys.exit(0 if isinstance(phase, dict) and required.issubset(phase.keys()) else 1)
PY
else
  red "docs/spec/manifest.json missing"
fi

echo "== $([ $fail -eq 0 ] && echo 'GREEN - PH-02 exit-criteria met' || echo 'RED - PH-02 not complete') =="
exit $fail
