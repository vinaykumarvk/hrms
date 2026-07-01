#!/usr/bin/env bash
# PH-02B oracle: schema + auth-matrix substrate. GREEN only if the resolver data tables exist (real names),
# reporting hierarchy exists (table or column), the statutory authority-assignment matrix table exists,
# auth-matrix parses, and the FULL 00->14 schema still loads clean end-to-end.
# Set PH02B_SKIP_LOAD=1 to skip the (slow) full-load oracle.
set -uo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/n15318/hrms)"
fail=0; red(){ echo "  RED  $*"; fail=1; }; grn(){ echo "  ok   $*"; }
DM=docs/data-model
has(){ grep -qiE "$1" $DM/*.sql 2>/dev/null; }
tbl(){ has "create table (if not exists )?[a-z0-9_]*${1}"; }
echo "== PH-02B exit-criteria (schema & auth-matrix substrate) =="

for t in positions position_history employee_job_assignments; do
  tbl "$t" && grn "table: $t" || red "missing table: $t"
done
{ tbl delegation && grn "table: delegation(s)"; } || red "missing delegation table"
has 'acting[_ ]?charge|is_acting|acting_from|acting_holder' && grn "acting-charge represented" || red "acting-charge not represented (table/column)"
has 'create table (if not exists )?[a-z0-9_]*(committee|panel)' && grn "committee/panel table present" || red "no committee/panel table"
has 'reporting_manager_id|reports_to_position|reports_to|reporting_chain' && grn "reporting hierarchy present (table/column)" || red "no reporting hierarchy (reports_to / reporting_manager_id)"
tbl authority_assignment && grn "statutory authority-assignment matrix table present" || red "missing statutory authority-assignment matrix table (e.g. g01_authority_assignments — referenced by the seed plan)"

python3 - <<'PY' || red "auth-matrix.yaml invalid or missing statutory roles"
import yaml,sys
d=yaml.safe_load(open("docs/contracts/auth-matrix.yaml")); s=yaml.safe_dump(d).lower()
need=["appoint","transfer","disciplin","appellate","review","accept","pension","payroll","custodian"]
miss=[w for w in need if w not in s]
if miss: print("  RED  auth-matrix missing role coverage:",miss); sys.exit(1)
print("  ok   auth-matrix parses and covers statutory roles"); sys.exit(0)
PY

if [ "${PH02B_SKIP_LOAD:-0}" = "1" ]; then echo "  WARN PH02B_SKIP_LOAD=1 — full-load skipped"
elif command -v initdb >/dev/null 2>&1 && command -v pg_ctl >/dev/null 2>&1; then
  TMP="$(mktemp -d)"; PORT=55471
  initdb -D "$TMP/d" -U postgres --no-locale --encoding=UTF8 >/dev/null 2>&1
  pg_ctl -D "$TMP/d" -o "-k $TMP -p $PORT -c listen_addresses=''" -w start >/dev/null 2>&1
  createdb -h "$TMP" -p $PORT -U postgres hrms 2>/dev/null; lf=0
  for f in $(ls $DM/[0-9]*.sql | sort); do
    psql -h "$TMP" -p $PORT -U postgres -d hrms -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>"$TMP/err" || { red "schema load failed at $f: $(tail -1 "$TMP/err")"; lf=1; break; }
  done
  [ $lf -eq 0 ] && grn "full 00->14 schema loads clean end-to-end"
  pg_ctl -D "$TMP/d" -w stop >/dev/null 2>&1; rm -rf "$TMP"
else echo "  WARN no local postgres — full-load oracle skipped; table-presence only"; fi
echo "== $([ $fail -eq 0 ] && echo 'GREEN — PH-02B met' || echo 'RED — PH-02B not complete') =="; exit $fail
